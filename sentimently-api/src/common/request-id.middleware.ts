import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & { id?: string };

/** Gives every request an id (taken from x-request-id if present) and echoes it in the response. */
export function requestId(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.headers['x-request-id'];
  req.id =
    typeof incoming === 'string' && incoming.length <= 100
      ? incoming
      : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
