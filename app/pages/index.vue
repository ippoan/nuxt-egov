<script setup lang="ts">
const { isAuthenticated, startLogin, logout, apiFetch } = useEgovAuth()

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

const dateFrom = ref('')
const dateTo = ref('')
const applications = ref<ApplyItem[]>([])
const totalCount = ref(0)
const loading = ref(false)
const error = ref('')

// デフォルトで過去3ヶ月
const now = new Date()
const threeMonthsAgo = new Date(now)
threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
dateFrom.value = threeMonthsAgo.toISOString().slice(0, 10)
dateTo.value = now.toISOString().slice(0, 10)

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
    <h1>e-Gov 申請状況チェック</h1>

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
          <tr v-for="app in applications" :key="app.arrive_id">
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

<script lang="ts">
function statusClass(status: string): string {
  if (status.includes('到達')) return 'status-arrived'
  if (status.includes('審査中')) return 'status-reviewing'
  if (status.includes('手続終了')) return 'status-completed'
  if (status.includes('取下げ')) return 'status-withdrawn'
  return ''
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f7fa;
  color: #333;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

h1 {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  color: #1a365d;
}

.login-section {
  text-align: center;
  padding: 4rem 2rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.login-section p {
  margin-bottom: 1.5rem;
  color: #666;
}

.btn {
  padding: 0.5rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: #2b6cb0;
  color: #fff;
}

.btn-primary:hover {
  background: #2c5282;
}

.btn-primary:disabled {
  background: #a0aec0;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e2e8f0;
  color: #4a5568;
}

.btn-secondary:hover {
  background: #cbd5e0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.date-range {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
}

.date-range label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #666;
}

.date-range input {
  padding: 0.4rem 0.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 4px;
  font-size: 0.9rem;
}

.error {
  background: #fed7d7;
  color: #c53030;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.count {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.table th,
.table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.85rem;
}

.table th {
  background: #f7fafc;
  font-weight: 600;
  color: #4a5568;
  white-space: nowrap;
}

.table tbody tr:hover {
  background: #f7fafc;
}

.mono {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 0.8rem;
}

.status-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.status-arrived {
  background: #bee3f8;
  color: #2a4365;
}

.status-reviewing {
  background: #fefcbf;
  color: #744210;
}

.status-completed {
  background: #c6f6d5;
  color: #22543d;
}

.status-withdrawn {
  background: #e2e8f0;
  color: #4a5568;
}

.empty {
  text-align: center;
  padding: 3rem;
  color: #a0aec0;
  background: #fff;
  border-radius: 8px;
}
</style>
