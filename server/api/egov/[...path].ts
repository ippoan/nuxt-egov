export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const apiBase = config.public.egovApiBase as string
  const path = getRouterParam(event, 'path') || ''
  const query = getQuery(event)
  const method = event.method

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader) {
    throw createError({ statusCode: 401, message: 'No authorization header' })
  }

  const url = new URL(`${apiBase}/${path}`)
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === 'string') {
      url.searchParams.set(k, v)
    }
  }

  const headers: Record<string, string> = {
    'Authorization': authHeader,
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const rawBody = await readBody(event)
    if (rawBody) {
      body = JSON.stringify(rawBody)
      headers['Content-Type'] = 'application/json'
    }
  }

  const trialHeader = getHeader(event, 'x-egovapi-trial')
  if (trialHeader) {
    headers['X-eGovAPI-Trial'] = trialHeader
  }

  const res = await fetch(url.toString(), { method, headers, body })
  const data = await res.json()

  if (!res.ok) {
    throw createError({ statusCode: res.status, data })
  }

  return data
})
