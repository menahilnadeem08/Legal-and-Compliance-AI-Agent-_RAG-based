import helmet from "helmet";
import cors from "cors";
import { Express } from "express";
import logger from "../utils/logger";

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) || [
  process.env.FRONTEND_URL || "http://localhost:3000",
].filter(Boolean);

export const applySecurityMiddleware = (app: Express) => {
  app.use(helmet());
  app.disable("x-powered-by");

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn("CORS blocked request", { origin });
          callback(new Error(`CORS policy: origin ${origin} not allowed`));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  logger.info("Security middleware applied (helmet + cors)");
};
