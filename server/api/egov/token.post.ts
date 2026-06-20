// egov-staging worker への薄い proxy (Refs #91)。client_secret inject は
// worker 側が行う。Nuxt app は client_secret を保持しない。
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const workerBase = config.public.egovWorkerBase as string
  const body = await readBody(event)

  const res = await fetch(`${workerBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    throw createError({ statusCode: res.status, data })
  }

  return data
})
