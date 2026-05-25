import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';

function makeSecret(value: string): SecretsStoreSecret {
  return { get: async () => value } as unknown as SecretsStoreSecret;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    EGOV_AUTH_BASE: 'https://auth.test',
    EGOV_API_BASE: 'https://api.test/v2',
    EGOV_CLIENT_ID: 'client-id',
    EGOV_CLIENT_SECRET: makeSecret('client-secret'),
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
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

describe('POST /token', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://auth.test/token') {
        return new Response(
          JSON.stringify({
            access_token: 'access-xyz',
            refresh_token: 'refresh-abc',
            expires_in: 3600,
            token_type: 'Bearer',
            received: init?.body,
            received_auth: (init?.headers as Record<string, string>)?.['Authorization'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
  });

  it('rejects non-POST', async () => {
    const res = await worker.fetch(new Request('https://w/token'), makeEnv());
    expect(res.status).toBe(405);
  });

  it('rejects unsupported grant_type', async () => {
    const res = await worker.fetch(
      new Request('https://w/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ grant_type: 'password' }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unsupported_grant_type' });
  });

  it('exchanges authorization_code with injected client_secret', async () => {
    const res = await worker.fetch(
      new Request('https://w/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: 'auth-code-1',
          redirect_uri: 'https://app/cb',
          code_verifier: 'v',
        }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { received: string; received_auth: string; access_token: string };
    expect(body.access_token).toBe('access-xyz');
    expect(body.received).toContain('grant_type=authorization_code');
    expect(body.received).toContain('code=auth-code-1');
    expect(body.received).toContain('code_verifier=v');
    expect(body.received_auth).toBe(`Basic ${btoa('client-id:client-secret')}`);
  });

  it('refreshes via refresh_token grant', async () => {
    const res = await worker.fetch(
      new Request('https://w/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: 'rt-1' }),
      }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { received: string };
    expect(body.received).toContain('grant_type=refresh_token');
    expect(body.received).toContain('refresh_token=rt-1');
  });
});

describe('/api/* proxy', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('https://api.test/v2/')) {
        return new Response(
          JSON.stringify({
            proxied: true,
            url,
            forwarded_auth: (init?.headers as Headers)?.get?.('Authorization'),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
  });

  it('forwards caller Authorization to e-Gov', async () => {
    const res = await worker.fetch(
      new Request('https://w/api/procedures/123?foo=bar', {
        headers: { 'authorization': 'Bearer caller-token' },
      }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { proxied: boolean; url: string; forwarded_auth: string };
    expect(body.proxied).toBe(true);
    expect(body.url).toBe('https://api.test/v2/procedures/123?foo=bar');
    expect(body.forwarded_auth).toBe('Bearer caller-token');
  });
});
