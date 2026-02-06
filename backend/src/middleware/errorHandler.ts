import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  details?: any;
}

/**
 * Centralized error handling middleware
 * Catches all errors from controllers and formats them consistently
 */
export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'An unexpected error occurred';

  console.error(`[${new Date().toISOString()}] Error:`, JSON.stringify({
    method: req.method,
    path: req.path,
    statusCode,
    message,
    details: error.details,
    stack: error.stack,
  }, null, 2));

  // Prevent sending response twice
  if (res.headersSent) {
    return next(error);
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { details: error.details }),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
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
