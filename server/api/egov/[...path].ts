// egov-staging worker への薄い proxy (Refs #91)。e-Gov v2 API への透過は
// worker の /api/** が行い、Nuxt server は worker に forward するだけ。
// caller の Authorization (Bearer) と X-eGovAPI-Trial をそのまま渡す。
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const workerBase = config.public.egovWorkerBase as string
  const path = getRouterParam(event, 'path') || ''
  const query = getQuery(event)
  const method = event.method

  const authHeader = getHeader(event, 'authorization')
  if (!authHeader) {
    throw createError({ statusCode: 401, message: 'No authorization header' })
  }

  const url = new URL(`${workerBase}/api/${path}`)
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v))
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
    // e-Gov のエラー本文 (title / detail / report_list 等) をそのまま透過する。
    // createError({ data }) で包むと h3 が { statusCode, message, data: <body> } に
    // ラップし、SDK (EgovApiError) が top-level の report_list / detail を拾えず
    // messages:[""] の空表示になっていた (申請データチェックエラーの詳細が消える)。
    setResponseStatus(event, res.status)
    return data
  }

  return data
})
