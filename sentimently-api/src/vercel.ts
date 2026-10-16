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

/** Vercel serverless entry (called from api/index.js). The Nest app is built once per warm instance. */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const app = await getServer();
  app(req as express.Request, res as express.Response);
}
