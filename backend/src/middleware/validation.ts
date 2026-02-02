import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { AppError } from './errorHandler';

/**
 * Validation error handler middleware
 * Checks for validation errors from express-validator
 * Should be placed after validation rules in the route chain
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err: any) => {
      let value = err.value !== undefined ? err.value : err.data?.value;
      
      // Convert object values to JSON string for readability
      if (typeof value === 'object' && value !== null) {
        value = JSON.stringify(value);
      }
      
      return {
        field: err.type === 'field' ? err.path : 'unknown',
        message: err.msg,
        value: value,
      };
    });

    return next(
      new AppError(
        'Validation failed',
        400,
        { errors: formattedErrors }
      )
    );
  }

  next();
};
