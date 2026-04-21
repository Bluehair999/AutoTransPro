const fs = require('fs');
const path = require('path');

const GLOSSARY_DIR = path.join(__dirname, '../data/glossary');
if (!fs.existsSync(GLOSSARY_DIR)) fs.mkdirSync(GLOSSARY_DIR, { recursive: true });

const DEFAULT_GLOSSARY_PATH = path.join(__dirname, 'default_glossary.json');
let DEFAULT_GLOSSARY = {};
try {
    if (fs.existsSync(DEFAULT_GLOSSARY_PATH)) {
        DEFAULT_GLOSSARY = JSON.parse(fs.readFileSync(DEFAULT_GLOSSARY_PATH, 'utf8'));
    }
} catch (e) { console.error('Default glossary load error:', e); }

function getGlossary(projectId) {
    const filePath = path.join(GLOSSARY_DIR, `${projectId}.json`);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return { ...DEFAULT_GLOSSARY };
}

function saveGlossary(projectId, glossary) {
    const filePath = path.join(GLOSSARY_DIR, `${projectId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(glossary, null, 2));
}

module.exports = {
    getGlossary,
    saveGlossary
};
