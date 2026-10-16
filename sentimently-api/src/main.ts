import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertProductionConfig } from './common/security';
import { createLogger } from './common/json-logger';
import { setupApp } from './setup';

async function bootstrap() {
  assertProductionConfig();
  const app = await NestFactory.create(AppModule, {
    logger: createLogger(),
    rawBody: true, // payment callbacks are signed over the exact bytes received
  });
  setupApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
