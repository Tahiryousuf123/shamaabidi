import { USER_AGENT } from './config';
import { getCached, setCached } from './cache';

export interface ResilientFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  delayMs?: number;
  useCache?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
    this.name = 'HttpError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function resilientFetchJson<T>(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<{ data: T; status: number; cached: boolean }> {
  const {
    method = 'GET',
    headers = {},
    body,
    delayMs = 0,
    useCache = true,
    maxRetries = 2,
    timeoutMs = 15000,
  } = options;

  const cacheKey = `${method}::${url}::${body || ''}`;

  if (useCache && method === 'GET') {
    const cached = await getCached<T>(cacheKey);
    if (cached !== null) {
      return { data: cached, status: 200, cached: true };
    }
  }

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  let attempt = 0;
  let backoffMs = 1000;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle 429 / 5xx with backoff
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const errorText = await res.text().catch(() => '');
        if (attempt <= maxRetries) {
          console.warn(`[HTTP ${res.status}] ${url} - backing off for ${backoffMs}ms (attempt ${attempt}/${maxRetries})`);
          await sleep(backoffMs);
          backoffMs *= 2;
          continue;
        }
        throw new HttpError(res.status, `HTTP ${res.status} after ${maxRetries} retries: ${errorText.slice(0, 200)}`, errorText);
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new HttpError(res.status, `HTTP ${res.status}: ${errorText.slice(0, 200)}`, errorText);
      }

      const data = (await res.json()) as T;

      if (useCache) {
        await setCached(cacheKey, data);
      }

      return { data, status: res.status, cached: false };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err instanceof HttpError) throw err;
      if (attempt <= maxRetries) {
        console.warn(`[Network/Timeout] ${url} (${err.message}) - retrying in ${backoffMs}ms`);
        await sleep(backoffMs);
        backoffMs *= 2;
        continue;
      }
      throw new Error(`Fetch failed for ${url}: ${err.message}`);
    }
  }

  throw new Error(`Exhausted retries for ${url}`);
}

export async function resilientFetchText(
  url: string,
  options: ResilientFetchOptions = {}
): Promise<{ text: string; status: number; cached: boolean }> {
  const {
    method = 'GET',
    headers = {},
    body,
    delayMs = 0,
    useCache = true,
    maxRetries = 2,
    timeoutMs = 15000,
  } = options;

  const cacheKey = `TEXT::${method}::${url}::${body || ''}`;

  if (useCache && method === 'GET') {
    const cached = await getCached<string>(cacheKey);
    if (cached !== null) {
      return { text: cached, status: 200, cached: true };
    }
  }

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  let attempt = 0;
  let backoffMs = 1000;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt <= maxRetries) {
          await sleep(backoffMs);
          backoffMs *= 2;
          continue;
        }
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new HttpError(res.status, `HTTP ${res.status}: ${errorText.slice(0, 200)}`);
      }

      const text = await res.text();

      if (useCache) {
        await setCached(cacheKey, text);
      }

      return { text, status: res.status, cached: false };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err instanceof HttpError) throw err;
      if (attempt <= maxRetries) {
        await sleep(backoffMs);
        backoffMs *= 2;
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Exhausted retries for ${url}`);
}
