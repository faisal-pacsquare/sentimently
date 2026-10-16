import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { IS_PUBLIC, ROLES } from './auth/auth.decorators';

export const API_PREFIX = '/api/v1';
export const API_VERSION = '1.0.0';

export interface RouteInfo {
  method: string; // GET, POST, ...
  path: string; // /api/v1/products/:slug
  openApiPath: string; // /api/v1/products/{slug}
  isPublic: boolean;
  roles: string[] | null; // null = any signed-in customer
  handler: string; // ControllerName.method
}

const trim = (s: string) => s.replace(/^\/+|\/+$/g, '');
const first = (p: unknown): string =>
  Array.isArray(p) ? String(p[0] ?? '') : String(p ?? '');

/** Every route the app serves, read from the controllers themselves (so it can't drift from the code). */
export function listRoutes(app: INestApplication): RouteInfo[] {
  const reflector = new Reflector();
  const routes: RouteInfo[] = [];

  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const { metatype, instance } = wrapper;
      if (!metatype || !instance) continue;
      const base = first(Reflect.getMetadata(PATH_METADATA, metatype));
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;

      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (method === undefined) continue;

        const path =
          '/' +
          [API_PREFIX, base, first(Reflect.getMetadata(PATH_METADATA, handler))]
            .map(trim)
            .filter(Boolean)
            .join('/');
        const targets = [handler, metatype];
        routes.push({
          method: RequestMethod[method],
          path,
          openApiPath: path.replace(/:(\w+)/g, '{$1}'),
          isPublic: !!reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets),
          roles:
            reflector.getAllAndOverride<string[] | undefined>(ROLES, targets) ??
            null,
          handler: `${metatype.name}.${name}`,
        });
      }
    }
  }
  return routes.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

/** The OpenAPI document, with each operation marked public, signed-in, or staff / admin only. */
export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Sentimently API')
    .setVersion(API_VERSION)
    .setDescription(
      [
        'REST API for the Sentimently gift store. Money is in whole rupees (PKR). Times are ISO 8601 in UTC; delivery dates are plain dates in Pakistan time.',
        'Sign in with POST /auth/login and send the token as "Authorization: Bearer <token>". Routes marked with no security need no token.',
        'Every error has the shape { "error": { "code", "message", "details"?, "requestId" } }. Too many requests give 429 with a Retry-After header.',
        'This is version 1 and is frozen: changes after the Backend Gate are additive, or a new /api/v2.',
      ].join('\n\n'),
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();

  const doc = SwaggerModule.createDocument(app, config);
  for (const r of listRoutes(app)) {
    const op = (
      doc.paths[r.openApiPath] as
        Record<string, Record<string, unknown>> | undefined
    )?.[r.method.toLowerCase()];
    if (!op) continue;
    op.security = r.isPublic ? [] : [{ bearer: [] }];
    op['x-access'] = r.isPublic
      ? 'public'
      : r.roles
        ? `roles: ${r.roles.join(', ')}`
        : 'signed-in';
    op.summary ??= r.handler;
  }
  return doc;
}

/** Same document with keys in a fixed order, so the committed file only changes when the API does. */
export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    ) as T;
  }
  return value;
}
