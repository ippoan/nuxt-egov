import { getAccessToken } from './token-cache';

export interface Env {
  EGOV_AUTH_BASE: string;
  EGOV_API_BASE: string;
  EGOV_CLIENT_ID: string;
  TOKEN_CACHE: KVNamespace;
  EGOV_CLIENT_SECRET: SecretsStoreSecret;
  EGOV_REFRESH_TOKEN: SecretsStoreSecret;
  WORKER_API_KEY: SecretsStoreSecret;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

async function requireApiKey(req: Request, env: Env): Promise<Response | null> {
  const auth = req.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!presented) return jsonResponse({ error: 'missing_authorization' }, { status: 401 });
  const expected = await env.WORKER_API_KEY.get();
  // 長さ違いの timing leak は許容範囲 (Bearer token は十分長く生成する前提)。
  if (presented !== expected) return jsonResponse({ error: 'invalid_api_key' }, { status: 401 });
  return null;
}

async function handleHealth(): Promise<Response> {
  return jsonResponse({ ok: true });
}

async function handleProxy(req: Request, env: Env, subpath: string): Promise<Response> {
  const gate = await requireApiKey(req, env);
  if (gate) return gate;

  const [clientSecret, refreshToken] = await Promise.all([
    env.EGOV_CLIENT_SECRET.get(),
    env.EGOV_REFRESH_TOKEN.get(),
  ]);
  const accessToken = await getAccessToken({
    cache: env.TOKEN_CACHE,
    authBase: env.EGOV_AUTH_BASE,
    clientId: env.EGOV_CLIENT_ID,
    clientSecret,
    refreshToken,
  });

  const inUrl = new URL(req.url);
  const targetUrl = `${env.EGOV_API_BASE}/${subpath}${inUrl.search}`;

  const headers = new Headers();
  // Authorization は worker 内蔵 token で上書き。client-side からは渡せない。
  headers.set('Authorization', `Bearer ${accessToken}`);
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const trial = req.headers.get('x-egovapi-trial');
  if (trial) headers.set('X-eGovAPI-Trial', trial);

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
  });

  // Body はそのまま透過。content-type は upstream のものを優先する。
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return handleHealth();
    if (url.pathname.startsWith('/api/')) {
      return handleProxy(req, env, url.pathname.slice('/api/'.length));
    }
    return jsonResponse({ error: 'not_found', path: url.pathname }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
