import type { H3Event } from 'h3'

// service binding が公開する fetcher の最小型 (workers-types 非依存)。
interface WorkerFetcher {
  fetch: (input: Request) => Promise<Response>
}

/**
 * egov-staging worker へのリクエストを **service binding 経由** で送る。
 *
 * public URL (`egovWorkerBase` = egov-staging.ippoan.org) 直叩きは、当該 host 全体に
 * 掛かった Cloudflare Access に server-to-server fetch が 302 され、ログイン HTML を
 * 掴んで `res.json()` が "Unexpected token '<'" で落ち 500 になる (Refs #133)。
 * service binding は内部 RPC で Access edge を通らないため worker の
 * `/token` `/introspect` `/logout` `/api/**` に直接到達できる。
 *
 * binding が無い環境 (ローカル dev 等) は従来どおり public URL に fallback する。
 */
export function egovWorkerFetch(
  event: H3Event,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const binding = (event.context as { cloudflare?: { env?: Record<string, unknown> } })
    .cloudflare?.env?.EGOV_WORKER as WorkerFetcher | undefined

  if (binding) {
    // service binding: hostname は無視され egov-staging worker に直結する。
    // worker は url.pathname で route するため path をそのまま保持する。
    return binding.fetch(new Request(`https://egov-worker${path}`, init))
  }

  // fallback: public URL (Access 未保護を前提とする dev 環境想定)。
  const config = useRuntimeConfig(event)
  const workerBase = config.public.egovWorkerBase as string
  return fetch(`${workerBase}${path}`, init)
}
