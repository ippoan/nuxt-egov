// Worker の binding 型。proxy 系 (token / introspect / logout / api) は
// `ProxyEnv` だけで動くため、agents (DO) 非依存のテストはこちらを使う。
// MCP DO path (`src/mcp.ts` / `src/index.ts`) のみ `MCP_OBJECT` を要求する。
export interface ProxyEnv {
  EGOV_AUTH_BASE: string;
  EGOV_API_BASE: string;
  // staging (sbx) は wrangler.toml の vars に平文。本番 (env.prod) は repo に ID を
  // 書かないため Secrets Store binding で受ける (GCP `NUXT_PUBLIC_EGOV_CLIENT_ID_PROD`)。
  EGOV_CLIENT_ID: string | SecretsStoreSecret;
  EGOV_CLIENT_SECRET: SecretsStoreSecret;
}

export interface Env extends ProxyEnv {
  // MCP セッションを動かす Durable Object (agents SDK McpAgent)。
  // wrangler.toml の durable_objects.bindings (MCP_OBJECT) + migration で登録。
  MCP_OBJECT: DurableObjectNamespace;
}
