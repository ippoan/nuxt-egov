import { EgovClient } from '@ippoan/egov-shinsei-sdk';

const CACHE_KEY = 'access_token:v1';
// access_token は 1h 有効。期限の 5 分手前で refresh する。
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

export interface TokenSources {
  cache: KVNamespace;
  authBase: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function getAccessToken(src: TokenSources): Promise<string> {
  const cached = await src.cache.get<CachedToken>(CACHE_KEY, 'json');
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  const client = new EgovClient({
    apiBase: '', // refresh は authBase しか使わない
    authBase: src.authBase,
    clientId: src.clientId,
    clientSecret: src.clientSecret,
  });
  const tok = await client.refreshToken(src.refreshToken);

  const fresh: CachedToken = {
    accessToken: tok.access_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
  };
  // KV expirationTtl は秒単位。マージン分早めに失効させる。
  const ttlSec = Math.max(60, tok.expires_in - 60);
  await src.cache.put(CACHE_KEY, JSON.stringify(fresh), { expirationTtl: ttlSec });
  return fresh.accessToken;
}
