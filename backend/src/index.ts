import 'dotenv/config';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import routes from './routes';
import pool from './config/database';
import { errorHandler, AppError } from './middleware/errorHandler';
import { initializeAuthTables } from './config/initDb';
import { startSessionCleanupScheduler } from './helpers/sessionHelper';
import requestLogger from './middleware/requestLogger';
import { applySecurityMiddleware } from './middleware/security';
import { generalLimiter } from './middleware/rateLimiter';
import logger from './utils/logger';

if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

const app = express();
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await initializeAuthTables();
    logger.info('Database initialized');
  } catch (error) {
    logger.error('Failed to initialize database', { error });
    process.exit(1);
  }

  applySecurityMiddleware(app);
  app.use(requestLogger);
  app.use('/api', generalLimiter);
  app.use(express.json());

  app.use('/api', routes);

  app.get('/health', (req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  // 404 handler — pass to error handler
  app.use((req: Request, res: Response, next: NextFunction) => {
    next(new AppError(`Route ${req.originalUrl} not found`, 404));
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
    clearInterval(cleanupInterval);
    await pool.end();
    process.exit(0);
  });
}

startServer();

// Unhandled errors
process.on('unhandledRejection', (err: any) => {
  logger.error('UNHANDLED REJECTION:', { message: err?.message, stack: err?.stack });
  process.exit(1);
});

process.on('uncaughtException', (err: any) => {
  logger.error('UNCAUGHT EXCEPTION:', { message: err?.message, stack: err?.stack });
  process.exit(1);
});