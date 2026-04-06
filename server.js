const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const queue = require('./utils/queue');
const storage = require('./utils/storage');
const glossary = require('./utils/glossary');
const tm = require('./utils/tm');
require('dotenv').config();

const app = express();

// Middleware (Global)
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Glossary APIs
app.get('/api/glossary/:projectId', (req, res) => {
    res.json(glossary.getGlossary(req.params.projectId));
});

app.post('/api/glossary/:projectId', (req, res) => {
    glossary.saveGlossary(req.params.projectId, req.body.glossary);
    res.json({ success: true });
});

app.post('/api/extract-terms', (req, res) => {
    const terms = glossary.extractPotentialTerms(req.body.text);
    res.json({ terms });
});

// TM Feedback
app.post('/api/tm/update', (req, res) => {
    tm.update(req.body.source, req.body.target);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3008;

// Basic storage setup
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
const outputDir = path.join(__dirname, process.env.OUTPUT_DIR || 'outputs');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Multer config
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage: multerStorage });

// Task Queue (In-memory for MVP)
const taskQueue = new Map();

// Routes
app.post('/api/check-api', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API Key missing' });
  
  try {
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey });
    await openai.models.list(); // Test call
    res.json({ success: true });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.post('/api/upload', upload.array('files'), (req, res) => {
  try {
    const files = req.files;
    const batchId = uuidv4();
    
    const project = {
      id: batchId,
      name: req.body.projectName || 'New Project',
      files: files.map(f => ({
        id: uuidv4(),
        originalName: f.originalname,
        path: f.path,
        mimetype: f.mimetype || (f.originalname.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream'),
        status: 'pending',
        pages: []
      })),
      status: 'pending',
      createdAt: new Date()
    };
    
    taskQueue.set(batchId, project);
    
    // Trigger processing asynchronously
    const options = {
      apiKey: req.body.apiKey,
      geminiApiKey: req.body.geminiApiKey,
      model: req.body.model,
      tone: req.body.tone,
      srcLang: req.body.srcLang || 'auto',
      targetLang: req.body.targetLang || 'Korean'
    };
    
    queue.startProcessing(project, taskQueue, outputDir, options).catch(err => {
      console.error('Core processing error:', err);
    });
    
    res.json({ success: true, batchId, project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop/:batchId', (req, res) => {
  const project = taskQueue.get(req.params.batchId);
  if (project) {
    project.stopRequested = true;
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

app.get('/api/status/:batchId', (req, res) => {
  let project = taskQueue.get(req.params.batchId);
  if (!project) {
    project = storage.loadProject(req.params.batchId);
    if (project) taskQueue.set(project.id, project);
  }
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.get('/api/projects', (req, res) => {
  const dir = path.join(__dirname, 'projects');
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const projects = files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { id: data.id, name: data.name, status: data.status, createdAt: data.createdAt };
    } catch (e) { return null; }
  }).filter(p => p !== null);
  res.json(projects);
});

app.post('/api/projects/delete/:id', (req, res) => {
  const filePath = path.join(__dirname, 'projects', `${req.params.id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

app.post('/api/projects/clear', (req, res) => {
  const dir = path.join(__dirname, 'projects');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.json')) fs.unlinkSync(path.join(dir, file));
    }
  }
  res.json({ success: true });
});

const appServer = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please close other servers.`);
  } else {
    console.error('Server failed to start:', err);
  }
});
