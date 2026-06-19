/**
 * 最終確認試験 エビデンス capture。
 *
 * 照会テスト (runInquiryTest) 実行中の e-Gov API 呼び出しを逐語記録し、規約の
 * `_01`(URL+ヘッダ)/`_02`(ボディ)/`_03`(レスポンス)用エビデンスを作る。
 *
 * 捕捉経路:
 *  - `EgovClient` … 構築時に `fetch: captureFetch` を渡す → 全 `client.*` 呼び出しを自動記録。
 *  - `apiFetch` (useEgovAuth) … $fetch 成功後に `pushEvidence` で記録 (エラー時の $fetch 挙動は温存)。
 *  - 直 `$fetch('/api/egov/introspect' | '/logout')` … 呼び出し側で `pushEvidence`。
 *  - `/apply` (submitOne) … 別途自前 evidence を持つので二重記録は無害 (primary を後段で選別)。
 *
 * 秘密 (Authorization / token) はマスクし、base64 等の巨大文字列は略記して
 * localStorage 5MB quota を守る (申請データ実体は `_04.ZIP` 側で扱う)。
 */
export interface EvidenceCall {
  egovUrl: string
  method: string
  requestHeaders: Record<string, string>
  requestBody: unknown
  response: unknown
  httpStatus: number
  capturedAt: string
}

/** 検証環境 API ベース (final-test.vue の EGOV_API_BASE と一致)。 */
export const EGOV_API_BASE = 'https://api2.sbx.e-gov.go.jp/shinsei/v2'
const PROXY_PREFIX = '/api/egov'

let _active = false
let _buf: EvidenceCall[] = []

export function beginCapture(): void {
  _active = true
  _buf = []
}

/** capture を止め、収集した呼び出し列を返す。 */
export function endCapture(): EvidenceCall[] {
  _active = false
  const b = _buf
  _buf = []
  return b
}

export function captureActive(): boolean {
  return _active
}

export function pushEvidence(call: EvidenceCall): void {
  if (_active) _buf.push(call)
}

/** `/api/egov/{rest}?{q}` → `https://api2.../shinsei/v2/{rest}?{q}` (auth 系は呼び出し側で明示)。 */
export function realEgovUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl, 'http://_')
    const idx = u.pathname.indexOf(PROXY_PREFIX)
    const rest = idx >= 0 ? u.pathname.slice(idx + PROXY_PREFIX.length) : u.pathname
    return `${EGOV_API_BASE}${rest}${u.search}`
  } catch {
    return proxyUrl
  }
}

/** base64 等の巨大文字列を略記 (localStorage quota / context 保護)。再帰的に適用。 */
export function abbreviate(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') {
    return v.length > 800 ? `(long/base64 省略, ${v.length} chars — 実体は _04.ZIP)` : v
  }
  if (Array.isArray(v)) return depth > 6 ? '[...]' : v.map((x) => abbreviate(x, depth + 1))
  if (v && typeof v === 'object') {
    if (depth > 6) return '{...}'
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = abbreviate(val, depth + 1)
    }
    return out
  }
  return v
}

/** ヘッダを正規化し Authorization をマスク。 */
export function maskHeaders(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  const entries: [string, string][] =
    h instanceof Headers
      ? [...h.entries()]
      : Array.isArray(h)
        ? (h as [string, string][])
        : Object.entries(h as Record<string, string>)
  for (const [k, v] of entries) {
    out[k] = /^authorization$/i.test(k) ? 'Bearer ****(masked)' : String(v)
  }
  return out
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  }
  return '(non-string body)'
}

/**
 * EgovClient に渡す fetch。`/api/egov` 宛て呼び出しを (capture 中のみ) 記録する。
 * 本処理を阻害しないよう capture は完全 best-effort (例外は握り潰す)。
 */
export const captureFetch: typeof globalThis.fetch = async (input, init) => {
  const res = await globalThis.fetch(input as RequestInfo, init)
  if (_active) {
    try {
      const urlStr =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : ((input as Request).url ?? String(input))
      if (urlStr.includes(PROXY_PREFIX)) {
        let respBody: unknown
        try {
          respBody = await res.clone().json()
        } catch {
          try {
            respBody = await res.clone().text()
          } catch {
            respBody = null
          }
        }
        _buf.push({
          egovUrl: realEgovUrl(urlStr),
          method: (init?.method ?? 'GET').toUpperCase(),
          requestHeaders: maskHeaders(init?.headers),
          requestBody: abbreviate(parseBody(init?.body)),
          response: abbreviate(respBody),
          httpStatus: res.status,
          capturedAt: new Date().toISOString(),
        })
      }
    } catch {
      /* best-effort */
    }
  }
  return res
}
