import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import logger from "../utils/logger";

//const DISABLED = process.env.DISABLE_RATE_LIMIT === "true" || process.env.DISABLE_RATE_LIMIT === "1";
const DISABLED = true;
const noopLimiter = (_req: Request, _res: Response, next: NextFunction) => next();

const createLimiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn("Rate limit exceeded", {
        ip: req.ip,
        url: req.url,
        method: req.method,
      });
      res.status(429).json({
        success: false,
        message,
      });
    },
  });

export const authLimiter = DISABLED ? noopLimiter : createLimiter(
  15 * 60 * 1000,
  5,
  "Too many attempts. Please try again in 15 minutes."
);

export const resendLimiter = DISABLED ? noopLimiter : createLimiter(
  10 * 60 * 1000,
  3,
  "Too many resend requests. Please try again in 10 minutes."
);

export const generalLimiter = DISABLED ? noopLimiter : createLimiter(
  15 * 60 * 1000,
  100,
  "Too many requests. Please slow down."
);

export const adminLimiter = DISABLED ? noopLimiter : createLimiter(
  15 * 60 * 1000,
  30,
  "Too many admin requests. Please try again in 15 minutes."
);
