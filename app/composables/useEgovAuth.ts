import { EgovClient, generatePKCE, buildAuthorizationUrl } from '@ippoan/egov-shinsei-sdk'
import type { TokenResponse } from '@ippoan/egov-shinsei-sdk'

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
  })

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

    const data = await $fetch<TokenResponse>('/api/egov/token', {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      },
    })

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

    setTokens(data)
  }

  function setTokens(data: TokenResponse) {
    accessToken.value = data.access_token
    refreshToken.value = data.refresh_token
    tokenExpiresAt.value = Date.now() + data.expires_in * 1000
    client.setAccessToken(data.access_token)
    // CDPデバッグ用: コンソールから window._egovToken でトークン取得可能
    if (import.meta.client) {
      (window as any)._egovToken = data.access_token
    }
  }

  function logout() {
    accessToken.value = null
    refreshToken.value = null
    tokenExpiresAt.value = 0
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

    return $fetch<T>(`/api/egov${path}`, {
      params,
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
      },
    })
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
