import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
// This project compiles without esModuleInterop, so a default import would be undefined at run time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import express = require('express');
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module';
import { assertProductionConfig } from './common/security';
import { createLogger } from './common/json-logger';
import { setupApp } from './setup';

let server: express.Express | undefined;

async function getServer() {
  if (!server) {
    assertProductionConfig();
    const expressApp = express();
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
      { logger: createLogger(), rawBody: true },
    );
    setupApp(app);
    await app.init();
    server = expressApp;
  }
  return server;
}

/**
 * Vercel serverless entry (called from api/index.js). The Nest app is built once per warm instance.
 *
 * If the app cannot start, Vercel's own error page ("FUNCTION_INVOCATION_FAILED") says nothing useful. A bad
 * setting is reported here in plain words instead (setting names only, never values), and any other failure is
 * written to the function log with a short pointer to it.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  let app: express.Express;
  try {
    app = await getServer();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const misconfigured = message.startsWith('Unsafe production configuration');
    if (!misconfigured) console.error('API failed to start:', e);
    res.statusCode = misconfigured ? 503 : 500;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(
      JSON.stringify({
        error: {
          code: misconfigured ? 'misconfigured' : 'startup_failed',
          message: misconfigured
            ? message
            : 'The API could not start. See the function logs for the error.',
        },
      }),
    );
    return;
  }
  app(req as express.Request, res as express.Response);
}
