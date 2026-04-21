// UI Elements
const btnUploadTrigger = document.getElementById('btn-upload-trigger');
const modalUpload = document.getElementById('modal-upload');
const btnCancelUpload = document.getElementById('btn-cancel-upload');
const btnStartProcess = document.getElementById('btn-start-process');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const selectedFilesContainer = document.getElementById('selected-files');
const pagesContainer = document.getElementById('pages-container');
const btnSettings = document.getElementById('btn-settings');
const modalSettings = document.getElementById('modal-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const jobStatusBadge = document.getElementById('job-status');
const currentProjectName = document.getElementById('current-project-name');
const btnExport = document.getElementById('btn-export');
const btnExportHtml = document.getElementById('btn-export-html');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const btnExportMain = document.getElementById('btn-export-main');
const exportModal = document.getElementById('export-modal');
const btnConfirmExport = document.getElementById('btn-confirm-export');
const btnCancelExport = document.getElementById('btn-cancel-export');
const btnResetAll = document.getElementById('btn-reset-all');
const btnStopProcess = document.getElementById('btn-stop-process');
const btnCancelProcess = document.getElementById('btn-cancel-process');
const progressRunningActions = document.getElementById('progress-running-actions');
const btnDownloadLayout = document.getElementById('btn-download-layout');
const enableLayoutCheckbox = document.getElementById('enable-layout-preservation');

const glossarySrc = document.getElementById('glossary-src');
const glossaryTgt = document.getElementById('glossary-tgt');
const btnAddGlossary = document.getElementById('btn-add-glossary');
const glossaryList = document.getElementById('glossary-list');
const btnExtractTerms = document.getElementById('btn-extract-terms');

const srcLangSelect = document.getElementById('src-lang');
const targetLangSelect = document.getElementById('target-lang');
const ocrModeCheckbox = document.getElementById('ocr-mode');

const statTokens = document.getElementById('stat-tokens');
const statCost = document.getElementById('stat-cost');
const statCache = document.getElementById('stat-cache');

// [추가] 스케일 조절 요소
const contentScale = document.getElementById('content-scale');
const scaleValueLabel = document.getElementById('scale-value');
let currentScale = 1.0;

// Configure pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let currentProjectData = null;
let selectedFiles = [];
let currentBatchId = null;
let pollingInterval = null;
let currentPageIndex = 0;
let modalDismissedForProject = null; // Track dismissed status per project

let ownerId = localStorage.getItem('autotrans_ownerId');
if (!ownerId) {
    ownerId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('autotrans_ownerId', ownerId);
}

// Modal Logic
btnUploadTrigger.addEventListener('click', () => modalUpload.classList.add('active'));
btnCancelUpload.addEventListener('click', () => {
    modalUpload.classList.remove('active');
    selectedFiles = [];
    renderSelectedFiles();
});

btnSettings.addEventListener('click', () => modalSettings.classList.add('active'));
btnCloseSettings.addEventListener('click', () => {
    saveSettings();
    modalSettings.classList.remove('active');
});

const modalProgress = document.getElementById('modal-progress');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressTime = document.getElementById('progress-time');
const progressStatus = document.getElementById('progress-status');
const progressTitle = document.getElementById('progress-title');
const progressIcon = document.getElementById('progress-icon');
const progressCompleteActions = document.getElementById('progress-complete-actions');
const btnCloseProgress = document.getElementById('btn-close-progress');

btnCloseProgress.addEventListener('click', () => {
    if (currentProjectData) {
        modalDismissedForProject = currentProjectData.id;
    }
    modalProgress.classList.remove('active');
    // 복원: 드래그 위치 초기화 (옵션)
    const content = modalProgress.querySelector('.modal-content');
    content.style.left = '50%';
    content.style.top = '50%';
    content.style.transform = 'translate(-50%, -50%)';

    // Prepare for next
    progressCompleteActions.style.display = 'none';
    progressCompleteActions.style.opacity = '0';
    progressCompleteActions.style.transform = 'translateY(10px)';
});

// [추가] 상태창 드래그 이동 기능
function makeDraggable(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const content = modal.querySelector('.modal-content');
    if (!content) return;

    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop;

    content.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return; // 버튼 클릭 시 제외
        
        isDragging = true;
        
        // 드래그 시작 시점의 절대 좌표 계산
        const rect = content.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = rect.left;
        initialTop = rect.top;

        // 드래그 중 배경 선택 방지
        document.body.style.userSelect = 'none';
        content.style.cursor = 'grabbing';
        content.style.transition = 'none';
        
        // 기존 transform: translate(-50%, -50%)를 제거하고 현재 위치를 고정된 px로 변환
        content.style.position = 'fixed';
        content.style.margin = '0';
        content.style.left = initialLeft + 'px';
        content.style.top = initialTop + 'px';
        content.style.transform = 'none'; // 스냅 방지를 위해 translate 제거
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        content.style.left = (initialLeft + deltaX) + 'px';
        content.style.top = (initialTop + deltaY) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
        content.style.cursor = 'move';
        content.style.transition = '';
    });
}

// 상태창 드래그 활성화
makeDraggable('modal-progress');

// [추가] 스케일 조절 이벤트
if (contentScale) {
    contentScale.addEventListener('input', (e) => {
        currentScale = parseFloat(e.target.value);
        if (scaleValueLabel) scaleValueLabel.textContent = `${Math.round(currentScale * 100)}%`;
        applyScale();
    });
}

function applyScale() {
    const pages = document.querySelectorAll('.page-side');
    pages.forEach(p => {
        p.style.fontSize = `${currentScale * 1.1}rem`;
    });
}

// File Selection
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    selectedFiles = Array.from(e.target.files);
    renderSelectedFiles();
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    selectedFiles = Array.from(e.dataTransfer.files);
    renderSelectedFiles();
});

// Remove old API Inline Sync (already in Settings)

function renderSelectedFiles() {
    selectedFilesContainer.innerHTML = selectedFiles.map(f => `
        <div class="file-item">
            <i data-lucide="file"></i>
            <span>${f.name} (${(f.size / 1024).toFixed(1)} KB)</span>
        </div>
    `).join('');
    lucide.createIcons();
}

// Process Start
btnStartProcess.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return alert('파일을 선택해주세요.');

    const settings = JSON.parse(localStorage.getItem('autotrans_settings') || '{}');
    const formData = new FormData();
    const isOcrMode = ocrModeCheckbox.checked;

    btnStartProcess.disabled = true;
    btnStartProcess.textContent = isOcrMode ? '렌더링 및 분석 중...' : '업로드 중...';

    try {
        if (isOcrMode) {
            // OCR Mode: Convert PDF to images in browser
            for (const file of selectedFiles) {
                if (file.type === 'application/pdf') {
                    const images = await convertPdfToImages(file);
                    images.forEach((imgBlob, idx) => {
                        formData.append('files', imgBlob, `${file.name}_page_${idx + 1}.png`);
                    });
                } else {
                    formData.append('files', file);
                }
            }
        } else {
            selectedFiles.forEach(file => formData.append('files', file));
        }

        const settings = JSON.parse(localStorage.getItem('autotrans_settings') || '{}');
        const selectedModel = document.getElementById('ai-model').value || settings.model || 'gpt-4o';
        
        formData.append('projectName', selectedFiles[0].name.split('.')[0]);
        formData.append('apiKey', settings.openaiKey || settings.apiKey || '');
        formData.append('geminiApiKey', settings.geminiKey || '');
        formData.append('model', selectedModel);
        formData.append('srcLang', srcLangSelect.value);
        formData.append('targetLang', targetLangSelect.value);
        formData.append('isOcr', isOcrMode);
        formData.append('enableLayoutPreservation', enableLayoutCheckbox ? enableLayoutCheckbox.checked : false);
        formData.append('ownerId', ownerId);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.success) {
            currentBatchId = data.batchId;
            currentProjectName.textContent = data.project.name;
            modalUpload.classList.remove('active');
            
            // Show progress modal
            modalProgress.classList.add('active');
            progressTitle.textContent = "번역 엔진 가동 중...";
            progressStatus.textContent = "서버와 연결을 확인하고 있습니다";
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';
            progressTime.textContent = '남은 시간: 계산 중...';
            
            // [개정] 서버의 파일 저장 딜레이(1.5초)를 고려하여 2초 후 목록 갱신
            setTimeout(() => {
                loadProjectHistory();
            }, 2000);
            startPolling();
        }
    } catch (err) {
        console.error('Process error:', err);
        alert('처리 실패: ' + err.message);
    } finally {
        btnStartProcess.disabled = false;
        btnStartProcess.textContent = '번역 시작';
    }
});

async function convertPdfToImages(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/cmaps/',
        cMapPacked: true
    }).promise;
    const images = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // High res
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        images.push(blob);
    }
    return images;
}

// Polling Logic
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/status/${currentBatchId}`);
            const project = await response.json();
            
            currentProjectData = project;
            updateUI(project);
            
            if (project.usage) {
                statTokens.textContent = project.usage.totalTokens.toLocaleString();
                document.getElementById('stat-model').textContent = project.usage.model || 'gpt-4o';
                
                // Duration calculation
                let duration = project.usage.duration || 0;
                if (project.status === 'processing' && project.usage.startTime) {
                    duration = Math.floor((Date.now() - project.usage.startTime) / 1000);
                }
                const m = Math.floor(duration / 60);
                const s = duration % 60;
                document.getElementById('stat-duration').textContent = m > 0 ? `${m}m ${s}s` : `${s}s`;

                statCost.textContent = project.usage.estimatedCost.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 });
                statCache.textContent = project.usage.cacheHits.toLocaleString();
            }
            
            if (project.status === 'completed' || project.status === 'failed') {
                clearInterval(pollingInterval);
                btnExportMain.disabled = false;
                btnStartProcess.disabled = false;
                btnStartProcess.innerHTML = '<i data-lucide="play"></i> 번역 시작';
                
                if (project.status === 'completed') {
                    progressTitle.textContent = "번역 작업 완료!";
                    progressIcon.innerHTML = '<i data-lucide="check-circle" color="#22c55e" size="40"></i>';
                    progressRunningActions.style.display = 'none';
                    progressCompleteActions.style.display = 'block';
                    progressCompleteActions.style.opacity = '1';
                    progressCompleteActions.style.transform = 'translateY(0)';
                    
                    // [개선] 양식 보존본 다운로드 링크 생성 (프리미엄 디자인)
                    const hasLayout = project.files && project.files.some(f => f.layoutPath);
                    
                    // 기존 버튼 컨테이너가 있으면 제거 후 새로 생성 (전체 레이아웃 제어)
                    const oldContainer = progressCompleteActions.querySelector('.success-actions-container');
                    if (oldContainer) oldContainer.remove();
                    
                    const actionsContainer = document.createElement('div');
                    actionsContainer.className = 'success-actions-container mt-25px';
                    
                    // 1. 결과 보기 버튼 (메인)
                    const closeBtn = document.getElementById('btn-close-progress');
                    closeBtn.className = 'btn-premium w-full';
                    closeBtn.innerHTML = '<i data-lucide="layout-dashboard"></i> 완료 및 결과 보기';
                    // 기존 버튼을 컨테이너 안으로 이동
                    actionsContainer.appendChild(closeBtn);

                    if (hasLayout) {
                        const fileWithLayout = project.files.find(f => f.layoutPath);
                        const downloadBtn = document.createElement('button');
                        downloadBtn.className = 'btn-premium-outline w-full';
                        downloadBtn.innerHTML = '<i data-lucide="file-check"></i> 원본 양식 보존본 다운로드';
                        downloadBtn.onclick = () => {
                            window.location.href = `/api/download-layout/${project.id}/${fileWithLayout.id}`;
                        };
                        actionsContainer.appendChild(downloadBtn);
                    }
                    
                    progressCompleteActions.appendChild(actionsContainer);
                    lucide.createIcons();
                    
                    // [추가] 완료 시 히스토리 즉시 새로고침
                    loadProjectHistory();
                    
                    // 완료 레이블 업데이트
                    if (progressStatus) progressStatus.textContent = "모든 문서가 성공적으로 번역되었습니다.";
                } else if (project.status === 'failed') {
                    progressTitle.textContent = "작업 실패";
                    progressIcon.innerHTML = '<i data-lucide="x-circle" color="#ef4444" size="40"></i>';
                    progressRunningActions.style.display = 'none';
                    progressCompleteActions.style.display = 'block';
                    progressCompleteActions.style.opacity = '1';
                    progressCompleteActions.style.transform = 'translateY(0)';
                    if (progressStatus) progressStatus.textContent = "문서 처리 중 심각한 오류가 발생했습니다. (.doc 등 미지원 파일일 수 있습니다.)";
                }
                
                lucide.createIcons();
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    }, 2000);
}

function updateUI(project) {
    if (!project || !project.files) return;

    const totalPages = project.files.reduce((acc, f) => acc + (f.totalPages || (f.pages ? f.pages.length : 0)), 0);
    const translatedPages = project.files.reduce((acc, f) => {
        if (!f.pages) return acc;
        return acc + f.pages.filter(p => p.status === 'completed' || p.status === 'skipped').length;
    }, 0);
    const progress = totalPages > 0 ? (translatedPages / totalPages) * 100 : 0;

    // Update Progress Modal
    const isDismissed = modalDismissedForProject === project.id;
    if ((project.status === 'processing' || project.status === 'stopped') && !isDismissed) {
        modalProgress.classList.add('active');
        progressBar.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;
        // [수정] "X / Y 페이지 완료됨" 텍스트 제거 (사용자 요청)
        // progressStatus.textContent = `${translatedPages} / ${totalPages} 페이지 완료됨`;
        
        if (project.status === 'stopped') {
            progressTitle.textContent = "번역 작업 중단됨";
            progressRunningActions.style.display = 'none';
            progressCompleteActions.style.display = 'block';
            progressCompleteActions.style.opacity = '1';
            progressCompleteActions.style.transform = 'translateY(0)';
            progressIcon.innerHTML = '<i data-lucide="pause-circle" color="#f59e0b" size="40"></i>';
        } else {
            progressTitle.textContent = "번역 엔진 가동 중...";
            progressRunningActions.style.display = 'flex';
            progressCompleteActions.style.display = 'none';
            progressIcon.innerHTML = '<i data-lucide="loader-2" class="spin" color="#0ea5e9" size="40"></i>';
            
            // 상세 상태 표시
            if (project.subStatus && progress < 5) {
                progressStatus.textContent = project.subStatus;
            } else {
                progressStatus.textContent = `${translatedPages} / ${totalPages} 페이지 완료됨`;
            }
        }

        // Estimate Time
        if (translatedPages > 0 && totalPages > translatedPages && project.status === 'processing') {
            const baseTime = (project.usage && project.usage.startTime) ? project.usage.startTime : new Date(project.createdAt).getTime();
            // Use a stabilized 'elapsed' that ignores the first few seconds of setup
            const elapsed = Math.max(0, (Date.now() - baseTime) / 1000 - 3) || 0;
            
            // We need at least 1 page to start giving a stable estimate
            if (translatedPages >= 1) {
                let avgTime = elapsed / translatedPages;
                
                // Account for parallelism: the 'true' throughput is what we care about
                const remainingPages = totalPages - translatedPages;
                const remainingTime = Math.round(avgTime * remainingPages);
                const m = Math.floor(remainingTime / 60);
                const s = remainingTime % 60;
                progressTime.textContent = `남은 시간: 약 ${m > 0 ? `${m}분 ${s}초` : `${s}초`}`;
            } else {
                progressTime.textContent = "남은 시간: 계산 중...";
            }
        } else if (project.status === 'stopped') {
            progressTime.textContent = "작업이 중단되었습니다.";
        } else {
            progressTime.textContent = "남은 시간: 계산 중...";
        }
    } else if (project.status === 'completed' && !isDismissed) {
        progressRunningActions.style.display = 'none';
        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';
        progressTitle.textContent = "번역 작업 완료!";
        progressStatus.textContent = "모든 페이지가 성공적으로 번역되었습니다.";
        progressTime.textContent = "총 소요시간: " + (project.usage ? (project.usage.duration || 0) : 0) + "초";
        progressIcon.innerHTML = '<i data-lucide="check-circle" color="#10b981" size="40"></i>';
        
        progressCompleteActions.style.display = 'block';
        setTimeout(() => {
            progressCompleteActions.style.opacity = '1';
            progressCompleteActions.style.transform = 'translateY(0)';
            lucide.createIcons();
        }, 100);
    } else {
        lucide.createIcons();
    }
    
    // [추가] 양식 보존본 다운로드 버튼 가시성 제어
    if (btnDownloadLayout) {
        const hasLayout = project.files && project.files.some(f => f.layoutPath);
        if (project.status === 'completed' && hasLayout) {
            btnDownloadLayout.classList.remove('hidden');
        } else {
            btnDownloadLayout.classList.add('hidden');
        }
    }
    
    jobStatusBadge.textContent = project.status === 'completed' ? '완료' : (project.status === 'stopped' ? '중단됨' : (project.status === 'failed' ? '결과 오류' : '처리 중...'));
    jobStatusBadge.className = `badge ${project.status}`;

    // [추가] 상단 언어 정보 표시
    const langDisplay = document.getElementById('project-lang-display');
    if (langDisplay) {
        const langMap = { 'ko': '한국어', 'en': '영어', 'ja': '일본어', 'zh': '중국어', 'pl': '폴란드어', 'es': '스페인어', 'auto': '자동 감지' };
        const src = langMap[project.srcLang] || project.srcLang || '자동 감지';
        const tgt = langMap[project.targetLang] || project.targetLang || '한국어';
        langDisplay.innerHTML = `
            <span class="lang-text">${src}</span>
            <i data-lucide="arrow-right"></i>
            <span class="lang-text">${tgt}</span>
        `;
        lucide.createIcons();
    }

    // Flatten all pages across all files for navigation
    const allPages = project.files.flatMap(file => 
        file.pages.map(page => ({ ...page, fileStatus: file.status }))
    );
    
    document.getElementById('total-pages-num').textContent = allPages.length || 1;
    document.getElementById('current-page-num').textContent = currentPageIndex + 1;

    const page = allPages[currentPageIndex];
    const sourceContent = document.getElementById('source-content');
    const targetContent = document.getElementById('target-content');

    if (!page) {
        if (sourceContent) sourceContent.innerHTML = '<div class="welcome-screen" style="color:#ef4444;"><i data-lucide="alert-circle" size="48"></i><h2>문서를 분석할 수 없습니다</h2><p>해당 문서가 스캔본이거나 지원하지 않는 형식(예: HWP)일 수 있습니다. PDF 또는 DOCX로 변환 후 업로드해 주세요.</p></div>';
        if (targetContent) targetContent.innerHTML = '';
        lucide.createIcons();
        return;
    }

    const cleanTrans = (page.translatedText || '').replace(/```(markdown|html|text)?/g, '').replace(/```/g, '').trim();
    const cleanOrig = (page.originalText || '').replace(/```(markdown|html|text)?/g, '').replace(/```/g, '').trim();
    
    // MarkDown Table Conversion
    const finalTrans = cleanTrans.includes('|') ? markdownTableToHtml(cleanTrans) : cleanTrans;
    const finalOrig = cleanOrig.includes('|') ? markdownTableToHtml(cleanOrig) : cleanOrig;



    if (sourceContent && targetContent) {
        // [추가] 페이지 전환 시 스크롤 위치 초기화 (상단 정렬)
        sourceContent.scrollTop = 0;
        targetContent.scrollTop = 0;

        sourceContent.innerHTML = `
            <div class="page-side">
                <div class="page-label">원문 - Page ${page.pageNumber}</div>
                <div class="page-inner-content">${finalOrig}</div>
            </div>
        `;
        
        targetContent.innerHTML = `
            <div class="page-side">
                <div class="page-label">
                    <span>번역문 - Page ${page.pageNumber}</span>
                    <span class="method-badge ${(page.method || 'ai').toLowerCase()}">${(page.method || 'AI').toUpperCase()}</span>
                    ${page.warnings && page.warnings.length > 0 ? `<span class="badge badge-ai_skipped" title="${page.warnings.join(', ')}">⚠️</span>` : ''}
                </div>
                <div class="page-inner-content" contenteditable="true">${finalTrans}</div>
            </div>
        `;
        
        // 동기화 스크롤 활성화
        enableSyncScroll(sourceContent, targetContent);

        // [추가] 현재 스레일(Zoom) 적용
        applyScale();
    }
}

/**
 * [추가] 양방향 동기화 스크롤 기능 (Mirror Scroll)
 */
function enableSyncScroll(source, target) {
    let isSyncingSource = false;
    let isSyncingTarget = false;

    source.onscroll = function() {
        if (!isSyncingTarget) {
            isSyncingSource = true;
            target.scrollTop = this.scrollTop;
            setTimeout(() => { isSyncingSource = false; }, 50);
        }
    };

    target.onscroll = function() {
        if (!isSyncingSource) {
            isSyncingTarget = true;
            source.scrollTop = this.scrollTop;
            setTimeout(() => { isSyncingTarget = false; }, 50);
        }
    };
}

/**
 * [추가] 마크다운 표 -> HTML 테이블 변환 헬퍼
 */
function markdownTableToHtml(md) {
    const lines = md.trim().split('\n');
    let html = '';
    let inTable = false;
    
    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            if (!inTable) {
                inTable = true;
                html += '<div class="table-container"><table class="rendered-table"><thead>';
            }
            // Split by | and filter out empty strings (ends of |)
            const cells = trimmed.split('|').slice(1, -1);
            
            if (trimmed.includes('---')) {
                html += '</thead><tbody>';
                continue;
            }
            
            html += '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
        } else {
            if (inTable) {
                html += '</tbody></table></div>';
                inTable = false;
            }
            html += `<p>${line}</p>`;
        }
    }
    if (inTable) html += '</tbody></table></div>';
    return html;
}

document.getElementById('btn-prev-page').addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentPageIndex > 0) {
        currentPageIndex--;
        updateUI(currentProjectData);
    }
});

document.getElementById('btn-next-page').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentProjectData) return;
    const allPagesCount = currentProjectData.files.flatMap(f => f.pages).length;
    if (currentPageIndex < allPagesCount - 1) {
        currentPageIndex++;
        updateUI(currentProjectData);
    }
});

// [추가] 양식 보존본 다운로드 핸들러
if (btnDownloadLayout) {
    btnDownloadLayout.addEventListener('click', () => {
        if (!currentProjectData || !currentProjectData.files) return;
        
        // 레이아웃 파일이 있는 첫 번째 파일을 다운로드 (멀티 파일 지원은 향후 확장)
        const fileWithLayout = currentProjectData.files.find(f => f.layoutPath);
        if (fileWithLayout) {
            window.location.href = `/api/download-layout/${currentProjectData.id}/${fileWithLayout.id}`;
        } else {
            alert('다운로드 가능한 양식 보존 파일이 없습니다.');
        }
    });
}

// Native Export System
btnExportMain.addEventListener('click', async () => {
    if (!currentProjectData) return alert('내보낼 데이터가 없습니다.');

    try {
        const projectName = currentProjectData.name || 'translation_result';
        
        // Use modern File System Access API if available
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: projectName,
                types: [
                    { description: 'Text File', accept: { 'text/plain': ['.txt'] } },
                    { description: 'HTML Document', accept: { 'text/html': ['.html'] } },
                    { description: 'Word Document', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } },
                    { description: 'Word Document (Legacy)', accept: { 'application/msword': ['.doc'] } },
                ],
            });
            
            const writable = await handle.createWritable();
            const file = await handle.getFile();
            const ext = file.name.split('.').pop().toLowerCase();
            
            let content = '';
            if (ext === 'txt') {
                content = generateTxtContent();
            } else if (ext === 'html') {
                content = generateHtmlContent(false);
            } else if (ext === 'docx') {
                content = htmlDocx.asBlob(generateHtmlContent(true));
            } else if (ext === 'doc') {
                content = generateHtmlContent(true);
            }
            
            await writable.write(content);
            await writable.close();
        } else {
            // Fallback for older browsers: show small dropdown or just download as HTML
            runHtmlExport();
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Export error:', err);
            alert('저장 중 오류가 발생했습니다.');
        }
    }
});

function generateTxtContent() {
    let txt = `[ 번역 결과물: ${currentProjectData.name} ]\n`;
    txt += `제작: 철도4부\n${'='.repeat(40)}\n\n`;
    currentProjectData.files.forEach(file => {
        file.pages.forEach(p => {
            const cleanTarget = (p.translatedText || '').replace(/```(markdown|html)?/g, '').replace(/```/g, '').trim();
            txt += `${cleanTarget}\n\n`;
            txt += `${'-'.repeat(20)} [Page ${p.pageNumber}] ${'-'.repeat(20)}\n\n`;
        });
    });
    return txt;
}

function generateHtmlContent(isDoc = false) {
    const reportData = currentProjectData.files.flatMap(file => 
        file.pages.map(p => ({
            original: p.originalText,
            translated: (p.translatedText || '').replace(/```(markdown|html)?/g, '').replace(/```/g, '').trim(),
            method: p.method || 'unknown',
            pageNum: p.pageNumber
        }))
    );

    const style = isDoc ? `
        @page { size: A4; margin: 2.5cm; }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; line-height: 1.8; color: #000; }
        .page-break { page-break-after: always; padding-bottom: 20px; }
        .page-marker { font-size: 8pt; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 5px; margin-top: 20px; }
        h1 { font-size: 20pt; text-align: center; margin-bottom: 50px; }
        p { margin-bottom: 12pt; text-align: justify; }
    ` : `
        body { font-family: sans-serif; padding: 40px; line-height: 1.6; background: #f8fafc; color: #1e293b; }
        .container { max-width: 1000px; margin: 0 auto; }
        .page-card { background: white; margin-bottom: 30px; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .header { font-weight: 700; border-bottom: 2px solid #38bdf8; padding-bottom: 12px; margin-bottom: 15px; color: #0284c7; display: flex; justify-content: space-between; }
        .tag { font-size: 0.7em; background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 6px; }
        pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
    `;

    const formatDocText = (text) => {
        return text.split('\n').filter(l => l.trim()).map(l => `<p>${l.trim()}</p>`).join('');
    };

    if (isDoc) {
        return `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><style>${style}</style></head>
            <body>
                <h1>${currentProjectData.name} (번역본)</h1>
                <div style="text-align: right; font-size: 9pt; color: #666;">제작: 철도4부</div>
                <hr style="margin-bottom: 40px;">
                ${reportData.map(page => `
                    <div class="page-break">
                        <div class="translated-content">${formatDocText(page.translated)}</div>
                        <div class="page-marker">Page ${page.pageNum}</div>
                    </div>
                `).join('')}
            </body>
            </html>`;
    }

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${currentProjectData.name}</title>
    <style>${style}</style>
</head>
<body>
    <div class="container">
        <h1>번역 프로젝트 보고서: ${currentProjectData.name} <small style="font-size: 0.5em; color: #94a3b8;">철도4부</small></h1>
        ${currentProjectData.files.map(file => `
            <h2 style="color: #64748b;">File: ${file.originalName}</h2>
            ${file.pages.map(page => `
                <div class="page-card">
                    <div class="header">
                        <span>Page ${page.pageNumber}</span>
                        <span class="tag">${page.method}</span>
                    </div>
                    <div class="grid">
                        <div>
                            <div style="font-size: 0.8em; color: #94a3b8; margin-bottom: 5px;">SOURCE</div>
                            <pre>${page.originalText}</pre>
                        </div>
                        <div>
                            <div style="font-size: 0.8em; color: #38bdf8; margin-bottom: 5px;">TRANSLATION</div>
                            <pre>${(page.translatedText||'').replace(/```.*?```/gs, '')}</pre>
                        </div>
                    </div>
                </div>
            `).join('')}
        `).join('')}
    </div>
</body>
</html>`;
}

// Theme Toggle
btnThemeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('autotrans_theme', isLight ? 'light' : 'dark');
    updateThemeIcon();
});

function updateThemeIcon() {
    const isLight = document.body.classList.contains('light-mode');
    themeIcon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
    lucide.createIcons();
}

function loadTheme() {
    const saved = localStorage.getItem('autotrans_theme');
    if (saved === 'dark') {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode'); // Default to light
    }
    updateThemeIcon();
}

btnResetAll.addEventListener('click', async () => {
    if (!confirm('모든 프로젝트 내역이 삭제됩니다. 계속하시겠습니까?')) return;
    try {
        await fetch('/api/projects/clear', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerId })
        });
        location.reload();
    } catch (err) {
        alert('초기화 실패');
    }
});

// Settings
function saveSettings() {
    const settings = {
        openaiKey: document.getElementById('openai-key-input').value,
        geminiKey: document.getElementById('gemini-key-input').value,
        model: document.getElementById('ai-model').value
    };
    localStorage.setItem('autotrans_settings', JSON.stringify(settings));
    updateSidebarModelDisplay();
}

function loadSettings() {
    const saved = localStorage.getItem('autotrans_settings');
    if (saved) {
        const settings = JSON.parse(saved);
        document.getElementById('openai-key-input').value = settings.openaiKey || settings.apiKey || '';
        document.getElementById('gemini-key-input').value = settings.geminiKey || '';
        document.getElementById('ai-model').value = settings.model || 'gpt-4o-mini';
    }
    updateSidebarModelDisplay();
}

function updateSidebarModelDisplay() {
    const settings = JSON.parse(localStorage.getItem('autotrans_settings') || '{}');
    const model = settings.model || 'gpt-4o-mini';
    const modelDisplay = document.getElementById('stat-model');
    if (modelDisplay) {
        modelDisplay.textContent = model;
    }
}

async function loadProjectHistory() {
    try {
        const response = await fetch(`/api/projects?ownerId=${ownerId}`);
        const projects = await response.json();
        const projectHistory = document.getElementById('project-history');
        projectHistory.innerHTML = projects.map(p => `
            <div class="project-item-wrapper ${currentBatchId === p.id ? 'active' : ''}" data-id="${p.id}">
                <button class="btn-ghost project-item" onclick="loadRecentProject('${p.id}')">
                    <i data-lucide="folder"></i>
                    <div class="project-info">
                        <span class="name">${p.name}</span>
                        <span class="date">${new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                </button>
                <button class="btn-delete-project" onclick="removeProject(event, '${p.id}')" title="삭제">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `).join('');
        lucide.createIcons();
    } catch (err) {
        console.error('Failed to load history:', err);
    }
}

window.removeProject = async (e, id) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    if (!confirm('이 프로젝트를 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`/api/projects/delete/${id}`, { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            if (currentBatchId === id) {
                location.href = '/'; // Reset view
            } else {
                await loadProjectHistory();
            }
        } else {
            alert('삭제 실패: ' + (result.error || '알 수 없는 오류'));
        }
    } catch (err) {
        console.error('Delete error:', err);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

window.loadRecentProject = async (id) => {
    currentPageIndex = 0; // Reset pagination
    currentBatchId = id;
    try {
        const response = await fetch(`/api/status/${id}`);
        const data = await response.json();
        currentProjectData = data;
        updateUI(data);
        startPolling();
        
        // Highlight active
        document.querySelectorAll('.project-item-wrapper').forEach(el => el.classList.remove('active'));
        const activeItem = document.querySelector(`.project-item-wrapper[data-id="${id}"]`);
        if (activeItem) activeItem.classList.add('active');
    } catch (err) {
        console.error('Project load error:', err);
    }
}

// Glossary Management
let currentGlossary = {};

async function loadGlossary() {
    if (!currentBatchId) return;
    const response = await fetch(`/api/glossary/${currentBatchId}`);
    currentGlossary = await response.json();
    renderGlossary();
}

function renderGlossary() {
    glossaryList.innerHTML = Object.entries(currentGlossary).map(([src, tgt]) => `
        <div class="glossary-item">
            <div class="terms">
                <span class="src">${src}</span>
                <span class="target">${tgt}</span>
            </div>
            <button class="btn-ghost btn-xs" onclick="removeGlossary('${src}')"><i data-lucide="x"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
}

btnAddGlossary.addEventListener('click', async () => {
    const src = glossarySrc.value.trim();
    const tgt = glossaryTgt.value.trim();
    if (!src || !tgt || !currentBatchId) return;

    currentGlossary[src] = tgt;
    await saveGlossary();
    glossarySrc.value = '';
    glossaryTgt.value = '';
    renderGlossary();
});

async function saveGlossary() {
    await fetch(`/api/glossary/${currentBatchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glossary: currentGlossary })
    });
}

window.removeGlossary = async (src) => {
    delete currentGlossary[src];
    await saveGlossary();
    renderGlossary();
};

btnExtractTerms.addEventListener('click', async () => {
    if (!currentProjectData) return;
    const allText = currentProjectData.files.map(f => f.pages.map(p => p.originalText).join(' ')).join(' ');
    const response = await fetch('/api/extract-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: allText })
    });
    const { terms } = await response.json();
    alert('추출된 용어 후보:\n' + terms.map(t => `${t.term} (${t.count}회)`).join('\n'));
});

window.updateTM = async (pageId, newText) => {
    // TM update normally needs original text too. Let's find it.
    const page = currentProjectData.files.flatMap(f => f.pages).find(p => p.id === pageId);
    if (!page || page.translatedText === newText) return;

    await fetch('/api/tm/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: page.originalText, target: newText })
    });
    console.log('TM updated for sentence');
};

btnStopProcess.addEventListener('click', async () => {
    if (!currentBatchId) return;
    if (!confirm('번역을 여기서 중지하시겠습니까? 현재까지 번역된 내용은 유지됩니다.')) return;
    
    try {
        const response = await fetch(`/api/stop/${currentBatchId}`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            // progressStatus.textContent = "중지 요청됨... 마지막 페이지 처리 중";
            btnStopProcess.disabled = true;
        }
    } catch (err) {
        alert('중지 요청 실패');
    }
});

btnCancelProcess.addEventListener('click', async () => {
    if (!currentBatchId) return;
    if (!confirm('번역을 취소하고 모든 데이터를 삭제하시겠습니까?')) return;
    
    try {
        // Stop first
        await fetch(`/api/stop/${currentBatchId}`, { method: 'POST' });
        // Then delete
        const response = await fetch(`/api/projects/delete/${currentBatchId}`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            location.reload();
        }
    } catch (err) {
        alert('취소 실패');
    }
});

// Init
// Glossary Modal Controls
const modalGlossary = document.getElementById('modal-glossary');
const btnToggleGlossary = document.getElementById('btn-toggle-glossary');
const btnCloseGlossary = document.getElementById('btn-close-glossary');
const glossaryTbody = document.getElementById('glossary-tbody');

btnToggleGlossary.addEventListener('click', () => {
    modalGlossary.classList.add('active');
    renderGlossaryTable();
});

btnCloseGlossary.addEventListener('click', () => {
    modalGlossary.classList.remove('active');
});

async function renderGlossaryTable() {
    // If no project selected, use 'global'
    const glossaryId = currentProjectData ? currentProjectData.id : 'global';
    const response = await fetch(`/api/glossary/${glossaryId}`);
    const glossary = await response.json();
    
    glossaryTbody.innerHTML = Object.entries(glossary).map(([src, tgt]) => `
        <tr>
            <td style="font-weight: 600;">${src}</td>
            <td style="color: var(--primary);">${tgt}</td>
            <td><button class="btn-delete-project" onclick="removeGlossaryTerm('${src}')"><i data-lucide="trash-2"></i></button></td>
        </tr>
    `).join('');
    lucide.createIcons();
}

window.removeGlossaryTerm = async (src) => {
    const glossaryId = currentProjectData ? currentProjectData.id : 'global';
    const response = await fetch(`/api/glossary/${glossaryId}`);
    const glossary = await response.json();
    delete glossary[src];
    
    await fetch(`/api/glossary/${glossaryId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(glossary)
    });
    renderGlossaryTable();
    if (currentProjectData) updateUI(currentProjectData);
};

document.getElementById('btn-add-glossary-full').addEventListener('click', async () => {
    const glossaryId = currentProjectData ? currentProjectData.id : 'global';
    const srcInput = document.getElementById('glossary-src-full');
    const tgtInput = document.getElementById('glossary-tgt-full');
    if (!srcInput.value || !tgtInput.value) return;
    
    const response = await fetch(`/api/glossary/${glossaryId}`);
    const glossary = await response.json();
    glossary[srcInput.value] = tgtInput.value;
    
    await fetch(`/api/glossary/${glossaryId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(glossary)
    });
    
    srcInput.value = '';
    tgtInput.value = '';
    renderGlossaryTable();
    if (currentProjectData) updateUI(currentProjectData);
});

// Unified Global Resizer Logic
let isResizing = false;

// Unified Global Resizer Logic
document.addEventListener('mousedown', (e) => {
    if (e.target.id === 'main-resizer') {
        const resizer = e.target;
        const splitPane = document.querySelector('.split-pane');
        if (!splitPane) return;

        document.body.classList.add('resizing');
        resizer.classList.add('dragging');

        const onMouseMove = (moveE) => {
            const rect = splitPane.getBoundingClientRect();
            const newWidth = ((moveE.clientX - rect.left) / rect.width) * 100;
            
            if (newWidth > 15 && newWidth < 85) {
                const widthVal = `${newWidth}%`;
                document.documentElement.style.setProperty('--source-width', widthVal);
                localStorage.setItem('autotrans-source-width', widthVal);
            }
        };

        const onMouseUp = () => {
            document.body.classList.remove('resizing');
            resizer.classList.remove('dragging');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }
});

const savedWidth = localStorage.getItem('autotrans-source-width');
if (savedWidth) {
    document.documentElement.style.setProperty('--source-width', savedWidth);
}

loadSettings();
loadTheme();
loadProjectHistory();
lucide.createIcons();

// [추가] V1.0.0 정식 배포 안내 팝업 로직 (강제 갱신 키 사용)
const modalNotice = document.getElementById('modal-notice');
const btnCloseNotice = document.getElementById('btn-close-notice');
const NOTICE_VERSION = '1.0.0_final'; // 키값 변경으로 강제 노출

function checkVersionNotice() {
    if (!modalNotice) return;
    
    // 1. 유효기간(오늘 하루/1주일) 체크
    const expireTime = localStorage.getItem('autotrans_notice_expires');
    const now = Date.now();
    if (expireTime && now < parseInt(expireTime)) {
        console.log('[Notice] In hide-period. Skipping display.');
        return;
    }

    // 2. 버전별 최초 노출 체크
    const lastNotifiedVersion = localStorage.getItem('autotrans_notice_v1');
    if (lastNotifiedVersion !== NOTICE_VERSION) {
        modalNotice.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

if (btnCloseNotice) {
    btnCloseNotice.addEventListener('click', () => {
        const hideToday = document.getElementById('notice-hide-today').checked;
        const hideWeek = document.getElementById('notice-hide-week').checked;
        
        if (hideWeek) {
            const expire = Date.now() + (7 * 24 * 60 * 60 * 1000);
            localStorage.setItem('autotrans_notice_expires', expire);
        } else if (hideToday) {
            const expire = Date.now() + (24 * 60 * 60 * 1000);
            localStorage.setItem('autotrans_notice_expires', expire);
        }

        localStorage.setItem('autotrans_notice_v1', NOTICE_VERSION);
        modalNotice.classList.remove('active');
    });
}

// 명시적으로 약간의 지연 후 실행 (DOM 안정화 대기)
setTimeout(checkVersionNotice, 500);
