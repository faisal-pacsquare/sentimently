import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Headers for a JSON API. Nothing here is rendered as a page, so the policy is "load nothing".
 * Responses are marked no-store unless a route sets its own cache header (the public catalogue does).
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'",
  );
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
  next();
}

/**
 * CORS: the storefront and admin console are on other origins, so list them in CORS_ORIGINS
 * (comma separated, e.g. https://shop.example.pk,https://admin.example.pk). With none listed, no browser
 * on another origin may call the API. Cookies are not used, so credentials are never allowed.
 */
export function configureCors(
  app: INestApplication,
  env: NodeJS.ProcessEnv = process.env,
) {
  const origins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origins.length) return;
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: [
      'X-Request-Id',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 600,
  });
}

/**
 * Refuses to start in production with weak or missing secrets.
 * Better a failed deployment than a site that signs sessions with a guessable key.
 */
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const problems: string[] = [];
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    problems.push('JWT_SECRET must be set and at least 32 characters');
  if (env.CRON_SECRET && env.CRON_SECRET.length < 16)
    problems.push('CRON_SECRET must be at least 16 characters');
  if (
    env.ADMIN_EMAIL &&
    (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12)
  ) {
    problems.push(
      'ADMIN_PASSWORD must be at least 12 characters when ADMIN_EMAIL is set',
    );
  }
  // On Vercel every request can land on a different, short-lived instance. Without a database each one would
  // have its own memory, and orders would vanish. A demo can opt in to that explicitly.
  const durable =
    (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL) &&
    (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN);
  if (env.VERCEL && !durable && env.ALLOW_MEMORY_STORAGE !== 'true') {
    problems.push(
      'no durable storage: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or ALLOW_MEMORY_STORAGE=true for a demo where orders can disappear)',
    );
  }
  if (problems.length)
    throw new Error(`Unsafe production configuration: ${problems.join('; ')}`);
}
