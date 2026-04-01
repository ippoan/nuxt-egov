const AUTH_BASE = 'https://account.e-gov.go.jp/auth'
const API_BASE = 'https://api.e-gov.go.jp/shinsei/v2'

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_expires_in: number
  refresh_token: string
  token_type: string
  id_token: string
  scope: string
}

export function useEgovAuth() {
  const config = useRuntimeConfig()
  const accessToken = useState<string | null>('egov_access_token', () => null)
  const refreshToken = useState<string | null>('egov_refresh_token', () => null)
  const tokenExpiresAt = useState<number>('egov_token_expires_at', () => 0)
  const isAuthenticated = computed(() => !!accessToken.value && Date.now() < tokenExpiresAt.value)

  async function startLogin() {
    const { codeVerifier, codeChallenge } = await generatePKCE()
    const state = crypto.randomUUID()

    sessionStorage.setItem('egov_code_verifier', codeVerifier)
    sessionStorage.setItem('egov_state', state)

    const clientId = config.public.egovClientId as string
    const redirectUri = config.public.egovRedirectUri as string

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid offline_access',
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    window.location.href = `${AUTH_BASE}/auth?${params}`
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

    const clientId = config.public.egovClientId as string
    const redirectUri = config.public.egovRedirectUri as string

    const res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: clientId,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Token request failed: ${res.status} ${error}`)
    }

    const data: TokenResponse = await res.json()
    setTokens(data)

    sessionStorage.removeItem('egov_code_verifier')
    sessionStorage.removeItem('egov_state')
  }

  async function refreshAccessToken() {
    if (!refreshToken.value) throw new Error('No refresh token')

    const clientId = config.public.egovClientId as string

    const res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken.value,
        client_id: clientId,
      }),
    })

    if (!res.ok) {
      logout()
      throw new Error('Token refresh failed')
    }

    const data: TokenResponse = await res.json()
    setTokens(data)
  }

  function setTokens(data: TokenResponse) {
    accessToken.value = data.access_token
    refreshToken.value = data.refresh_token
    tokenExpiresAt.value = Date.now() + data.expires_in * 1000
  }

  function logout() {
    accessToken.value = null
    refreshToken.value = null
    tokenExpiresAt.value = 0
  }

  async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    if (!isAuthenticated.value && refreshToken.value) {
      await refreshAccessToken()
    }
    if (!accessToken.value) throw new Error('Not authenticated')

    const url = new URL(`${API_BASE}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
      },
    })

    if (res.status === 401) {
      await refreshAccessToken()
      const retry = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
        },
      })
      if (!retry.ok) throw new Error(`API error: ${retry.status}`)
      return retry.json()
    }

    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  }

  return {
    accessToken: readonly(accessToken),
    isAuthenticated,
    startLogin,
    handleCallback,
    refreshAccessToken,
    logout,
    apiFetch,
  }
}
