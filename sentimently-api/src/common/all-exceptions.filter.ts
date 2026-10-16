import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorReporter } from './error-reporter';
import type { RequestWithId } from './request-id.middleware';

const CODES: Record<number, string> = {
  400: 'validation_error',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  429: 'rate_limited',
};

/**
 * One error shape for the whole API: { error: { code, message, details?, requestId } }.
 * A failure is never turned into a 404 or an empty list (prototype finding 1).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly reporter?: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();

    let status = 500;
    let code = 'internal_error';
    let message = 'Something went wrong. Please try again.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODES[status] ?? 'http_error';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[] };
        if (Array.isArray(b.message)) {
          message = 'The request is not valid.';
          details = b.message;
        } else if (b.message) {
          message = b.message;
        }
      }
      if (status === 429)
        message = 'Too many requests. Please wait and try again.';
    }

    // Errors from libraries (for example a request body that is too big) carry their own 4xx status.
    // They are the client's mistake, not a server fault, and must not be reported as one.
    if (!(exception instanceof HttpException)) {
      const status4xx =
        (exception as { status?: unknown; statusCode?: unknown })?.status ??
        (exception as { statusCode?: unknown })?.statusCode;
      if (
        typeof status4xx === 'number' &&
        status4xx >= 400 &&
        status4xx < 500
      ) {
        status = status4xx;
        code = CODES[status] ?? 'bad_request';
        message =
          status === 413
            ? 'The request is too large.'
            : 'The request could not be understood.';
      }
    }

    // Server errors are reported (logged, and sent to the error webhook if one is set). Client mistakes are not.
    if (status >= 500) {
      const route = (req as { route?: { path?: string } }).route?.path;
      if (this.reporter) {
        void this.reporter.capture(exception, {
          requestId: req.id,
          route,
          status,
        });
      } else {
        this.logger.error(
          `[${req.id}] ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`,
        );
      }
    }

    res.setHeader('Cache-Control', 'no-store'); // never let a CDN keep an error
    res.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        requestId: req.id,
      },
    });
  }
}
