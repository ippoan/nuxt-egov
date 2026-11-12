<script setup lang="ts">
// e-Gov 電子申請アプリのマイページを開く (本番だけ)。
// shinsei.e-gov.go.jp の client-startup3 はブラウザのログインを起動中の e-Gov アプリへ
// 引き継ぎ、アプリ側でマイページ (直近の案件・申請案件一覧) を開く。
// 申請書や添付の PDF は API v2 で取れず、アプリでしか見られないための逃げ道。
// 個別の申請への直リンクは無い (どこを開いてもマイページに着く)。
const isProd = useRuntimeConfig().public.egovEnv === 'prod'
const EGOV_APP_URL = 'https://shinsei.e-gov.go.jp/recept/client-startup3/'
</script>

<template>
  <a
    v-if="isProd"
    :href="EGOV_APP_URL"
    target="_blank"
    rel="noopener"
    class="btn btn-secondary"
    title="e-Gov 電子申請アプリでマイページを開きます。申請書や添付ファイルはアプリの申請案件一覧から見られます"
  >
    e-Gov で開く
  </a>
</template>
