const { Worker } = require('bullmq');
const { connection } = require('./queue');
const translator = require('./translator');
const verifier = require('./verifier');
const { Page, File, Project } = require('../models');

/**
 * Worker Processor
 */
const worker = new Worker('translation-tasks', async job => {
  const { pageId, text, sourceLang, targetLang, apiKey, options, projectId } = job.data;
  
  console.log(`Processing Job ${job.id} for Page ${pageId}`);

  try {
    // 1. AI Translation
    const result = await translator.translateText(text, sourceLang, targetLang, apiKey, options);

    // 2. Verification
    const vResult = verifier.verify(text, result.content, options.glossary || {});

    // 3. Update DB
    const page = await Page.findByPk(pageId);
    if (page) {
      await page.update({
        translatedText: result.content,
        status: 'completed',
        method: result.method,
        warnings: vResult.warnings,
        score: vResult.score
      });
      
      // Update Project Usage (simplified)
      const project = await Project.findByPk(projectId);
      if (project) {
        const usage = project.usage || { totalTokens: 0, estimatedCost: 0 };
        usage.totalTokens += result.usage.total_tokens || 0;
        usage.estimatedCost += ((result.usage.total_tokens || 0) / 1000) * 0.03;
        await project.update({ usage });
      }
    }
    
    return { success: true, pageId };
  } catch (err) {
    console.error(`Worker error on job ${job.id}:`, err);
    const page = await Page.findByPk(pageId);
    if (page) await page.update({ status: 'failed' });
    throw err;
  }
}, { connection });

worker.on('completed', job => {
  console.log(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`Job ${job.id} has failed with ${err.message}`);
});

module.exports = worker;
