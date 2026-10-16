import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ErrorReporter } from './common/error-reporter';
import { createLogger, JsonLogger, requestLogger } from './common/json-logger';
import { requestId } from './common/request-id.middleware';
import { API_PREFIX, buildOpenApi, sortKeys } from './openapi';
import { configureCors, securityHeaders } from './common/security';

/** Settings shared by the local server (main.ts), the Vercel function (vercel.ts) and e2e tests. */
export function setupApp(app: INestApplication) {
  // Behind Vercel's proxy the client address is in X-Forwarded-For; without this every visitor shares one rate limit.
  // Only trust it where a proxy really sits in front, or clients could fake their address.
  if (process.env.VERCEL || process.env.TRUST_PROXY) {
    (
      app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }
    ).set('trust proxy', 1);
  }
  (app.getHttpAdapter().getInstance() as { disable(k: string): void }).disable(
    'x-powered-by',
  );
  app.use(requestId);
  app.use(securityHeaders);
  configureCors(app);
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.LOG_REQUESTS === 'true'
  ) {
    app.use(requestLogger(createLogger() ?? new JsonLogger()));
  }
  app.setGlobalPrefix(API_PREFIX.slice(1));

  // The API contract, for the frontend and for API tools. Set OPENAPI_PUBLIC=false to hide it.
  if (process.env.OPENAPI_PUBLIC !== 'false') {
    let cached: object | undefined;
    (
      app.getHttpAdapter().getInstance() as {
        get(
          path: string,
          h: (
            q: unknown,
            s: { setHeader(k: string, v: string): void; json(b: object): void },
          ) => void,
        ): void;
      }
    ).get(`${API_PREFIX}/openapi.json`, (_req, res) => {
      cached ??= sortKeys(buildOpenApi(app));
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(cached);
    });
  }
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrorReporter)));
}
