<script setup lang="ts">
const { handleCallback } = useEgovAuth()
const router = useRouter()
const error = ref('')

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')

  if (!code || !state) {
    error.value = '認可コードが取得できませんでした'
    return
  }

  try {
    await handleCallback(code, state)
    const returnTo = sessionStorage.getItem('egov_return_to') || '/'
    sessionStorage.removeItem('egov_return_to')
    router.replace(returnTo)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '認証に失敗しました'
  }
})
</script>

<template>
  <div class="callback">
    <p v-if="error" class="error">
      {{ error }}
    </p>
    <p v-else>
      認証処理中...
    </p>
  </div>
</template>

<style scoped>
.callback {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.error {
  background: #fed7d7;
  color: #c53030;
  padding: 1rem 2rem;
  border-radius: 8px;
}
</style>
