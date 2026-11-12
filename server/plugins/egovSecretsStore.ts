// 本番 (egov-check) の e-Gov client_id / client_secret を CF Secrets Store から読む。
//
// 本番の ID / API キーは repo にも GitHub にも置かず、GCP Secret Manager
// (`NUXT_PUBLIC_EGOV_CLIENT_ID_PROD` / `NUXT_EGOV_CLIENT_SECRET_PROD`) を sync_from_gcp で
// Secrets Store に写したものだけを正とする。wrangler.jsonc の top-level が
// `EGOV_CLIENT_ID` / `EGOV_CLIENT_SECRET` の secrets_store_secrets binding を持つ。
//
// Secrets Store の値は `await binding.get()` でしか読めず、env 文字列として
// runtimeConfig へ自動では入らない。そこで request ごとに読み、その request 用の
// runtimeConfig (`useRuntimeConfig(event)` は request ごとの複製) に入れる。
// 以降の token / introspect / logout と、画面へ渡す public config (SSR payload) は
// 従来どおり runtimeConfig を読むだけで済む。
//
// binding の無い環境 (staging = vars に平文の sbx ID、ローカル dev) では何もしない。
interface SecretsStoreSecret {
  get: () => Promise<string>
}

function isSecret(v: unknown): v is SecretsStoreSecret {
  return !!v && typeof (v as SecretsStoreSecret).get === 'function'
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } })
      .cloudflare?.env
    const idBinding = env?.EGOV_CLIENT_ID
    const secretBinding = env?.EGOV_CLIENT_SECRET
    if (!isSecret(idBinding) && !isSecret(secretBinding)) return

    const config = useRuntimeConfig(event)
    const [clientId, clientSecret] = await Promise.all([
      isSecret(idBinding) ? idBinding.get() : undefined,
      isSecret(secretBinding) ? secretBinding.get() : undefined,
    ])
    if (clientId) config.public.egovClientId = clientId
    if (clientSecret) config.egovClientSecret = clientSecret
  })
})
