import type { LoggerService, LogLevel } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { RequestWithId } from './request-id.middleware';

const ORDER: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];

/**
 * One JSON object per line, which log tools (Vercel logs, Datadog, Loki) can search and alert on.
 * Used in production; locally Nest's readable logger is kept.
 */
export class JsonLogger implements LoggerService {
  private readonly min: number;

  constructor(level: string = process.env.LOG_LEVEL ?? 'log') {
    this.min = Math.max(0, ORDER.indexOf(level as LogLevel));
  }

  private write(level: LogLevel, message: unknown, params: unknown[]) {
    if (ORDER.indexOf(level) < this.min) return;
    const last = params[params.length - 1];
    const context = typeof last === 'string' ? last : undefined;
    const extra =
      level === 'error' && typeof params[0] === 'string' && params.length > 1
        ? { stack: params[0] }
        : {};
    const body =
      typeof message === 'object' && message !== null
        ? message
        : { msg: String(message) };
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      context,
      ...body,
      ...extra,
    });
    (level === 'error' || level === 'fatal'
      ? process.stderr
      : process.stdout
    ).write(`${line}\n`);
  }

  log(message: unknown, ...params: unknown[]) {
    this.write('log', message, params);
  }
  error(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]) {
    this.write('verbose', message, params);
  }
  fatal(message: unknown, ...params: unknown[]) {
    this.write('fatal', message, params);
  }
}

export const createLogger = () =>
  process.env.NODE_ENV === 'production' ? new JsonLogger() : undefined;

/**
 * One line per request: method, route PATTERN, status, time, request id.
 * The pattern (/gift-links/:token), never the real URL, so private links and ids never reach the logs.
 * No bodies, headers or query strings are logged.
 */
export function requestLogger(logger: LoggerService) {
  return (req: RequestWithId, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      logger.log(
        {
          msg: 'request',
          method: req.method,
          route:
            (req.route as { path?: string } | undefined)?.path ?? 'unmatched',
          status: res.statusCode,
          ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
          requestId: req.id,
        },
        'http',
      );
    });
    next();
  };
}
