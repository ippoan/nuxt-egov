// e-Gov OAuth token endpoint を Nuxt worker から直接叩く。client_secret は
// wrangler secret (NUXT_EGOV_CLIENT_SECRET → runtimeConfig.egovClientSecret) を inject。
// egov-staging worker 経由 (Secrets Store binding) は CI deploy で binding が attach
// されず env.EGOV_CLIENT_SECRET が undefined → 500 になったため直叩きに戻した (Refs #133)。
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event) as Record<string, string>

  const clientId = config.public.egovClientId as string
  const clientSecret = config.egovClientSecret as string
  const authBase = config.public.egovAuthBase as string
  const basicAuth = btoa(`${clientId}:${clientSecret}`)

  const params = new URLSearchParams()
  params.set('grant_type', body.grant_type)

  if (body.grant_type === 'authorization_code') {
    params.set('code', body.code)
    params.set('redirect_uri', body.redirect_uri)
    if (body.code_verifier) {
      params.set('code_verifier', body.code_verifier)
    }
  }
  else if (body.grant_type === 'refresh_token') {
    params.set('refresh_token', body.refresh_token)
  }

  const res = await fetch(`${authBase}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: params,
  })

  const data = await res.json()

  if (!res.ok) {
    throw createError({ statusCode: res.status, data })
  }

  return data
})
