const express = require('express');
const cors = require("cors")
require('dotenv').config();

const db = require('./db');
const port = process.env.PORT || 3001;
const app = express();

const allowedOrigins = [
  'http://localhost:3000', // local React dev server
  'https://dfir-simulation-internship-9ooxkzova-josh-dd61e37e.vercel.app', // frontend
];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const classesRoutes = require('./routes/classes');
app.use('/api/classes', classesRoutes);

const scenariosRoutes = require('./routes/scenarios');
app.use('/api/scenarios', scenariosRoutes);

const uploadsRoutes = require('./routes/uploads');
app.use('/api/uploads', uploadsRoutes);

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const attemptsRoutes    = require('./routes/attempts');
app.use('/api/attempts',     attemptsRoutes);

const submissionsRoutes = require('./routes/submissions');
app.use('/api/submissions',  submissionsRoutes);

const gradingRoutes = require('./routes/grading');
app.use('/api/grading', gradingRoutes);

const resultsRoutes = require('./routes/results');
app.use('/api/results', resultsRoutes);

const vmRoutes = require('./routes/vm');
app.use('/api/vm', vmRoutes);

const dashboardRouter = require('./routes/dashboard');
app.use('/api/dashboard', dashboardRouter);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
