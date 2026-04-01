// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 4,
  },
  ssr: false,
  app: {
    baseURL: '/nuxt-egov/',
  },
  runtimeConfig: {
    public: {
      egovClientId: '',
      egovRedirectUri: '',
    },
  },
})
