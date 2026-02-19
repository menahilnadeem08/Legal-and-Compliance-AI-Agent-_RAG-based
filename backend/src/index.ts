import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes';
import pool from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { initializeAuthTables } from './config/initDb';
import { startSessionCleanupScheduler } from './helpers/sessionHelper';

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize database tables
async function startServer() {
  try {
    await initializeAuthTables();
    console.log('Database initialized');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }));
  app.use(express.json());

  // Routes
  app.use('/api', routes);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Centralized error handling middleware (MUST be last)
  app.use(errorHandler);

  // Start server
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Clean expired sessions on startup + every 24 hours
  const cleanupInterval = startSessionCleanupScheduler();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    clearInterval(cleanupInterval);
    await pool.end();
    process.exit(0);
  });
}

startServer();