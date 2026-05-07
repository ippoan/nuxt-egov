export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
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
