import { EgovClient, generatePKCE, buildAuthorizationUrl } from '@ippoan/egov-shinsei-sdk'
import type { TokenResponse } from '@ippoan/egov-shinsei-sdk'
import { captureFetch, captureActive, pushEvidence, realEgovUrl, abbreviate } from '~/utils/egovCapture'

// 最終確認試験エビデンス: token レスポンスの秘密 (access/refresh token) をマスクして返す。
function maskTokenResp(data: TokenResponse): Record<string, unknown> {
  return { ...data, access_token: '****(masked)', refresh_token: '****(masked)' }
}

// リダイレクトURL の認可コード (code=...) をマスク。01-1 エビデンスの _03 用。
function maskCodeParam(url: string): string {
  try {
    const u = new URL(url)
    if (u.searchParams.has('code')) u.searchParams.set('code', '****(masked)')
    return u.toString()
  } catch {
    return url.replace(/([?&]code=)[^&]*/i, '$1****(masked)')
  }
}

export function useEgovAuth() {
  const config = useRuntimeConfig()
  const authBase = config.public.egovAuthBase as string
  const clientId = config.public.egovClientId as string
  const redirectUri = config.public.egovRedirectUri as string

  const accessToken = useState<string | null>('egov_access_token', () => null)
  const refreshToken = useState<string | null>('egov_refresh_token', () => null)
  const tokenExpiresAt = useState<number>('egov_token_expires_at', () => 0)
  const isAuthenticated = computed(() => !!accessToken.value && Date.now() < tokenExpiresAt.value)

  const client = new EgovClient({
    apiBase: '/api/egov',
    authBase,
    clientId,
    // 最終確認試験エビデンス: capture 中のみ client.* の e-Gov 呼び出しを逐語記録する。
    fetch: captureFetch,
  })

  // localStorage からトークンを復元（リロード時にログイン不要にする）
  if (import.meta.client && !accessToken.value) {
    const saved = localStorage.getItem('egov_tokens')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.expiresAt > Date.now()) {
          accessToken.value = data.accessToken
          refreshToken.value = data.refreshToken
          tokenExpiresAt.value = data.expiresAt
          client.setAccessToken(data.accessToken)
          ;(window as any)._egovToken = data.accessToken
        } else if (data.refreshToken) {
          refreshToken.value = data.refreshToken
        }
      } catch { /* ignore corrupt data */ }
    }
  }

  async function startLogin() {
    const { codeVerifier, codeChallenge } = await generatePKCE()
    const state = crypto.randomUUID()

    sessionStorage.setItem('egov_code_verifier', codeVerifier)
    sessionStorage.setItem('egov_state', state)
    sessionStorage.setItem('egov_return_to', window.location.pathname)

    const url = buildAuthorizationUrl({
      authBase,
      clientId,
      redirectUri,
      state,
      codeChallenge,
    })

    // 最終確認試験エビデンス (01-1 ユーザー認可): 認可リクエスト URL を記録しておく
    // (照会テストの capture 窓の外で起きるため localStorage 経由で持ち越す)。
    localStorage.setItem('egov_ev_authorize', JSON.stringify({ url, capturedAt: new Date().toISOString() }))

    window.location.href = url
  }

  async function handleCallback(code: string, state: string) {
    const savedState = sessionStorage.getItem('egov_state')
    if (state !== savedState) {
      throw new Error('State mismatch - possible CSRF attack')
    }

    const codeVerifier = sessionStorage.getItem('egov_code_verifier')
    if (!codeVerifier) {
      throw new Error('Code verifier not found')
    }

    const redirectUrl = import.meta.client ? window.location.href : ''
    const data = await $fetch<TokenResponse>('/api/egov/token', {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      },
    })

    // 最終確認試験エビデンス: 01-1 のリダイレクトURL と 02-1 のトークン交換 req/res を
    // 記録しておく (login flow は照会テストの capture 窓の外なので localStorage 持ち越し)。
    if (import.meta.client) {
      const cap = new Date().toISOString()
      localStorage.setItem('egov_ev_callback', JSON.stringify({ redirectUrl: maskCodeParam(redirectUrl), capturedAt: cap }))
      localStorage.setItem('egov_ev_token', JSON.stringify({
        reqBody: { grant_type: 'authorization_code', code: '****(masked)', redirect_uri: redirectUri, code_verifier: '****(masked)' },
        response: maskTokenResp(data),
        capturedAt: cap,
      }))
    }

    setTokens(data)
    sessionStorage.removeItem('egov_code_verifier')
    sessionStorage.removeItem('egov_state')
  }

  async function refreshAccessToken() {
    if (!refreshToken.value) throw new Error('No refresh token')

    const data = await $fetch<TokenResponse>('/api/egov/token', {
      method: 'POST',
      body: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken.value,
      },
    })

    // 最終確認試験エビデンス (03-1 アクセストークン再取得): capture 中なら実 req/res を記録。
    if (import.meta.client && captureActive()) {
      pushEvidence({
        egovUrl: realEgovUrl('/api/egov/token'),
        method: 'POST',
        requestHeaders: { 'Content-Type': 'application/json' },
        requestBody: { grant_type: 'refresh_token', refresh_token: '****(masked)' },
        response: maskTokenResp(data),
        httpStatus: 200,
        capturedAt: new Date().toISOString(),
      })
    }

    setTokens(data)
  }

  function setTokens(data: TokenResponse) {
    accessToken.value = data.access_token
    refreshToken.value = data.refresh_token
    tokenExpiresAt.value = Date.now() + data.expires_in * 1000
    client.setAccessToken(data.access_token)
    if (import.meta.client) {
      (window as any)._egovToken = data.access_token
      // localStorage に永続化（リロード時に復元）
      const prev = JSON.parse(localStorage.getItem('egov_tokens') || '{}')
      localStorage.setItem('egov_tokens', JSON.stringify({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: tokenExpiresAt.value,
        loginAt: prev.loginAt ?? Date.now(),
      }))
    }
  }

  async function logout() {
    // e-Gov OP の browser session cookie を消さないと次回 authorize で silent SSO が発動し、
    // ログアウトが効いていないように見える (Refs #146)。3 段構成でクリアする。
    const rt = refreshToken.value

    // 1. Backchannel: refresh_token を e-Gov OP 側で失効 (server proxy 経由、client_secret 必要)
    //    ネットワーク失敗しても local 状態は必ずクリアするため best-effort。
    if (rt) {
      try {
        await $fetch('/api/egov/logout', {
          method: 'POST',
          body: { refresh_token: rt },
        })
      } catch { /* best-effort — 続行 */ }
    }

    // 2. Local state をクリア
    accessToken.value = null
    refreshToken.value = null
    tokenExpiresAt.value = 0
    if (import.meta.client) {
      localStorage.removeItem('egov_tokens')
      // 3. Frontchannel: OP session cookie を消すため e-Gov の logout URL に redirect
      const url = new URL(`${authBase}/logout`)
      url.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/`)
      url.searchParams.set('client_id', clientId)
      window.location.href = url.toString()
    }
  }

  function getClient(): EgovClient {
    if (accessToken.value) {
      client.setAccessToken(accessToken.value)
      if (import.meta.client) {
        (window as any)._egovToken = accessToken.value
      }
    }
    return client
  }

  async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    if (!isAuthenticated.value && refreshToken.value) {
      await refreshAccessToken()
    }
    if (!accessToken.value) throw new Error('Not authenticated')
    if (import.meta.client) {
      (window as any)._egovToken = accessToken.value
    }

    const result = await $fetch<T>(`/api/egov${path}`, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
      },
    })
    // 最終確認試験エビデンス: GET 成功を記録 ($fetch のエラー挙動は温存)。
    if (import.meta.client && captureActive()) {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      pushEvidence({
        egovUrl: realEgovUrl(`/api/egov${path}${qs}`),
        method: 'GET',
        requestHeaders: { Authorization: 'Bearer ****(masked)' },
        requestBody: undefined,
        response: abbreviate(result),
        httpStatus: 200,
        capturedAt: new Date().toISOString(),
      })
    }
    return result
  }

  return {
    accessToken: readonly(accessToken),
    isAuthenticated,
    startLogin,
    handleCallback,
    refreshAccessToken,
    logout,
    apiFetch,
    getClient,
  }
}
