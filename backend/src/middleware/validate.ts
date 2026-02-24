import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import logger from "../utils/logger";

const validate = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse({
      body: req.body,
      params: req.params,
      query: req.query,
    });
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = (error as ZodError & { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
      const errors = issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      logger.warn("Validation failed", {
        method: req.method,
        url: req.url,
        errors,
        ip: req.ip,
      });

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }
    next(error);
  }
};

export default validate;
