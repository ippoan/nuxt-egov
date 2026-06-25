// e-Gov token introspection を Nuxt worker から直接叩く。client_secret は
// wrangler secret (NUXT_EGOV_CLIENT_SECRET → runtimeConfig.egovClientSecret) を inject。
// (egov-staging 経由 Secrets Store binding が CI deploy で attach されず 500 に
//  なったため直叩きに戻した。Refs #133)
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event)

  const clientId = config.public.egovClientId as string
  const clientSecret = config.egovClientSecret as string
  const authBase = config.public.egovAuthBase as string
  const basicAuth = btoa(`${clientId}:${clientSecret}`)

  const params = new URLSearchParams()
  params.set('token', body.token)
  if (body.token_type_hint) {
    params.set('token_type_hint', body.token_type_hint)
  }

  const res = await fetch(`${authBase}/token/introspect`, {
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
