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
    egovClientSecret: '',
    public: {
      egovClientId: '',
      egovRedirectUri: '',
      egovAuthBase: 'https://account2.sbx.e-gov.go.jp/auth',
      egovApiBase: 'https://api2.sbx.e-gov.go.jp/shinsei/v2',
    },
  },
})
