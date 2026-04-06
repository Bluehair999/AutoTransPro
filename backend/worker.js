/**
 * Independent Worker Process Entry Point
 */
require('dotenv').config();
const { sequelize } = require('./src/models');
require('./src/utils/worker');

async function start() {
    try {
        await sequelize.authenticate();
        console.log('Worker connected to Database.');
        console.log('Worker is waiting for jobs...');
    } catch (err) {
        console.error('Worker failed to connect to DB:', err);
    }
}

start();
