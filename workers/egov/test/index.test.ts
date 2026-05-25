import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { _resetTokenCache } from '../src/token-cache';

function makeSecret(value: string): SecretsStoreSecret {
  return { get: async () => value } as unknown as SecretsStoreSecret;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    EGOV_AUTH_BASE: 'https://auth.test',
    EGOV_API_BASE: 'https://api.test/v2',
    EGOV_CLIENT_ID: 'client-id',
    EGOV_CLIENT_SECRET: makeSecret('client-secret'),
    EGOV_REFRESH_TOKEN: makeSecret('refresh-token'),
    WORKER_API_KEY: makeSecret('test-api-key'),
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  _resetTokenCache();
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await worker.fetch(new Request('https://w/health'), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('unknown route', () => {
  it('returns 404', async () => {
    const res = await worker.fetch(new Request('https://w/nope'), makeEnv());
    expect(res.status).toBe(404);
  });
});

describe('/api/* auth', () => {
  it('rejects missing Authorization', async () => {
    const res = await worker.fetch(new Request('https://w/api/procedures/1'), makeEnv());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'missing_authorization' });
  });

  it('rejects wrong api key', async () => {
    const res = await worker.fetch(
      new Request('https://w/api/procedures/1', { headers: { authorization: 'Bearer wrong' } }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_api_key' });
  });
});

describe('/api/* proxy', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://auth.test/token') {
        return new Response(
          JSON.stringify({ access_token: 'access-xyz', expires_in: 3600, token_type: 'Bearer', refresh_token: 'r' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.startsWith('https://api.test/v2/')) {
        return new Response(JSON.stringify({ proxied: true, url }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('refreshes token then proxies request', async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      new Request('https://w/api/procedures/123?foo=bar', { headers: { authorization: 'Bearer test-api-key' } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toBe('https://api.test/v2/procedures/123?foo=bar');

    // 2 回目は module-level cache hit で token endpoint を叩かない。
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchSpy.mockClear();
    await worker.fetch(
      new Request('https://w/api/procedures/123', { headers: { authorization: 'Bearer test-api-key' } }),
      env,
    );
    const calls = fetchSpy.mock.calls.map((c) => (typeof c[0] === 'string' ? c[0] : (c[0] as URL).toString()));
    expect(calls.some((u) => u === 'https://auth.test/token')).toBe(false);
  });
});
