const { OpenAI } = require('openai');
const tm = require('./tm');
const https = require('https');
require('dotenv').config();

function getOpenAIClient(apiKey) {
  return new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY
  });
}

/**
 * 기술문서 번역 핵심 로직 (Glossary 및 TM 적용)
 */
async function translateText(text, sourceLang, targetLang, apiKey, options = {}) {
    const { glossary = {}, style = 'professional' } = options;
    
    // 1. TM 조회
    const tmResult = tm.lookup(text);
    if (tmResult) {
        return { content: tmResult, usage: { total_tokens: 0 }, method: 'tm_match' };
    }

    const openai = getOpenAIClient(apiKey);
    const glossaryEntries = Object.entries(glossary)
        .map(([src, tgt]) => `- ${src} : ${tgt}`)
        .join('\n');

    const systemPrompt = `Professional technical translator specialized in Civil Engineering, Construction, and Architectural documents. 
Translate ${sourceLang} to ${targetLang} with extreme precision and technical accuracy.

## CORE RULES:
1. WORD & NUMBER RECONSTRUCTION: The input text may contain words or numbers split by line breaks or OCR errors (e.g., "0.\n2%", "K\natowice", "bri\ndge"). You MUST detect these and reconstruct them into single entities ("0.2%", "Katowice", "bridge") before translating.
2. ENGINEERING CONTEXT:
   - "Most" in Polish (PL) must be translated as "Bridge" in English (EN). Do NOT confuse it with the superlative "most".
   - Maintain professional engineering terminology (e.g., "span", "abutment", "pier", "slope", "superstructure").
3. UNITS & NUMBERS: 
   - Preserve units exactly: kN, MPa, m, mm, cm, %, °, etc.
   - Do NOT add internal spaces in numbers or between a number and its unit unless required (e.g., "0.2%" not "0. 2%").
4. STRUCTURE & MARKERS: 
   - Keep all Markdown markers (# for headers, | for tables, * for lists) and numbering (1.1, 2.3.1) exactly as input.
   - Do NOT summarize or skip any content. Translate every detail.
5. GLOSSARY:
${glossaryEntries}
6. TONE: ${style}. Direct, professional, and technical.
7. CRITICAL: NEVER return an incomplete translation. Always provide the full content.`;

    try {
        const response = await openai.chat.completions.create({
            model: options.model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            temperature: 0.1,
            max_tokens: 4096 // [업그레이드] 전체 페이지 번역 시 잘림 방지를 위해 한도 대폭 상향
        }, { timeout: 30000 });

        const completion = response.choices[0].message.content;
        const usage = response.usage;

        return {
            content: completion,
            usage: {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens
            },
            method: 'llm_translation'
        };

    } catch (error) {
        console.error('Error during OpenAI API call:', error.message);
        throw new Error('Failed to translate text with OpenAI.');
    }
}

/**
 * 시각적 문서 번역 (Vision)
 */
async function translateImage(base64Image, targetLang = 'Korean', options = {}) {
  const openai = getOpenAIClient(options.apiKey);
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { 
        role: 'system', 
        content: `You are a professional technical document translator. 
        Extract all text from the image and translate it into [${targetLang}]. 
        Return the result as a JSON object with:
        {
          "original": "The extracted text in original language",
          "translated": "The translated text in ${targetLang}"
        }` 
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Extract and translate this image. Use Markdown for formatting within the strings.` },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` }
          }
        ]
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  }, { timeout: 60000 }); // [ADD] 60초 타임아웃 추가

  const result = JSON.parse(response.choices[0].message.content);
  return {
    original: result.original,
    content: result.translated,
    usage: response.usage,
    method: 'ai_vision'
  };
}

/**
 * Gemini 전용 번역 로직
 */
async function translateWithGemini(text, sourceLang, targetLang, apiKey, options = {}) {
    let rawModel = options.model || 'gemini-1.5-flash';
    let model = rawModel;
    if (model === 'gemini-2.0-flash-lite') model = 'gemini-2.0-flash-lite-preview-02-05';
    if (model === 'gemini-1.5-flash') model = 'gemini-1.5-flash-latest'; 

    const apiVersion = model.includes('1.5') ? 'v1' : 'v1beta';
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;

    const { glossary = {}, style = 'professional' } = options;
    const glossaryEntries = Object.entries(glossary)
        .map(([src, tgt]) => `- ${src} : ${tgt}`)
        .join('\n');

    const prompt = `You are a professional technical document translator.
Translate the following text from ${sourceLang} to ${targetLang} with precision.
GLOSSARY:
${glossaryEntries}
STYLE: ${style}
RULES:
1. ZERO OMISSION: Translate every single word. Never summarize.
2. Preserve technical formatting and units.
TEXT TO TRANSLATE:
${text}`;

    const data = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 }
    });

    return new Promise((resolve, reject) => {
        const req = https.request(
            url,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 60000 },
            (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (json.error) {
                            return reject(new Error(`Gemini API Error (${apiVersion}): ` + JSON.stringify(json.error)));
                        }
                        if (!json.candidates || !json.candidates[0]) {
                            return reject(new Error(`Gemini Error: No candidates returned. ` + body));
                        }
                        const content = json.candidates[0].content.parts[0].text;
                        resolve({
                            content,
                            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: text.length / 4 },
                            method: 'gemini_translation'
                        });
                    } catch (e) { reject(new Error(`Gemini API Parse Error (${apiVersion}): ` + body)); }
                });
            }
        );
        req.on('timeout', () => { req.destroy(); reject(new Error('GEMINI_TIMEOUT')); });
        req.on('error', (e) => reject(new Error('Network Error: ' + e.message)));
        req.write(data);
        req.end();
    });
}

/**
 * Gemini 전용 이미지 번역 (Vision)
 */
async function translateImageWithGemini(base64Image, targetLang = 'Korean', apiKey, options = {}) {
    let rawModel = options.model || 'gemini-1.5-flash';
    let model = rawModel;
    if (model === 'gemini-2.0-flash-lite' || model === 'gemini-2.0-flash') model = 'gemini-2.0-flash';
    if (model === 'gemini-1.5-flash') model = 'gemini-1.5-flash';

    const apiVersion = model.includes('1.5') ? 'v1' : 'v1beta';
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;

    const prompt = `Extract all text from this image and translate it into [${targetLang}]. 
    Return the result as a JSON object with:
    {
      "original": "The extracted text in original language",
      "translated": "The translated text in ${targetLang}"
    }`;

    const data = JSON.stringify({
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
            ]
        }],
        generationConfig: { temperature: 0.1 } // Removed responseMimeType for v1 stability
    });

    return new Promise((resolve, reject) => {
        const req = https.request(
            url,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 60000 },
            (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (json.error) {
                            return reject(new Error(`Gemini Vision Error (${apiVersion}): ` + JSON.stringify(json.error)));
                        }
                        if (!json.candidates || !json.candidates[0]) {
                            return reject(new Error(`Gemini Vision Error: No candidates. ` + body));
                        }
                        const textResponse = json.candidates[0].content.parts[0].text;
                        // Sometimes Gemini wraps JSON in markdown code blocks
                        const cleanJson = textResponse.replace(/```json\n?|\n?```/g, '').trim();
                        const result = JSON.parse(cleanJson);
                        resolve({
                            original: result.original,
                            content: result.translated,
                            usage: { total_tokens: 1000 },
                            method: 'gemini_vision'
                        });
                    } catch (e) { reject(new Error(`Gemini Vision Parse Error (${apiVersion}): ` + body)); }
                });
            }
        );
        req.on('timeout', () => { req.destroy(); reject(new Error('GEMINI_VISION_TIMEOUT')); });
        req.on('error', (e) => reject(new Error('Network Error: ' + e.message)));
        req.write(data);
        req.end();
    });
}

/**
 * [추가] 대용량 유니크 텍스트 일괄 번역 (Sprint용)
 * 1.5초 이내의 빠른 응답을 위해 텍스트 리스트를 한꺼번에 처리합니다.
 */
async function translateBulkUnits(unitList, sourceLang, targetLang, apiKey, options = {}) {
    if (!unitList || unitList.length === 0) return {};
    
    // 유닛들을 하나의 프롬프트용 텍스트로 결합 (번호 매김)
    const combinedInput = unitList.map((text, idx) => `[[${idx}]] ${text}`).join('\n');
    
    const { glossary = {}, style = 'professional' } = options;
    const glossaryEntries = Object.entries(glossary)
        .map(([src, tgt]) => `- ${src} : ${tgt}`)
        .join('\n');

    // [추가지원] 언어 코드 지원 (ko -> Korean 등)
    const langMap = { 'ko': 'Korean', 'en': 'English', 'ja': 'Japanese', 'zh': 'Chinese', 'pl': 'Polish', 'es': 'Spanish' };
    const humanLang = langMap[targetLang] || targetLang;

    const systemPrompt = `You are a professional technical translator.
Translate the following numbered units from ${sourceLang} into [${humanLang}]. 
RULES:
1. Return EXACTLY the same number of units.
2. Format: [[number]] Translation
3. Do not add any conversational text.
4. If a unit is already in ${humanLang}, return it as is.
5. ZERO OMISSION: You must translate every single unit provided. Do NOT skip items.
6. NUMBERING: If a unit contains a chapter number (e.g., 1.1.1), PRESERVE it at the start of the translation.
7. GLOSSARY:
${glossaryEntries}
8. STYLE: ${style}`;

    const openai = getOpenAIClient(apiKey);
    
    try {
        const response = await openai.chat.completions.create({
            model: options.model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: combinedInput }
            ],
            temperature: 0,
            max_tokens: 4096, // [추가] 출력 토큰 한도를 최대로 늘려 잘림 방지
        }, { timeout: 90000 }); // 타임아웃도 90초로 확장

        const content = response.choices[0].message.content;
        const results = {};
        let matchCount = 0;
        
        // 결과 파싱
        const lines = content.split('\n');
        lines.forEach(line => {
            const match = line.match(/\[\[(\d+)\]\]\s*(.*)/);
            if (match) {
                const idx = parseInt(match[1]);
                const translation = match[2].trim();
                if (unitList[idx]) {
                    results[unitList[idx]] = translation;
                    matchCount++;
                }
            }
        });

        // [추가] 데이터 무결성 검증: 요청한 개수와 결과 개수 비교
        if (matchCount < unitList.length) {
            console.error(`[Integrity Check Failed] Requested: ${unitList.length}, Received: ${matchCount}. Possible truncation.`);
            // 여기에 재시도 로직을 넣거나, 최소한 로그를 남겨 추적 가능하게 함
        }
        
        return {
            map: results,
            usage: response.usage
        };
    } catch (err) {
        console.error('[Bulk Translation Error]', err.message);
        throw err;
    }
}

module.exports = {
  translateText,
  translateImage,
  translateWithGemini,
  translateImageWithGemini,
  translateBulkUnits
};
