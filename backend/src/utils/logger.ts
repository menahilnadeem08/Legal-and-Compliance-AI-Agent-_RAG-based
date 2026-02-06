/**
 * Simple logger utility that respects NODE_ENV
 * - Development: Verbose logging
 * - Production: Only error logs
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';

export const logger = {
  /**
   * Log info messages (only in development)
   */
  info: (prefix: string, message: string, data?: any) => {
    if (isDevelopment) {
      if (data) {
        console.log(`[${prefix}] ${message}`, data);
      } else {
        console.log(`[${prefix}] ${message}`);
      }
    }
  },

  /**
   * Log success messages (only in development)
   */
  success: (prefix: string, message: string, data?: any) => {
    if (isDevelopment) {
      if (data) {
        console.log(`[${prefix}] ✓ ${message}`, data);
      } else {
        console.log(`[${prefix}] ✓ ${message}`);
      }
    }
  },

  /**
   * Log error messages (always logged)
   */
  error: (prefix: string, message: string, error?: any) => {
    if (error) {
      console.error(`[${prefix}] ❌ ${message}`, error);
    } else {
      console.error(`[${prefix}] ❌ ${message}`);
    }
  },

  /**
   * Log warning messages (always logged)
   */
  warn: (prefix: string, message: string, data?: any) => {
    if (data) {
      console.warn(`[${prefix}] ⚠️ ${message}`, data);
    } else {
      console.warn(`[${prefix}] ⚠️ ${message}`);
    }
  },
};
