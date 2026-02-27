import { EventEmitter } from 'events';
import winstonLogger from '../utils/logger';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'debug' | 'warn' | 'error';
  stage: string;
  message: string;
  data?: any;
}

/**
 * Logger service that emits log events as the RAG pipeline executes.
 * Used for real-time streaming to frontend.
 */
export class PipelineLogger extends EventEmitter {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  constructor() {
    super();
  }

  /**
   * Log an info-level message during pipeline execution
   */
  info(stage: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      stage,
      message,
      data,
    };
    this.addLog(entry);
    this.emit('log', entry);
    winstonLogger.info(message, { stage, data });
  }

  /**
   * Log a debug message
   */
  debug(stage: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      stage,
      message,
      data,
    };
    this.addLog(entry);
    this.emit('log', entry);
    winstonLogger.debug(message, { stage, data });
  }

  /**
   * Log a warning message
   */
  warn(stage: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      stage,
      message,
      data,
    };
    this.addLog(entry);
    this.emit('log', entry);
    winstonLogger.warn(message, { stage, data });
  }

  /**
   * Log an error message
   */
  error(stage: string, message: string, error?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      stage,
      message,
      data: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    };
    this.addLog(entry);
    this.emit('log', entry);
    winstonLogger.error(message, { stage, error });
  }

  /**
   * Add to internal log history (for debugging)
   */
  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }
}

// Global logger instance
export const pipelineLogger = new PipelineLogger();
