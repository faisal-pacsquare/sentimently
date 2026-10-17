import { Global, Injectable, Logger, Module } from '@nestjs/common';

export interface ErrorContext {
  requestId?: string;
  route?: string;
  status: number;
}

/**
 * Server errors (5xx) go to the log and, if ERROR_WEBHOOK_URL is set, to a chat or paging webhook
 * (the body is {"text": "..."} which Slack and Discord-style webhooks accept).
 * The same error is sent at most once a minute so one broken route cannot flood the channel.
 * A hosted tool such as Sentry can replace this class later without touching the rest of the code.
 */
@Injectable()
export class ErrorReporter {
  private readonly logger = new Logger('Errors');
  private readonly recent = new Map<string, number>();

  async capture(error: unknown, ctx: ErrorContext) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error({ msg: 'server error', message, ...ctx });

    const url = process.env.ERROR_WEBHOOK_URL;
    if (!url) return;
    const key = `${ctx.route}|${message}`;
    const now = Date.now();
    if (now - (this.recent.get(key) ?? 0) < 60_000) return;
    this.recent.set(key, now);
    if (this.recent.size > 200) this.recent.clear();
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `[Bloomora ${process.env.NODE_ENV ?? 'dev'}] ${ctx.status} on ${ctx.route ?? '?'}: ${message} (request ${ctx.requestId ?? '?'})`,
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch (e) {
      this.logger.warn(`Could not reach the error webhook: ${String(e)}`);
    }
  }
}

@Global()
@Module({ providers: [ErrorReporter], exports: [ErrorReporter] })
export class ErrorReporterModule {}
