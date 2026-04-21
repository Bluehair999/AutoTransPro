const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const PROJECTS_DIR = path.join(__dirname, '../projects');
const CACHE_DIR = path.join(__dirname, '../cache');

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR);
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

const saveQueue = new Map();

/**
 * [추가/개선] 비동기 프로젝트 저장 및 쓰로틀링(Throttling)
 */
function saveProject(project) {
    const projectId = project.id;
    
    // 만약 이미 저장 대기 중이면 큐에만 업데이트하고 무시
    if (saveQueue.has(projectId)) {
        saveQueue.set(projectId, project);
        return;
    }
    
    saveQueue.set(projectId, project);
    
    // 1500ms(1.5초) 간격으로 실제 디스크 쓰기 수행
    setTimeout(async () => {
        const currentData = saveQueue.get(projectId);
        if (!currentData) return;
        
        saveQueue.delete(projectId);
        const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);
        
        try {
            // Speed Highlight: null, 2(들여쓰기)를 제거하여 직렬화 속도 향상 및 파일 크기 축소
            await fsPromises.writeFile(filePath, JSON.stringify(currentData), 'utf8');
        } catch (err) {
            console.error(`[Storage Error] Project ${projectId} save failed:`, err);
        }
    }, 1500);
}

/**
 * Load Project State (Sync during init is fine)
 */
function loadProject(projectId) {
    const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error("Load failed:", e);
            return null;
        }
    }
    return null;
}

/**
 * Get Hash for Text (Internal)
 */
function getTextHash(text) {
    return crypto.createHash('md5').update(text.trim()).digest('hex');
}

/**
 * Get Cached Translation
 */
function getCachedTranslation(text, targetLang) {
    const hash = getTextHash(text);
    const cachePath = path.join(CACHE_DIR, `${targetLang}-${hash}.json`);
    if (fs.existsSync(cachePath)) {
        try {
            return JSON.parse(fs.readFileSync(cachePath, 'utf8')).result;
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * Save Translation to Cache (Async)
 */
async function saveToCache(text, targetLang, result) {
    try {
        const hash = getTextHash(text);
        const cachePath = path.join(CACHE_DIR, `${targetLang}-${hash}.json`);
        // Remove indent for cache too
        await fsPromises.writeFile(cachePath, JSON.stringify({ original: text, result, createdAt: new Date() }), 'utf8');
    } catch(e) {}
}

module.exports = {
    saveProject,
    loadProject,
    getCachedTranslation,
    saveToCache
};
