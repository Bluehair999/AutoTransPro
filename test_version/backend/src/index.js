const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Sequelize } = require('sequelize');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const authRouter = express.Router();
const projectRouter = express.Router();
const authController = require('./controllers/authController');
const projectController = require('./controllers/projectController');
const authMiddleware = require('./middleware/auth');

// Auth Routes
authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);

// Project Routes (Protected)
projectRouter.get('/', projectController.getProjects);
projectRouter.post('/', projectController.createProject);
projectRouter.get('/:id', projectController.getProjectDetail);
projectRouter.post('/:id/members', projectController.addMember);

app.use('/api/auth', authRouter);
app.use('/api/projects', authMiddleware, projectRouter);

// DB Connection & Sync
const db = require('./models');

async function checkDb() {
  try {
    await db.sequelize.authenticate();
    console.log('PostgreSQL Connected.');
    // In production, use migrations. For dev, sync is easy.
    await db.sequelize.sync({ alter: true });
    console.log('Database Synchronized.');
  } catch (err) {
    console.error('DB Connection Failed:', err);
  }
}

// Socket.io for Real-time
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('join-project', (projectId) => {
    socket.join(`project-${projectId}`);
  });
});

// Basic Health Check
app.get('/health', (req, res) => res.send('API is running.'));

server.listen(PORT, () => {
  console.log(`Enterprise API Server on port ${PORT}`);
  checkDb();
});

module.exports = { sequelize, io };
