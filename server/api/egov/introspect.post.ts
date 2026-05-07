export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const clientId = config.public.egovClientId as string
  const clientSecret = config.egovClientSecret as string
  const authBase = config.public.egovAuthBase as string
  const basicAuth = btoa(`${clientId}:${clientSecret}`)

  const params = new URLSearchParams()
  params.set('token', body.token)
  if (body.token_type_hint) params.set('token_type_hint', body.token_type_hint)

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
