import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import routes from './routes';
import pool from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { initializeAuthTables } from './config/initDb';
import { startSessionCleanupScheduler } from './helpers/sessionHelper';
import requestLogger from './middleware/requestLogger';
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize database tables
async function startServer() {
  try {
    await initializeAuthTables();
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database:', { error: (error as any).message, stack: (error as any).stack });
    process.exit(1);
  }

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }));
  app.use(express.json());
  
  // Request logging middleware (Morgan)
  app.use(requestLogger);

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
    logger.info(`Server running on port ${PORT}`);
  });

  // Clean expired sessions on startup + every 24 hours
  const cleanupInterval = startSessionCleanupScheduler();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    clearInterval(cleanupInterval);
    await pool.end();
    process.exit(0);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason: any) => {
    logger.error('UNHANDLED REJECTION:', { 
      message: reason?.message || String(reason),
      stack: reason?.stack 
    });
    process.exit(1);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('UNCAUGHT EXCEPTION:', { 
      message: error.message,
      stack: error.stack 
    });
    process.exit(1);
  });
}

startServer();