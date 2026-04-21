const { splitPdf, extractTextFromPdf } = require('./processor');
const translator = require('./translator');
const storage = require('./storage');
const glossary = require('./glossary');
const verifier = require('./verifier');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const docxProcessor = require('./docx-processor');
const pdfProcessor = require('./pdf-processor');

const PRICING = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gemini-2.0-flash-lite': { input: 0.0001, output: 0.0004 } // $0.1/1M, $0.4/1M
};

function calculateCost(usage, model = 'gpt-4o') {
    if (!usage) return 0;
    const rates = PRICING[model] || PRICING['gpt-4o'];
    const inputCost = (usage.prompt_tokens / 1000) * rates.input;
    const outputCost = (usage.completion_tokens / 1000) * rates.output;
    return inputCost + outputCost;
}

/**
 * 문서 처리 큐 매니저 (품질 고도화 버전)
 */
async function startProcessing(project, taskQueue, outputDir, options = {}) {
  project.status = 'processing';
  project.subStatus = '대기열에서 작업 시작 중...';
  project.usage = project.usage || { totalTokens: 0, estimatedCost: 0, apiCalls: 0, cacheHits: 0, skipped: 0, model: options.model || 'gpt-4o' };
  
  // 타이머 강제 초기화 (재시동 시에도 작동하도록)
  project.usage.startTime = Date.now();
  project.usage.duration = 0;
  
  storage.saveProject(project);

  for (const file of project.files) {
    if (project.stopRequested) break; // [ADD] Check for stop request
    if (file.status === 'completed') continue;
    file.status = 'processing';
    
    try {
      if (file.mimetype === 'application/pdf') {
        project.subStatus = '문서를 페이지 단위로 분할하는 중...';
        storage.saveProject(project);

        const pages = file.pages.length > 0 ? file.pages : (await splitPdf(file.path, outputDir)).map(p => ({
          id: `${file.id}_p${p.index}`,
          pageNumber: p.index, 
          path: p.path, 
          status: 'pending', 
          originalText: '', 
          translatedText: '', 
          error: null, 
          metrics: {}
        }));
        file.pages = pages;
        file.totalPages = pages.length; // [ADD]
        storage.saveProject(project);

        // ---------------------------------------------------------
        // SLIDING WINDOW CONCURRENCY for PDF
        // ---------------------------------------------------------
        // [Global Sprint] 전체 페이지에서 중복 단어 추출 및 선제적 번역
        const uniqueUnits = extractGlobalUnits(file.pages);
        if (uniqueUnits.length > 0 && !project.stopRequested) {
            project.subStatus = `문서 내 공통 용어 및 문구 분석 중 (${uniqueUnits.length}개)...`;
            storage.saveProject(project);
            
            const translationMap = await processGlobalVocabulary(project, file, uniqueUnits, options);
            hydratePagesWithMap(file, translationMap);
            
            project.subStatus = '페이지별 상세 번역 및 검증 시작...';
            storage.saveProject(project);
        }

        // ---------------------------------------------------------
        // SLIDING WINDOW CONCURRENCY for PDF (기존 누락분 및 복합 문장 처리)
        // ---------------------------------------------------------
        await runInPool(file.pages, 10, async (page) => {
            if (project.stopRequested) return;
            await processSinglePage(project, file, page, options);
        }, project);
      } else if (file.mimetype.startsWith('image/')) {
        // 이미지 처리 로직
        const page = file.pages[0] || { id: `${file.id}_p1`, pageNumber:1, path: file.path, status: 'pending' };
        file.pages = [page];
        file.totalPages = 1; // [ADD]
        page.status = 'processing';
        storage.saveProject(project);
        
        try {
          const base64 = fs.readFileSync(file.path).toString('base64');
          let result;
          
          const targetLanguage = options.targetLangLabel || options.targetLang || 'Korean';
          if (options.model && options.model.startsWith('gemini-')) {
            result = await translator.translateImageWithGemini(base64, targetLanguage, options.geminiApiKey, options);
          } else {
            result = await translator.translateImage(base64, targetLanguage, options);
          }
          
          // 원문 텍스트 추출 보강 (AI가 다른 키를 쓸 경우 대비)
          const extractedOriginal = result.original || result.source || result.original_text || "";
          page.originalText = extractedOriginal; 
          page.translatedText = result.content || result.translated || "";
          page.status = 'completed';
          page.method = 'ai_vision';
          
          const cost = calculateCost(result.usage, 'gpt-4o');
          project.usage.model = 'gpt-4o';
          project.usage.apiCalls++;
          project.usage.totalTokens += (result.usage ? result.usage.total_tokens : 0);
          project.usage.estimatedCost = (Number(project.usage.estimatedCost) || 0) + cost;
          
          // 최종 소요 시간 즉시 업데이트
          project.usage.duration = Math.floor((Date.now() - project.usage.startTime) / 1000);
          
          console.log(`[Vision Success] Page ${page.pageNumber}: original(${extractedOriginal.length} chars), cost($${cost})`);
        } catch (err) {
          page.status = 'failed';
          page.error = err.message;
        }
        storage.saveProject(project);
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Word Support (.docx)
        file.status = 'processing';
        storage.saveProject(project);

        try {
          const result = await mammoth.convertToHtml({ path: file.path });
          const fullHtml = result.value;
          const fullMarkdown = htmlToMarkdown(fullHtml);
          
          const chunks = splitMarkdownByLength(fullMarkdown, 2500); // [품질 최적화] 5000 -> 2500으로 축소 (73페이지 문서 대응)
          const pages = chunks.map((content, idx) => ({
              id: `${file.id}_p${idx + 1}`,
              pageNumber: idx + 1,
              status: 'pending',
              originalText: content,
              translatedText: '',
              method: 'ai'
          }));
          
          file.pages = pages;
          file.totalPages = pages.length;
          storage.saveProject(project);

          // [Global Sprint] 전체 페이지에서 중복 단어 추출 및 선제적 번역
          const uniqueUnits = extractGlobalUnits(file.pages);
          if (uniqueUnits.length > 0 && !project.stopRequested) {
              project.subStatus = `단락 분석 및 공통 용어 일괄 처리 중 (${uniqueUnits.length}개)...`;
              storage.saveProject(project);
              
              const translationMap = await processGlobalVocabulary(project, file, uniqueUnits, options);
              hydratePagesWithMap(file, translationMap);
              
              project.subStatus = '단락별 상세 번역 시작...';
              storage.saveProject(project);
          }

          await runInPool(file.pages, 10, async (page) => {
              if (project.stopRequested) return;
              await processSinglePage(project, file, page, options);
          }, project);
          
          file.status = 'completed';
        } catch (err) {
          console.error('Word processing fail:', err);
          file.status = 'failed';
          file.error = err.message;
        }
        storage.saveProject(project);
      }
      
      if (file.status !== 'failed') {
          file.status = file.pages.length > 0 && file.pages.every(p => p.status === 'completed' || p.status === 'skipped') ? 'completed' : 'failed';
          
          // [추가] 양식 보존 번역 결과물 생성
          if (file.status === 'completed' && options.enableLayoutPreservation) {
              try {
                  const ext = path.extname(file.originalName).toLowerCase();
                  console.log(`[Layout Preservation Start] Processing ${file.originalName} (Mime: ${file.mimetype}, Ext: ${ext})`);
                  
                  project.subStatus = `${file.originalName}의 원본 양식 재구성 중...`;
                  storage.saveProject(project);
                  
                  // [최적화] 이미 완료된 페이지들의 번역본을 수집하여 레이아웃 프로세서에 전달 (재번역 방지)
                  const preTranslatedMap = {};
                  file.pages.forEach(p => {
                      if (p.originalText && p.translatedText) {
                          preTranslatedMap[p.originalText] = p.translatedText;
                      }
                  });

                  let layoutPath;
                  if (file.mimetype === 'application/pdf' || ext === '.pdf') {
                      layoutPath = await pdfProcessor.translatePdf(file.path, outputDir, {
                          ...options,
                          preTranslatedMap,
                          onProgress: (status) => {
                              project.subStatus = `${file.originalName}: ${status}`;
                              storage.saveProject(project);
                          }
                      });
                  } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
                      layoutPath = await docxProcessor.translateDocx(file.path, outputDir, options);
                  }
                  
                  if (layoutPath) {
                      file.layoutPath = path.basename(layoutPath);
                      console.log(`[Layout Preservation Success] ${file.originalName} -> ${file.layoutPath}`);
                  } else {
                      console.log(`[Layout Preservation Skip] No layoutPath generated for ${file.originalName}`);
                  }
              } catch (layoutErr) {
                  console.error(`[Layout Preservation Failed] ${file.originalName}:`, layoutErr);
                  // 양식 보존 실패가 전체 번역 실패로 이어지지는 않도록 처리 (subStatus에만 간략히 표시 가능)
                  project.subStatus = `양식 보존본 생성 중 오류: ${layoutErr.message}`;
                  storage.saveProject(project);
              }
          }
      }
      project.usage.duration = Math.floor((Date.now() - project.usage.startTime) / 1000);
      storage.saveProject(project);
    } catch (err) {
      console.error(`File ${file.originalName} processing failed:`, err);
      file.status = 'failed';
      storage.saveProject(project);
    }
  }
  
  project.status = project.stopRequested ? 'stopped' : (project.files.every(f => f.status === 'completed') ? 'completed' : 'failed');
  project.usage.duration = Math.floor((Date.now() - project.usage.startTime) / 1000);
  storage.saveProject(project);
}

/**
 * 개별 페이지 처리 로직 (분리된 헬퍼 함수)
 */
async function processSinglePage(project, file, page, options) {
    if (page.status === 'completed' || page.status === 'skipped') return;
    if (project.stopRequested) return;

    page.status = 'processing';
    
    try {
        let text = page.originalText;
        if (!text && file.mimetype === 'application/pdf') {
            text = await extractTextFromPdf(page.path);
            page.originalText = text;
        }

        if (!text) {
            // [개선] 텍스트가 없는 이미지만 있는 페이지의 경우 실패 대신 '생략' 처리
            page.status = 'skipped';
            page.translatedText = '(그림 및 이미지 페이지 - 텍스트가 없어 번역을 생략했습니다.)';
            page.method = 'auto_skipped';
            storage.saveProject(project);
            return;
        }

        // 1. 캐시 체크
        const cached = storage.getCachedTranslation(text, options.targetLang || 'ko');
        if (cached) {
            page.translatedText = cached;
            page.status = 'completed';
            page.method = 'cached';
            storage.saveProject(project); 
            return;
        }

        // 2. 스마트 스킵 (HTML 태그 제거 후 판정)
        const cleanText = text.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
        if (cleanText.length === 0) {
            page.status = 'failed';
            page.error = 'No text content';
            return;
        }

        const numCount = (cleanText.match(/[0-9]/g) || []).length;
        const numRatio = cleanText.length > 0 ? numCount / cleanText.length : 0;
        
        if (cleanText.length < 3 && numRatio > 0.9) {
            page.translatedText = text;
            page.status = 'skipped';
            page.method = 'ai_skipped';
            return;
        }

        // 3. AI 번역
        const projectGlossary = glossary.getGlossary(project.id);
        const activeModel = options.model || (file.pages && file.pages.length > 5 ? 'gpt-4o-mini' : 'gpt-4o');
        
        let translation;
        const targetLanguage = options.targetLangLabel || options.targetLang || 'Korean';
        
        if (activeModel.startsWith('gemini-')) {
            translation = await translator.translateWithGemini(
                text, 'auto', targetLanguage, options.geminiApiKey, { ...options, glossary: projectGlossary, model: activeModel }
            );
        } else {
            translation = await translator.translateText(
                text, 'auto', targetLanguage, options.apiKey, { ...options, glossary: projectGlossary, model: activeModel }
            );
        }

        // 4. 품질 검증
        const vResult = verifier.verify(text, translation.content, projectGlossary);
        
        page.translatedText = translation.content;
        page.status = 'completed';
        page.method = translation.method || 'ai';
        page.warnings = vResult.warnings;
        page.score = vResult.score;
        
        // 사용량 통계 업데이트
        project.usage.apiCalls++;
        project.usage.totalTokens += (translation.usage ? translation.usage.total_tokens : 0);
        project.usage.estimatedCost += calculateCost(translation.usage, activeModel);
        
        // 캐시 저장
        storage.saveToCache(text, options.targetLang || 'ko', translation.content);
        storage.saveProject(project); // Real-time update for UI
        
    } catch (err) {
        console.error(`Page ${page.pageNumber} processing failed:`, err);
        page.status = 'failed';
        page.error = err.message;
    }
}

/**
 * [추가] 슬라이딩 윈도우 작업을 위한 컨커런시 풀
 */
async function runInPool(tasks, limit, workerFn, project) {
    const pool = new Set();
    const results = [];
    const PAGE_TIMEOUT = 120000; // 120초 강제 타임아웃
    
    for (const task of tasks) {
        // [중요] 중지 요청 시 즉시 루프 탈출
        if (project && project.stopRequested) {
            console.log(`[Worker Pool] Stop requested. Abandoning ${tasks.length - results.length} pending tasks.`);
            return Promise.resolve(); 
        }
        
        if (pool.size >= limit) {
            await Promise.race(pool);
        }
        
        // workerFn에 타임아웃 래퍼 적용
        const promise = (async () => {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('PAGE_TIMEOUT')), PAGE_TIMEOUT)
            );
            return Promise.race([workerFn(task), timeoutPromise]);
        })();
        
        pool.add(promise);
        promise.finally(() => pool.delete(promise));
        results.push(promise.catch(err => {
            console.error(`[Worker Pool Error] ${err.message}`);
            // 타임아웃 발생 시 페이지 상태 업데이트
            if (err.message === 'PAGE_TIMEOUT') {
                task.status = 'failed';
                task.error = '120초 시간 초과 (Hard Timeout)';
            }
            return null;
        }));
    }
    
    // [중요] 중지 요청 시 대기 중인 작업들을 완벽히 기다리지 않고 즉시 탈환
    if (project && project.stopRequested) return Promise.resolve();
    
    return Promise.all(results);
}

/**
 * [추가] 마크다운 문자열을 최대한 단락 단위로 쪼개는 함수
 */
function splitMarkdownByLength(markdown, maxLength) {
    // 1. 단락 단위(\n\n)로 먼저 쪼갬
    const paragraphs = markdown.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = "";
    
    for (const p of paragraphs) {
        const trimmedP = p.trim();
        if (!trimmedP) continue;

        // 단락 하나가 maxLength를 초과하는 경우 (매우 드묾), 문장 단위로 쪼갬
        if (trimmedP.length > maxLength) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
            // 단순 문장 마침표 기반 splitting
            const sentences = trimmedP.split(/(?<=[.!?])\s+/);
            for (const s of sentences) {
                if ((currentChunk.length + s.length) > maxLength && currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = "";
                }
                currentChunk += s + " ";
            }
            continue;
        }

        if ((currentChunk.length + trimmedP.length) > maxLength && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
        }
        currentChunk += trimmedP + "\n\n";
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
}

/**
 * [추가] Word HTML -> 가벼운 마크다운 변환기
 * AI 번역 속도와 토큰 절감을 위해 테이블 구조를 단순화합니다.
 */
function htmlToMarkdown(html) {
    let md = html;
    
    // 0. Manual Header Numbering Counters
    let h1Count = 0;
    let h2Count = 0;
    let h3Count = 0;

    // 1. Convert Headers (h1-h6) to Markdown with numbering injection
    // Replace <h1> to <h6> with numbered versions if no manual number exists
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (m, content) => {
        const text = content.replace(/<[^>]+>/g, '').trim();
        if (/^\d+(\.\d+)*(\s|\.)/.test(text)) return `\n# ${text}\n`; // Already has manual number
        h1Count++;
        h2Count = 0; // Reset sub-counters
        h3Count = 0;
        return `\n# ${h1Count}. ${text}\n`;
    });

    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (m, content) => {
        const text = content.replace(/<[^>]+>/g, '').trim();
        if (/^\d+(\.\d+)+(\s|\.)/.test(text)) return `\n## ${text}\n`;
        h2Count++;
        h3Count = 0;
        return `\n## ${h1Count}.${h2Count}. ${text}\n`;
    });

    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, (m, content) => {
        const text = content.replace(/<[^>]+>/g, '').trim();
        if (/^\d+(\.\d+)+(\s|\.)/.test(text)) return `\n### ${text}\n`;
        h3Count++;
        return `\n### ${h1Count}.${h2Count}.${h3Count}. ${text}\n`;
    });

    md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
    md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
    md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');

    // 2. Convert Tables to Markdown format
    md = md.replace(/<table[^>]*>/gi, '\n\n');
    md = md.replace(/<\/table>/gi, '\n\n');
    md = md.replace(/<tr[^>]*>/gi, '| ');
    md = md.replace(/<\/tr>/gi, '\n');
    md = md.replace(/<td[^>]*>/gi, ' ');
    md = md.replace(/<\/td>/gi, ' |');
    
    // 3. Convert List Items
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '\n* $1');
    md = md.replace(/<ul[^>]*>/gi, '\n');
    md = md.replace(/<\/ul>/gi, '\n');
    md = md.replace(/<ol[^>]*>/gi, '\n');
    md = md.replace(/<\/ol>/gi, '\n');
    
    // 4. Formatting tags
    md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_');
    md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_');

    // 5. Line breaks and Paragraphs
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n');
    md = md.replace(/<br\s*\/?>/gi, '\n');

    // 6. Final Tag Stripping
    md = md.replace(/<[^>]+>/g, ''); 
    
    // 7. Cleanup
    return md.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

/**
 * [추가] 글로벌 단어 추출 및 중복 제거 (Sprint용)
 */
function extractGlobalUnits(pages) {
    const units = new Set();
    for (const page of pages) {
        if (!page.originalText) continue;
        
        // 줄바꿈과 표 구분자로 분리
        const parts = page.originalText.split(/[\n\r]|(?:\s{3,})|\|/);
        for (let p of parts) {
            const clean = p.trim();
            // 숫자만 있거나 너무 짧은 경우에 대한 예외 처리 강화
            // 기술 문서의 목차(3.11, 4.1.2 등)는 원본 그대로 보존하거나 
            // 번역 대상으로 넘겨야 하므로 필터를 완화함
            const isJustNumbers = /^[0-9.]+$/.test(clean);
            const isTooShort = clean.length < 1;
            
            if (!isTooShort && clean.length < 1000) {
                // 숫자로만 된 항목이라도 점(.)이 포함된 목차 형식은 번역(또는 보존) 대상으로 포함
                if (isJustNumbers && !clean.includes('.')) continue; 
                units.add(clean);
            }
        }
    }
    return Array.from(units);
}

/**
 * [추가] 글로벌 보휘 일괄 번역 처리
 */
async function processGlobalVocabulary(project, file, units, options) {
    if (units.length === 0) return {};
    
    const BATCH_SIZE = 50; // 한 번에 50개 유닛씩 번역
    const translationMap = {};
    const batches = [];
    
    for (let i = 0; i < units.length; i += BATCH_SIZE) {
        batches.push(units.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`[Global Sprint] Translating ${units.length} unique units in ${batches.length} batches.`);
    
    // 워커 풀을 사용하여 배치 번역 (병렬 처리)
    await runInPool(batches, 5, async (batch) => {
        if (project.stopRequested) return;
        const targetLanguage = options.targetLangLabel || options.targetLang || 'Korean';
        const result = await translator.translateBulkUnits(batch, 'auto', targetLanguage, options.apiKey, options);
        
        // [추가] 배치 결과 검증 로그
        const resultCount = Object.keys(result.map).length;
        if (resultCount < batch.length) {
            console.warn(`[Sprint Failure] Expected ${batch.length}, got ${resultCount}. Text might be missing.`);
        }
        
        Object.assign(translationMap, result.map);
    }, project);
    
    return translationMap;
}

/**
 * [추가] 번역 사전(Map)을 기반으로 모든 페이지에 번역 적용 (Hydration)
 */
function hydratePagesWithMap(file, translationMap) {
    let hydratedCount = 0;
    for (const page of file.pages) {
        if (page.status === 'completed' || !page.originalText) continue;
        
        let translated = page.originalText;
        // 가장 긴 문구부터 치환하여 중첩 치환 방지
        const sortedKeys = Object.keys(translationMap).sort((a, b) => b.length - a.length);
        
        let changed = false;
        for (const key of sortedKeys) {
            if (translated.includes(key)) {
                // 정확한 일치를 위해 정규식 혹은 단순 치환 사용
                // 여기서는 안전하게 전체 일치 기반으로 동작하거나 문맥 내 치환 수행
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedKey, 'g');
                translated = translated.replace(regex, translationMap[key]);
                changed = true;
            }
        }
        
        if (changed) {
            page.translatedText = translated;
            // [수정] 스프린트 작업 후 바로 '완료' 처리하지 않음 -> 전체 페이지 번역 단계가 원문을 누락하지 않고 한 번 더 정밀하게 수행됨
            page.method = 'global_sprint';
            hydratedCount++;
        }
    }
    console.log(`[Global Sprint] Hydrated ${hydratedCount} pages with shared vocabulary.`);
}

module.exports = {
  startProcessing
};
