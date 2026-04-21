const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const sharp = require('sharp');

/**
 * Split PDF into individual pages
 */
async function splitPdf(filePath, outputDir, onProgress = null) {
  const data = await fsPromises.readFile(filePath);
  const pdfDoc = await PDFDocument.load(data);
  const pageCount = pdfDoc.getPageCount();
  const pagePaths = [];

  for (let i = 0; i < pageCount; i++) {
    if (onProgress) await onProgress(i + 1, pageCount);
    
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(page);
    
    const pageFileName = `page-${i + 1}-${path.basename(filePath)}`;
    const pagePath = path.join(outputDir, pageFileName);
    const pdfBytes = await newPdf.save();
    
    await fsPromises.writeFile(pagePath, pdfBytes);
    pagePaths.push({ index: i + 1, path: pagePath });
    
    // Yield the event loop to prevent freezing
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return pagePaths;
}

/**
 * Extract text from PDF (Standard text layer)
 */
async function extractTextFromPdf(filePath) {
  const dataBuffer = await fsPromises.readFile(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text.trim();
}

/**
 * Placeholder for Image to Base64 (for Vision API)
 */
async function imageToBase64(filePath) {
  const buffer = await fs.readFile(filePath);
  return buffer.toString('base64');
}

module.exports = {
  splitPdf,
  extractTextFromPdf,
  imageToBase64
};
