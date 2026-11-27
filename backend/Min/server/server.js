require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { seedDatabase } = require('./scripts/seed');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { driver: fileStorageDriver } = require('./utils/fileHelpers');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const bookmarkRoutes = require('./routes/bookmarkRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const progressRoutes = require('./routes/progressRoutes');
const testRoutes = require('./routes/testRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const syllabusRoutes = require('./routes/syllabusRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ['Content-Disposition'], // lets React read the file name on downloads
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// NOTE: /uploads is deliberately NOT served statically. Files are only
// available through the protected GET /api/resources/:id/download endpoint.

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Smart Notes API is running',
    data: { database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/syllabi', syllabusRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not defined. Copy .env.example to .env and set it.');
    process.exit(1);
  }
  try {
    await connectDB();
    await seedDatabase();
    console.log('Seed data is ready.');
    console.log(`File storage backend: ${fileStorageDriver}.`);
  } catch (err) {
    console.error(`Database startup failed: ${err.message}`);
    process.exit(1);
  }

  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`));
};

if (require.main === module) {
  startServer();
}

module.exports = app;
