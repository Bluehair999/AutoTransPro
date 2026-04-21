const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');
const translator = require('./translator');

/**
 * .docx 레이아웃 보존 번역 핵심 로직
 */
async function translateDocx(filePath, outputDir, options = {}) {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    
    // 1. document.xml 추출
    const docXmlPath = 'word/document.xml';
    let docXml = await zip.file(docXmlPath).async('text');

    // 2. 텍스트 노드(<w:t>) 추출 및 번역 대상 수집
    // 단순화를 위해 모든 <w:t> 태그 내의 텍스트를 수집합니다.
    // 주의: 문장이 여러 태그로 쪼개져 있을 수 있음 (Merge logic 필요)
    const textNodes = [];
    const tRegex = /<w:t[^>]*>(.*?)<\/w:t>/g;
    let match;
    const originalTexts = [];

    while ((match = tRegex.exec(docXml)) !== null) {
        const text = match[1];
        if (text && text.trim().length > 0) {
            originalTexts.push(text);
        }
    }

    if (originalTexts.length === 0) return filePath;

    // 3. 일괄 번역 수행 (Sprint 모드 활용)
    const targetLanguage = options.targetLangLabel || options.targetLang || 'Korean';
    const translationResult = await translator.translateBulkUnits(
        originalTexts, 
        options.srcLang || 'auto', 
        targetLanguage, 
        options.apiKey, 
        options
    );

    const translationMap = translationResult.map;

    // 4. XML 내 텍스트 치환
    // 주의: 단순 치환은 중복 텍스트 처리에 취약할 수 있으므로, 태그 단위로 정확히 매칭해야 함
    // 여기서는 안전을 위해 정규식 replace callback을 사용합니다.
    let replacedXml = docXml.replace(/<w:t[^>]*>(.*?)<\/w:t>/g, (fullTag, content) => {
        const translated = translationMap[content];
        if (translated) {
            // 태그 내 속성(xml:space="preserve" 등)은 유지하되 내용만 바꿈
            return fullTag.replace(content, translated);
        }
        return fullTag;
    });

    // 5. 변경된 XML을 다시 Zip에 저장
    zip.file(docXmlPath, replacedXml);

    // 6. 결과 파일 저장
    const originalName = path.basename(filePath);
    const outputFileName = `layout_${originalName}`;
    const outputPath = path.join(outputDir, outputFileName);
    
    const content = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(outputPath, content);

    return outputPath;
}

module.exports = {
    translateDocx
};
