/**
 * e-Gov 試験 API への薄い proxy。OAuth `/token` `/token/introspect` `/logout`
 * は client_secret を inject、`/api/**` は caller の Bearer をそのまま透過する。
 *
 * agents (Durable Object) には依存しない = node (vitest) でそのままテスト可能。
 * MCP DO path (`src/index.ts` / `src/mcp.ts`) はこの module の上に被せる。
 */
import type { ProxyEnv } from './env';

const JSON_HEADERS = { 'content-type': 'application/json' };

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

function handleHealth(): Response {
  return jsonResponse({ ok: true });
}

// OAuth /token endpoint への proxy。caller は grant_type=authorization_code か
// refresh_token を投げてきて、本 worker が client_secret を inject して e-Gov に
// 転送する。worker 側に refresh_token は保持しない (per-user 帰属を維持)。
async function handleToken(req: Request, env: ProxyEnv): Promise<Response> {
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

  return authFormPost(env, '/token', params);
}

// OAuth token introspection。caller の token を client_secret 付きで e-Gov に
// 投げて active 判定を返す (Nuxt server の introspect.post.ts と同等)。
async function handleIntrospect(req: Request, env: ProxyEnv): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });

  const body = await req.json().catch(() => null) as Record<string, string> | null;
  if (!body || typeof body.token !== 'string') {
    return jsonResponse({ error: 'invalid_request', detail: 'token required' }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.set('token', body.token);
  if (body.token_type_hint) params.set('token_type_hint', body.token_type_hint);

  return authFormPost(env, '/token/introspect', params);
}

// OAuth logout (refresh_token 失効)。e-Gov は 204 No Content を返すため、
// body 無しでもそのまま透過する (Nuxt server の logout.post.ts と同等)。
async function handleLogout(req: Request, env: ProxyEnv): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });

  const body = await req.json().catch(() => null) as Record<string, string> | null;
  if (!body || typeof body.refresh_token !== 'string') {
    return jsonResponse({ error: 'invalid_request', detail: 'refresh_token required' }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.set('refresh_token', body.refresh_token);

  return authFormPost(env, '/logout', params);
}

// authBase 配下 (/token, /token/introspect, /logout) への Basic 認証付き
// form-urlencoded POST。client_secret は Secrets Store から取得して inject する。
async function authFormPost(env: ProxyEnv, path: string, params: URLSearchParams): Promise<Response> {
  const clientSecret = await env.EGOV_CLIENT_SECRET.get();
  const credentials = btoa(`${env.EGOV_CLIENT_ID}:${clientSecret}`);

  const upstream = await fetch(`${env.EGOV_AUTH_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  // 204 (logout 等) は body 無しでそのまま返す。
  if (upstream.status === 204) return new Response(null, { status: 204 });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

// e-Gov v2 API への透過 proxy。Authorization (Bearer access_token) は caller 提供。
// 不正 token は e-Gov 側で 401 になるため worker 自前の gate は無し。
async function handleProxy(req: Request, env: ProxyEnv, subpath: string): Promise<Response> {
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

/**
 * proxy 系 route を解決する。マッチしなければ `null` を返す
 * (caller 側で /mcp 等を試した後、最終的に 404 にする)。
 */
export async function handleProxyRoutes(req: Request, env: ProxyEnv): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === '/health') return handleHealth();
  if (url.pathname === '/token') return handleToken(req, env);
  if (url.pathname === '/introspect') return handleIntrospect(req, env);
  if (url.pathname === '/logout') return handleLogout(req, env);
  if (url.pathname.startsWith('/api/')) {
    return handleProxy(req, env, url.pathname.slice('/api/'.length));
  }
  return null;
}

/**
 * agents 非依存の worker entry。`/mcp` を持たない構成 (テスト) と、
 * `src/index.ts` の 404 fallback の single source として使う。
 */
export default {
  async fetch(req: Request, env: ProxyEnv): Promise<Response> {
    const res = await handleProxyRoutes(req, env);
    if (res) return res;
    const url = new URL(req.url);
    return jsonResponse({ error: 'not_found', path: url.pathname }, { status: 404 });
  },
} satisfies ExportedHandler<ProxyEnv>;

export type { ProxyEnv } from './env';
