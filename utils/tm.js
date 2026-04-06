const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TM_DIR = path.join(__dirname, '../data/tm');

if (!fs.existsSync(TM_DIR)) {
    fs.mkdirSync(TM_DIR, { recursive: true });
}

function getHash(text) {
    return crypto.createHash('md5').update(text.trim()).digest('hex');
}

/**
 * 번역 메모리 조회
 */
function lookup(sourceText) {
    const hash = getHash(sourceText);
    const filePath = path.join(TM_DIR, `${hash}.json`);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')).target;
    }
    return null;
}

/**
 * 번역 메모리 저장 (사용자 수정 시 호출)
 */
function update(sourceText, targetText) {
    const hash = getHash(sourceText);
    const filePath = path.join(TM_DIR, `${hash}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
        source: sourceText,
        target: targetText,
        updatedAt: new Date().toISOString()
    }));
}

module.exports = {
    lookup,
    update
};
