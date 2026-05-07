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
