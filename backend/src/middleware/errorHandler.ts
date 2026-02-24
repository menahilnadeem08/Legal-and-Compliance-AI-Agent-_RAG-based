import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import logger from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  details?: any;
  code?: string;
}

/**
 * Centralized error handling middleware
 * Catches all errors from controllers and formats them consistently.
 * Never leaks stack traces in production.
 */
export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let errors: { field: string; message: string }[] | undefined;

  // JWT errors
  if (error instanceof jwt.TokenExpiredError) {
    statusCode = 401;
    message = 'Token expired';
    logger.warn('Expired token used', { ip: req.ip, url: req.url });
  } else if (error instanceof jwt.JsonWebTokenError) {
    statusCode = 401;
    message = 'Invalid token';
    logger.warn('Invalid token used', { ip: req.ip, url: req.url });
  }
  // Zod errors that bypassed validate middleware
  else if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    const issues = (error as ZodError & { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
    errors = issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    logger.warn('Validation failed (error handler)', { method: req.method, url: req.url, errors, ip: req.ip });
  }
  // PostgreSQL unique violation (duplicate key)
  else if (error.code === '23505') {
    statusCode = 409;
    message = 'A record with this value already exists';
    logger.warn('Duplicate key violation', { code: error.code, url: req.url, ip: req.ip });
  }
  // PostgreSQL foreign key / not found style
  else if (error.code === '23503') {
    statusCode = 400;
    message = 'Referenced record does not exist';
    logger.warn('Foreign key violation', { code: error.code, url: req.url, ip: req.ip });
  }
  // Generic log for unhandled
  else {
    logger.error(`${req.method} ${req.url} - ${message}`, {
      stack: error.stack,
      statusCode,
      ip: req.ip,
      details: error.details,
    });
  }

  if (res.headersSent) {
    return next(error);
  }

  const payload: Record<string, unknown> = {
    success: false,
    message,
    error: message,
  };
  if (errors && errors.length > 0) payload.errors = errors;
  if (process.env.NODE_ENV === 'development' && error.details) payload.details = error.details;
  if (process.env.NODE_ENV === 'development' && error.stack) payload.stack = error.stack;

  res.status(statusCode).json(payload);
};

/**
 * Wrapper to catch async errors in Express route handlers
 * Usage: router.post('/path', asyncHandler(controllerFunction))
 * Generic to support both Request and AuthenticatedRequest types
 */
export const asyncHandler = <T extends Request = Request>(
  fn: (req: T, res: Response, next?: NextFunction) => Promise<any>
) => {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create a typed error for the API
 */
export class AppError extends Error implements ApiError {
  statusCode: number;
  details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}
