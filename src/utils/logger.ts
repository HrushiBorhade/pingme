// pingme v2 — logging utility

import winston from 'winston';
import path from 'path';
import { homedir } from 'os';

const LOG_DIR = path.join(homedir(), '.pingme');
const LOG_FILE = path.join(LOG_DIR, 'daemon.log');

export function createLogger(level: string = 'info'): winston.Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
      }),
    ),
    transports: [
      new winston.transports.File({
        filename: LOG_FILE,
        maxsize: 5 * 1024 * 1024, // 5MB
        maxFiles: 3,
      }),
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} ${level} ${message}`;
          }),
        ),
      }),
    ],
  });
}

// Singleton for daemon use
let _logger: winston.Logger | null = null;

export function getLogger(): winston.Logger {
  if (!_logger) {
    _logger = createLogger();
  }
  return _logger;
}

export function setLogLevel(level: string): void {
  const logger = getLogger();
  logger.level = level;
}
