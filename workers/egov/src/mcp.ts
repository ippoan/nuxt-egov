/**
 * e-Gov 試験 API を MCP tool として公開する Durable Object (DO + WebSocket)。
 *
 * なぜ DO+WS か (stateless ではなく): deploy で tool 群を変えても stateless
 * `/mcp` は live session の `tools/list` を旧 schema のまま凍結する
 * (ippoan/secrets-inventory#70)。DO+WS は deploy で WS が drop → クライアント
 * 自動再接続 → initialize/tools/list 再取得、で新 schema を引ける。
 * Refs ippoan/mcp-cf-workers#6 / #12。
 *
 * 認可モデル: 本 worker の proxy と同じく「worker 自前の gate は持たない」。
 * e-Gov access_token は **caller が tool 引数で渡す** (worker は refresh_token を
 * 保持しない設計のため)。不正 token は e-Gov 側で 401 になる。tool は read 系
 * のみ (申請の送信・取下げ等の write は MCP からは公開しない = 誤操作防止)。
 */
import { createDurableMcp } from '@ippoan/mcp-cf-workers/durable';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Env } from './env';

const MCP_NAME = 'egov-staging';
const MCP_VERSION = '0.1.0';

// tool 応答に巨大な base64 (file_data 等) がそのまま載ると context を食い潰すため、
// passthrough 系のテキスト応答はこの長さで切る。
const MAX_RESPONSE_CHARS = 20_000;

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

// e-Gov v2 API への GET。caller 提供の access_token を Bearer で付けて叩く。
async function egovGet(
  env: Env,
  subpath: string,
  accessToken: string,
  query?: Record<string, string | undefined>,
): Promise<string> {
  const url = new URL(`${env.EGOV_API_BASE}/${subpath}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const body = await res.text();
  const clipped = body.length > MAX_RESPONSE_CHARS
    ? `${body.slice(0, MAX_RESPONSE_CHARS)}\n…(truncated, ${body.length} chars total)`
    : body;
  return `HTTP ${res.status}\n${clipped}`;
}

export const EgovMcp = createDurableMcp<Env>({
  name: MCP_NAME,
  version: MCP_VERSION,
  registerTools(server: McpServer, env: Env) {
    // 認証不要の疎通確認。
    server.registerTool(
      'egov_health',
      {
        description: 'Check that the egov-staging worker is reachable. Returns { ok: true }. No auth required.',
        inputSchema: {},
      },
      async () => textResult(JSON.stringify({ ok: true, api_base: env.EGOV_API_BASE })),
    );

    // 申請状況一覧 (GET /apply/lists)。smoke test の主経路。
    server.registerTool(
      'egov_apply_list',
      {
        description:
          'List e-Gov application statuses (GET /apply/lists). Requires a caller-supplied e-Gov access token. '
          + 'Hits the e-Gov TRIAL API (api2.sbx.e-gov.go.jp). Read-only.',
        inputSchema: {
          access_token: z.string().describe('e-Gov OAuth access token (Bearer) obtained by the caller.'),
          date_from: z.string().optional().describe('YYYY-MM-DD lower bound (send date).'),
          date_to: z.string().optional().describe('YYYY-MM-DD upper bound (send date).'),
          send_number: z.string().optional().describe('Filter by a specific send number.'),
          limit: z.string().optional().describe('Page size (default e-Gov side).'),
          offset: z.string().optional().describe('Page offset.'),
        },
      },
      async ({ access_token, date_from, date_to, send_number, limit, offset }) => {
        const text = await egovGet(env, 'apply/lists', access_token, {
          date_from, date_to, send_number, limit, offset,
        });
        return textResult(text);
      },
    );

    // 任意の e-Gov v2 GET endpoint への汎用 passthrough (read 専用)。
    server.registerTool(
      'egov_api_get',
      {
        description:
          'Generic read-only GET passthrough to the e-Gov v2 TRIAL API. '
          + '`path` is appended to api2.sbx.e-gov.go.jp/shinsei/v2/ (e.g. "procedure/950A010700005000", "apply/detail/<arrive_id>"). '
          + 'Large responses (e.g. skeleton file_data) are truncated. Requires a caller-supplied access token.',
        inputSchema: {
          access_token: z.string().describe('e-Gov OAuth access token (Bearer).'),
          path: z.string().describe('Subpath under the e-Gov v2 API base (no leading slash).'),
          query: z.record(z.string(), z.string()).optional().describe('Optional query string params.'),
        },
      },
      async ({ access_token, path, query }) => {
        const subpath = path.replace(/^\/+/, '');
        const text = await egovGet(env, subpath, access_token, query);
        return textResult(text);
      },
    );
  },
});
