// egov-staging worker への薄い proxy (Refs #91)。client_secret inject は
// worker 側が行う。e-Gov は 204 No Content を返す。
// worker へは service binding 経由で到達する (Refs #133)。
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const res = await egovWorkerFetch(event, '/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
