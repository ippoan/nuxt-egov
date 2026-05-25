// access_token は 1h 有効。期限の 5 分手前で refresh する。
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

interface RefreshTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

// Cloudflare Worker isolate に紐付く module-level cache。
// isolate が落ちたら次回 request で refresh が走るだけなので問題ない。
// KV を挟むより接続も整合性の罠も少なく、e-Gov の 1h token 寿命ならこれで十分。
let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

export interface TokenSources {
  authBase: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

async function refreshAccessToken(src: TokenSources): Promise<RefreshTokenResponse> {
  const credentials = btoa(`${src.clientId}:${src.clientSecret}`);
  const res = await fetch(`${src.authBase}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: src.refreshToken }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`token refresh failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<RefreshTokenResponse>;
}

export async function getAccessToken(src: TokenSources): Promise<string> {
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }
  // 同時に複数 request が cache miss した時、refresh は 1 回に絞る。
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const tok = await refreshAccessToken(src);
      cached = {
        accessToken: tok.access_token,
        expiresAt: Date.now() + tok.expires_in * 1000,
      };
      return cached.accessToken;
    }
    finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// テスト用: module-level state をリセットする。
export function _resetTokenCache(): void {
  cached = null;
  inFlight = null;
}
