// Worker の binding 型。proxy 系 (token / introspect / logout / api) は
// `ProxyEnv` だけで動くため、agents (DO) 非依存のテストはこちらを使う。
// MCP DO path (`src/mcp.ts` / `src/index.ts`) のみ `MCP_OBJECT` を要求する。
export interface ProxyEnv {
  EGOV_AUTH_BASE: string;
  EGOV_API_BASE: string;
  EGOV_CLIENT_ID: string;
  EGOV_CLIENT_SECRET: SecretsStoreSecret;
}

export interface Env extends ProxyEnv {
  // MCP セッションを動かす Durable Object (agents SDK McpAgent)。
  // wrangler.toml の durable_objects.bindings (MCP_OBJECT) + migration で登録。
  MCP_OBJECT: DurableObjectNamespace;
}
