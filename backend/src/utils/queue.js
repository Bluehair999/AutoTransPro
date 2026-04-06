const { Queue } = require('bullmq');
const IORedis = require('ioredis');
require('dotenv').config();

const connection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379', {
    maxRetriesPerRequest: null
});

const translationQueue = new Queue('translation-tasks', { connection });

async function addTranslationJob(data) {
    return await translationQueue.add('translate', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
    });
}

module.exports = { translationQueue, addTranslationJob, connection };
