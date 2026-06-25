import { execSync } from 'node:child_process'

const gitCommit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'unknown' }
})()

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false },
  vite: {
    server: {
      allowedHosts: ['test-nuxt.ippoan.org'],
    },
  },
  future: {
    compatibilityVersion: 4,
  },
  nitro: {
    preset: 'cloudflare_module',
  },
  typescript: {
    // workers/egov は独立した Cloudflare Worker (独自 package.json /
    // tsconfig / egov-worker-ci.yml を持つ)。root の nuxi typecheck から
    // 除外する。worker の deps (vitest / @cloudflare/workers-types) は
    // root CI では install されないため、含めると vitest module not found 等で
    // 落ちる。worker の型検証は egov-worker-ci.yml が担う。
    // exclude は生成される .nuxt/tsconfig.json 基準の相対パス。
    tsConfig: {
      exclude: ['../workers/**'],
    },
  },
  appConfig: {
    gitCommit,
  },
  runtimeConfig: {
    // client_secret は Nuxt worker の wrangler secret (NUXT_EGOV_CLIENT_SECRET) を
    // runtimeConfig 経由で読む。egov-staging worker の Secrets Store binding が CI
    // deploy で attach されず 500 になったため、OAuth (token/introspect/logout) は
    // Nuxt worker から e-Gov を直接叩く方式に戻した (Refs #133)。
    egovClientSecret: '',
    public: {
      egovClientId: '',
      egovRedirectUri: '',
      egovAuthBase: 'https://account2.sbx.e-gov.go.jp/auth',
      egovApiBase: 'https://api2.sbx.e-gov.go.jp/shinsei/v2',
      // e-Gov 呼び出しを集約する worker。server/api/egov/* はこの worker に
      // forward するだけの薄い proxy になり、client_secret inject は worker 側。
      egovWorkerBase: 'https://egov-staging.ippoan.org',
    },
  },
})
