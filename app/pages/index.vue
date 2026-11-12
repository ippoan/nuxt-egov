<script setup lang="ts">
const { isAuthenticated, startLogin, logout, apiFetch } = useEgovAuth()
const isProd = useRuntimeConfig().public.egovEnv === 'prod'

interface ApplyItem {
  no: number
  send_number: string
  send_date: string
  status: string
  arrive_id: string
  arrive_date: string
  corporation_name: string
  applicant_name: string
  proc_name: string
}

interface ApplyListResponse {
  metadata: { title: string; detail: string }
  resultset: { all_count: number; limit: number; offset: number; count: number }
  results: { apply_list: ApplyItem[] }
}

// 詳細ページから戻ったときに検索条件と結果が残るよう useState に置く。
// 期間の既定は過去3ヶ月。
const dateFrom = useState('apply_date_from', () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
})
const dateTo = useState('apply_date_to', () => new Date().toISOString().slice(0, 10))
const applications = useState<ApplyItem[]>('apply_list', () => [])
const totalCount = useState('apply_total_count', () => 0)
const loading = ref(false)
const error = ref('')

function openDetail(arriveId: string) {
  if (arriveId) navigateTo(`/apply/${encodeURIComponent(arriveId)}`)
}

async function fetchApplications() {
  loading.value = true
  error.value = ''
  try {
    const data = await apiFetch<ApplyListResponse>('/apply/lists', {
      date_from: dateFrom.value,
      date_to: dateTo.value,
      limit: '50',
      offset: '0',
    })
    applications.value = data.results.apply_list ?? []
    totalCount.value = data.resultset.all_count
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : '取得に失敗しました'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="container">
    <div class="header">
      <h1>
        e-Gov 申請状況チェック
        <span class="env-badge" :class="isProd ? 'env-prod' : 'env-sbx'">{{ isProd ? '本番' : '検証環境' }}</span>
      </h1>
      <div class="header-actions">
        <OpenInEgovButton />
        <NuxtLink to="/documents" class="btn btn-secondary">
          公文書ビューア
        </NuxtLink>
      </div>
    </div>

    <div v-if="!isAuthenticated" class="login-section">
      <p>e-Govアカウントでログインして申請状況を確認できます。</p>
      <button class="btn btn-primary" @click="startLogin">
        e-Govでログイン
      </button>
    </div>

    <div v-else>
      <div class="toolbar">
        <div class="date-range">
          <label>
            開始日
            <input v-model="dateFrom" type="date">
          </label>
          <label>
            終了日
            <input v-model="dateTo" type="date">
          </label>
          <button class="btn btn-primary" :disabled="loading" @click="fetchApplications">
            {{ loading ? '取得中...' : '検索' }}
          </button>
        </div>
        <button class="btn btn-secondary" @click="logout">
          ログアウト
        </button>
      </div>

      <p v-if="error" class="error">
        {{ error }}
      </p>

      <p v-if="totalCount > 0" class="count">
        全{{ totalCount }}件
      </p>

      <table v-if="applications.length > 0" class="table">
        <thead>
          <tr>
            <th>No</th>
            <th>手続名</th>
            <th>ステータス</th>
            <th>送信日時</th>
            <th>到達日時</th>
            <th>申請者</th>
            <th>到達番号</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="app in applications"
            :key="app.arrive_id"
            class="clickable"
            tabindex="0"
            title="クリックで詳細を表示"
            @click="openDetail(app.arrive_id)"
            @keydown.enter="openDetail(app.arrive_id)"
          >
            <td>{{ app.no }}</td>
            <td>{{ app.proc_name }}</td>
            <td>
              <span class="status-badge" :class="statusClass(app.status)">
                {{ app.status }}
              </span>
            </td>
            <td>{{ app.send_date }}</td>
            <td>{{ app.arrive_date }}</td>
            <td>{{ app.applicant_name }}</td>
            <td class="mono">
              {{ app.arrive_id }}
            </td>
          </tr>
        </tbody>
      </table>

      <p v-else-if="!loading && totalCount === 0 && !error" class="empty">
        申請案件がありません
      </p>
    </div>
  </div>
</template>
