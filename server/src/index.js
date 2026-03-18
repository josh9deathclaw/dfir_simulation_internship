const express = require('express');
const cors = require("cors")
require('dotenv').config();

const db = require('./db');
const port = process.env.PORT || 3001;
const app = express();

app.use(cors());
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
const submissionsRoutes = require('./routes/submissions');

app.use('/api/attempts',     attemptsRoutes);
app.use('/api/submissions',  submissionsRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
