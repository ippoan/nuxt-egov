// egov-staging worker への薄い proxy (Refs #91)。client_secret inject は
// worker 側が行う。Nuxt app は client_secret を保持しない。
// worker へは service binding 経由で到達する (Cloudflare Access 回避、Refs #133)。
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const res = await egovWorkerFetch(event, '/token', {
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
