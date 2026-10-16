/** What every failed call becomes. A failed lookup is never turned into "not found" or an empty list. */
export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the server could not be reached at all. */
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: string[] = [],
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The server could not be reached (offline, DNS, CORS, timeout). */
  get isNetwork() {
    return this.status === 0;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  /** Worth offering "try again": nothing is wrong with the request itself. */
  get isTemporary() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Sent as Idempotency-Key so a repeated submit returns the first result. */
  idempotencyKey?: string;
  /** Send the sign-in token (default true). */
  auth?: boolean;
}

export interface ClientOptions {
  baseUrl: string;
  getToken?: () => string | null;
  /** Called when a request that carried a token comes back 401 (expired or revoked). */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
  /** Extra tries for GET requests that fail for a temporary reason. Default 2. */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_WAIT_MS = 5000;

export function queryString(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export class ApiClient {
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly options: ClientOptions) {
    this.doFetch = options.fetch ?? ((...a) => fetch(...a));
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = options.maxRetries ?? 2;
  }

  get<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>('GET', path, opts);
  }
  post<T>(path: string, body?: unknown, opts: RequestOptions = {}) {
    return this.request<T>('POST', path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts: RequestOptions = {}) {
    return this.request<T>('PATCH', path, { ...opts, body });
  }
  put<T>(path: string, body?: unknown, opts: RequestOptions = {}) {
    return this.request<T>('PUT', path, { ...opts, body });
  }
  delete<T>(path: string, body?: unknown, opts: RequestOptions = {}) {
    return this.request<T>('DELETE', path, { ...opts, body });
  }

  /** Only GET is retried: repeating a POST could place an order twice. */
  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const retries = method === 'GET' ? this.maxRetries : 0;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once<T>(method, path, opts);
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        const retryable = !!err && (err.isNetwork || RETRY_STATUSES.has(err.status));
        if (!err || !retryable || attempt >= retries || opts.signal?.aborted) throw e;
        const wait = err.retryAfterSeconds !== undefined ? err.retryAfterSeconds * 1000 : 300 * 2 ** attempt;
        if (wait > MAX_WAIT_MS) throw e; // asked to wait too long: let the screen show it
        await this.sleep(wait);
      }
    }
  }

  private async once<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const token = opts.auth === false ? null : (this.options.getToken?.() ?? null);
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    let res: Response;
    try {
      res = await this.doFetch(`${this.options.baseUrl}${path}${queryString(opts.query)}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });
    } catch (e) {
      if (opts.signal?.aborted) throw e; // the caller cancelled: not an error to report
      throw new ApiError(0, 'network', 'We could not reach the shop. Check your connection and try again.');
    }

    if (res.status === 204) return undefined as T;

    let payload: unknown;
    const isJson = res.headers.get('content-type')?.includes('json');
    try {
      payload = isJson ? await res.json() : undefined;
    } catch {
      payload = undefined;
    }

    if (res.ok) {
      if (payload === undefined) throw new ApiError(res.status, 'bad_response', 'The shop sent an answer we could not read.');
      return payload as T;
    }

    const retryAfter = Number(res.headers.get('retry-after'));
    const body = (payload as { error?: { code?: string; message?: string; details?: string[]; requestId?: string } } | undefined)?.error;
    if (res.status === 401 && token) this.options.onUnauthorized?.();
    throw new ApiError(
      res.status,
      body?.code ?? (res.status >= 500 ? 'internal_error' : 'http_error'),
      body?.message ?? 'Something went wrong. Please try again.',
      body?.details ?? [],
      body?.requestId ?? res.headers.get('x-request-id') ?? undefined,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
}
