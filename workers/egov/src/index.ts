export interface Env {
  EGOV_AUTH_BASE: string;
  EGOV_API_BASE: string;
  EGOV_CLIENT_ID: string;
  EGOV_CLIENT_SECRET: SecretsStoreSecret;
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
  const auth = req.headers.get('x-worker-api-key') ?? '';
  if (!auth) return jsonResponse({ error: 'missing_x_worker_api_key' }, { status: 401 });
  const expected = await env.WORKER_API_KEY.get();
  if (auth !== expected) return jsonResponse({ error: 'invalid_api_key' }, { status: 401 });
  return null;
}

async function handleHealth(): Promise<Response> {
  return jsonResponse({ ok: true });
}

// OAuth /token endpoint への proxy。caller は grant_type=authorization_code か
// refresh_token を投げてきて、本 worker が client_secret を inject して e-Gov に
// 転送する。worker 側に refresh_token は保持しない (per-user 帰属を維持)。
async function handleToken(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });

  const body = await req.json().catch(() => null) as Record<string, string> | null;
  if (!body || typeof body.grant_type !== 'string') {
    return jsonResponse({ error: 'invalid_request' }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.set('grant_type', body.grant_type);
  if (body.grant_type === 'authorization_code') {
    if (!body.code || !body.redirect_uri) {
      return jsonResponse({ error: 'invalid_request', detail: 'code and redirect_uri required' }, { status: 400 });
    }
    params.set('code', body.code);
    params.set('redirect_uri', body.redirect_uri);
    if (body.code_verifier) params.set('code_verifier', body.code_verifier);
  }
  else if (body.grant_type === 'refresh_token') {
    if (!body.refresh_token) {
      return jsonResponse({ error: 'invalid_request', detail: 'refresh_token required' }, { status: 400 });
    }
    params.set('refresh_token', body.refresh_token);
  }
  else {
    return jsonResponse({ error: 'unsupported_grant_type' }, { status: 400 });
  }

  const clientSecret = await env.EGOV_CLIENT_SECRET.get();
  const credentials = btoa(`${env.EGOV_CLIENT_ID}:${clientSecret}`);

  const upstream = await fetch(`${env.EGOV_AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

// e-Gov v2 API への透過 proxy。Authorization (Bearer access_token) は caller 提供。
async function handleProxy(req: Request, env: Env, subpath: string): Promise<Response> {
  const inUrl = new URL(req.url);
  const targetUrl = `${env.EGOV_API_BASE}/${subpath}${inUrl.search}`;

  const headers = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) headers.set('Authorization', auth);
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const trial = req.headers.get('x-egovapi-trial');
  if (trial) headers.set('X-eGovAPI-Trial', trial);

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return handleHealth();

    const gate = await requireApiKey(req, env);
    if (gate) return gate;

    if (url.pathname === '/token') return handleToken(req, env);
    if (url.pathname.startsWith('/api/')) {
      return handleProxy(req, env, url.pathname.slice('/api/'.length));
    }
    return jsonResponse({ error: 'not_found', path: url.pathname }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
