const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const translator = require('./translator');

/**
 * PDF 레이아웃 보존 번역 (Overlay 방식)
 */
async function translatePdf(filePath, outputDir, options = {}) {
    const dataBuffer = fs.readFileSync(filePath);
    
    // 1. PDF 텍스트 및 좌표 정보 추출을 위한 커스텀 렌더러
    const pagesInfo = [];
    
    async function customPageRender(pageData) {
        const textContent = await pageData.getTextContent();
        const items = textContent.items.map(item => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
            fontSize: item.transform[0] // 대략적인 폰트 크기
        }));
        
        // 행(Line) 단위로 텍스트 그룹화
        const lines = [];
        let currentLine = null;
        
        // Y 좌표 기준으로 정렬 (내림차순 - 위에서 아래로)
        const sortedItems = items.sort((a, b) => b.y - a.y || a.x - b.x);
        
        for (const item of sortedItems) {
            if (!currentLine || Math.abs(currentLine.y - item.y) > 5) {
                if (currentLine) lines.push(currentLine);
                currentLine = {
                    text: item.text,
                    x: item.x,
                    y: item.y,
                    maxY: item.y + item.fontSize,
                    items: [item]
                };
            } else {
                currentLine.text += (currentLine.text.endsWith(' ') || item.text.startsWith(' ') ? '' : ' ') + item.text;
                currentLine.items.push(item);
                currentLine.x = Math.min(currentLine.x, item.x);
            }
        }
        if (currentLine) lines.push(currentLine);
        
        pagesInfo.push({ lines });
        return ""; // 실제 텍스트는 필요 없음
    }

    await pdfParse(dataBuffer, { pagerender: customPageRender });

    // 2. 번역 수행 (모든 페이지의 라인을 모아서 일괄 번역)
    const allLines = pagesInfo.flatMap(p => p.lines);
    const originalTexts = allLines.map(l => l.text).filter(t => t.trim().length > 0);
    
    if (originalTexts.length === 0) return filePath;

    const targetLanguage = options.targetLangLabel || options.targetLang || 'Korean';
    
    // [수정] 미리보기(단락 단위)와 PDF 오버레이(줄 단위)의 데이터 정교함이 다르므로 재사용 대신 전용 번역 수행
    const translationResult = await translator.translateBulkUnits(
        originalTexts, 
        options.srcLang || 'auto', 
        targetLanguage, 
        options.apiKey,
        options
    );
    const translationMap = translationResult.map || {};
    const pdfDoc = await PDFDocument.load(dataBuffer);
    
    // 폰트킷 등록 (커스텀 폰트 사용을 위함)
    pdfDoc.registerFontkit(fontkit);
    
    // 한글 폰트 로드 (Windows 시스템 폰트 - 맑은 고딕 사용)
    let font;
    try {
        const fontPath = "C:\\Windows\\Fonts\\malgun.ttf";
        const fontBytes = fs.readFileSync(fontPath);
        font = await pdfDoc.embedFont(fontBytes);
    } catch (fontErr) {
        console.warn("[Font Load Failed] Falling back to Helvetica:", fontErr);
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

    // [개선] 매칭 정확도를 위해 번역 맵의 키를 정규화 (공백 제거 등)
    const normalizedMap = {};
    for (const [key, val] of Object.entries(translationMap)) {
        normalizedMap[key.replace(/\s+/g, ' ').trim()] = val;
    }

    const pages = pdfDoc.getPages();
    
    for (let i = 0; i < pages.length; i++) {
        if (!pagesInfo[i]) continue;
        const page = pages[i];
        const { width, height } = page.getSize();
        
        for (const line of pagesInfo[i].lines) {
            const normalizedLine = line.text.replace(/\s+/g, ' ').trim();
            const translated = normalizedMap[normalizedLine];
            if (!translated) continue;

            // 라인 전체를 덮는 흰색 박스 생성
            // [개선] 가로 길이에 여유를 주고, 높이를 폰트 크기에 맞춰 정밀 조정
            const lineRectWidth = line.items.reduce((sum, it) => sum + it.width, 0) + 10; 
            const baseFontSize = line.items[0].fontSize;
            
            page.drawRectangle({
                x: line.x - 2,
                y: line.y - (baseFontSize * 0.2), // 베이스라인 아래로 약간 내림
                width: lineRectWidth + 4,
                height: baseFontSize * 1.2, // 폰트 높이에 맞춤
                color: rgb(1, 1, 1), // White
            });

            // 번역된 텍스트 작성
            // [개선] 글자 크기를 약간 줄이고 정밀한 위치에 배치
            page.drawText(translated, {
                x: line.x,
                y: line.y,
                size: Math.max(6, baseFontSize * 0.85), // 너무 작아지지 않게 제한
                font: font,
                color: rgb(0, 0, 0),
            });
        }
    }

    const pdfBytes = await pdfDoc.save();
    const originalName = path.basename(filePath);
    const outputFileName = `layout_${originalName}`;
    const outputPath = path.join(outputDir, outputFileName);
    fs.writeFileSync(outputPath, pdfBytes);

    return outputPath;
}

module.exports = {
    translatePdf
};
