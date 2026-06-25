// e-Gov logout (refresh_token 失効) を Nuxt worker から直接叩く。client_secret は
// wrangler secret (NUXT_EGOV_CLIENT_SECRET → runtimeConfig.egovClientSecret) を inject。
// e-Gov は 204 No Content を返す。
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
  params.set('refresh_token', body.refresh_token)

  const res = await fetch(`${authBase}/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: params,
  })

  if (res.status === 204) {
    return { status: 204 }
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw createError({ statusCode: res.status, data })
  }

  return data
})
