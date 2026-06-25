// egov-staging worker への薄い proxy (Refs #91)。e-Gov v2 API への透過は
// worker の /api/** が行い、Nuxt server は worker に forward するだけ。
// caller の Authorization (Bearer) と X-eGovAPI-Trial をそのまま渡す。
// worker へは service binding 経由で到達する (Cloudflare Access 回避、Refs #133)。
export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path') || ''
  const query = getQuery(event)
  const method = event.method

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader) {
    throw createError({ statusCode: 401, message: 'No authorization header' })
  }

  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) {
      search.set(k, String(v))
    }
  }
  const qs = search.toString()
  const workerPath = `/api/${path}${qs ? `?${qs}` : ''}`

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

  const res = await egovWorkerFetch(event, workerPath, { method, headers, body })
  const data = await res.json()

  if (!res.ok) {
    // e-Gov のエラー本文 (title / detail / report_list 等) をそのまま透過する。
    // createError({ data }) で包むと h3 が { statusCode, message, data: <body> } に
    // ラップし、SDK (EgovApiError) が top-level の report_list / detail を拾えず
    // messages:[""] の空表示になっていた (申請データチェックエラーの詳細が消える)。
    setResponseStatus(event, res.status)
    return data
  }

  return data
})
