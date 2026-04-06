/**
 * 번역 품질 검증 모듈
 */

function verify(original, translated, glossary = {}) {
    const warnings = [];
    let score = 100;

    // 1. 숫자 보존 검사
    const originalNumbers = original.match(/\d+(\.\d+)?/g) || [];
    const translatedNumbers = translated.match(/\d+(\.\d+)?/g) || [];

    const numDiff = originalNumbers.filter(n => !translatedNumbers.includes(n));
    if (numDiff.length > 0) {
        warnings.push(`숫자 불일치 탐지: ${numDiff.join(', ')}`);
        score -= 20;
    }

    // 2. 용어집 준수 검사
    Object.entries(glossary).forEach(([src, tgt]) => {
        if (original.toLowerCase().includes(src.toLowerCase())) {
            if (!translated.includes(tgt)) {
                warnings.push(`용어 미적용: ${src} -> ${tgt}`);
                score -= 10;
            }
        }
    });

    // 3. 구조 검사 (문단 수)
    const origParagraphs = original.split('\n').filter(p => p.trim()).length;
    const transParagraphs = translated.split('\n').filter(p => p.trim()).length;
    if (Math.abs(origParagraphs - transParagraphs) > 1) {
        warnings.push(`구조 불일치 경고 (문단 수 차이)`);
        score -= 15;
    }

    // 4. 길이 검사 (누락 탐지)
    if (translated.length < original.length * 0.5) {
        warnings.push(`내용 누락 의심 (번역문이 너무 짧음)`);
        score -= 30;
    }

    return { 
        isValid: warnings.length === 0, 
        warnings, 
        score: Math.max(0, score) 
    };
}

module.exports = { verify };
