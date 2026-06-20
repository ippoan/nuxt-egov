/**
 * egov-staging worker のエントリ。
 *
 * - `/mcp`            → DO+WS MCP server (`src/mcp.ts` の EgovMcp)
 * - `/health` `/token` `/introspect` `/logout` `/api/**`
 *                     → agents 非依存の proxy (`src/proxy.ts`)
 *
 * agents (`agents/mcp`) は `cloudflare:workers` を import するため node では
 * 読めない。テストは `src/proxy.ts` を直接 import して agents を回避し、本 file /
 * `src/mcp.ts` (DO) は workerd 上でだけ評価される。
 */
import { mountDurableMcp } from '@ippoan/mcp-cf-workers/durable';
import { handleProxyRoutes, jsonResponse } from './proxy';
import { EgovMcp } from './mcp';
import type { Env } from './env';

// wrangler は worker entry の named export から DO class を解決する。
export { EgovMcp };
export type { Env };

const mcpHandler = mountDurableMcp<Env>({
  agent: EgovMcp,
  path: '/mcp',
  binding: 'MCP_OBJECT',
  // 認証なし: e-Gov access_token は tool 引数経由で caller が渡し、e-Gov 側が
  // 検証する (worker の proxy と同じ no-gate philosophy)。
});

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
      return mcpHandler(req, env, ctx);
    }

    const res = await handleProxyRoutes(req, env);
    if (res) return res;

    return jsonResponse({ error: 'not_found', path: url.pathname }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
