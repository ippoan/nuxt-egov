<script setup lang="ts">
import type {
  ApplyDetailResponse,
  NoticeDetailResponse,
  OfficialDocumentResponse,
  Notice,
  ResultsApplyDetail,
} from '@ippoan/egov-shinsei-sdk'

// 申請案件の詳細 (GET /apply/{arrive_id})。状況・通知 (補正の連絡)・公文書・納付情報を出す。
// 公文書は GET /official_document/{arrive_id}/{notice_sub_id} で取り、公文書ビューアと
// 同じ描画でその場に出す。取得完了の通知 (POST /official_document) は打たない
// (見るだけで e-Gov 側の「取得完了」を立てない)。
const route = useRoute()
const arriveId = computed(() => String(route.params.arriveId ?? ''))

const { hasSession, startLogin, apiFetch } = useEgovAuth()
const isProd = useRuntimeConfig().public.egovEnv === 'prod'
/** 申請済みの控え (alc-app の管理画面「点呼の届出」。到達番号で R2 に保存。Refs ippoan/alc-app#686) */
const ALC_ARCHIVES_URL = 'https://alc.ippoan.org/?role=admin&tab=tenko_filing'

const detail = ref<ResultsApplyDetail | null>(null)
const loading = ref(false)
const error = ref('')

// e-Gov の応答本文 (title / detail) を優先して出す。状態コードだけでは原因が分からない。
function errorText(e: unknown, fallback: string): string {
  const data = (e as { data?: { title?: string; detail?: string } })?.data
  const parts = [data?.title, data?.detail].filter(Boolean)
  if (parts.length) return parts.join(': ')
  return e instanceof Error ? e.message : fallback
}

async function fetchDetail() {
  loading.value = true
  error.value = ''
  try {
    const res = await apiFetch<ApplyDetailResponse>(`/apply/${encodeURIComponent(arriveId.value)}`)
    detail.value = res.results
  }
  catch (e) {
    error.value = errorText(e, '申請の詳細を取得できませんでした')
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  if (hasSession.value) fetchDetail()
})

// ---- 通知の詳細 (補正種別・添付ファイル) ----
const noticeDetails = reactive<Record<number, Notice>>({})
const noticeLoading = reactive<Record<number, boolean>>({})
const noticeErrors = reactive<Record<number, string>>({})

async function fetchNotice(subId: number) {
  noticeLoading[subId] = true
  delete noticeErrors[subId]
  try {
    const res = await apiFetch<NoticeDetailResponse>(
      `/notice/${encodeURIComponent(arriveId.value)}/${subId}`,
    )
    noticeDetails[subId] = res.results.notice
  }
  catch (e) {
    noticeErrors[subId] = errorText(e, '通知を取得できませんでした')
  }
  finally {
    noticeLoading[subId] = false
  }
}

// ---- 公文書 ----
const { loading: docLoading, error: docError, letters, forms, csvFiles, processBuffer, reset: resetDoc } = useDocumentViewer()
const openedDocSubId = ref<number | null>(null)
const docFileData = ref('')
const docFetching = ref(false)
const docFetchError = ref('')

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function saveBase64(b64: string, fileName: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([base64ToBytes(b64)], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

async function openOfficialDocument(subId: number) {
  openedDocSubId.value = subId
  docFileData.value = ''
  docFetchError.value = ''
  resetDoc()
  docFetching.value = true
  try {
    const res = await apiFetch<OfficialDocumentResponse>(
      `/official_document/${encodeURIComponent(arriveId.value)}/${subId}`,
    )
    docFileData.value = res.results.file_data
    await processBuffer(base64ToBytes(res.results.file_data).buffer)
  }
  catch (e) {
    docFetchError.value = errorText(e, '公文書を取得できませんでした')
  }
  finally {
    docFetching.value = false
  }
}

function closeOfficialDocument() {
  openedDocSubId.value = null
  docFileData.value = ''
  docFetchError.value = ''
  resetDoc()
}
</script>

<template>
  <div class="container">
    <div class="header">
      <h1>
        申請の詳細
        <span class="env-badge" :class="isProd ? 'env-prod' : 'env-sbx'">{{ isProd ? '本番' : '検証環境' }}</span>
      </h1>
      <div class="header-actions">
        <OpenInEgovButton />
        <NuxtLink to="/" class="btn btn-secondary">
          申請一覧へ戻る
        </NuxtLink>
      </div>
    </div>

    <p class="arrive-id">
      到達番号 <span class="mono">{{ arriveId }}</span>
    </p>
    <p v-if="isProd" class="egov-hint">
      申請書や添付ファイルは API では取れません。「e-Gov で開く」でアプリのマイページを開き、申請案件一覧でこの到達番号の案件を開いてください。
      点呼の届出の申請済みの控え (到達番号で保存した zip) は
      <a :href="ALC_ARCHIVES_URL" target="_blank" rel="noopener" data-testid="alc-archives-link">一歩庵点呼の「点呼の届出」の申請済みの控え</a>
      にあります (システム管理者のログインが要ります)。
    </p>

    <div v-if="!hasSession" class="login-section">
      <p>e-Govアカウントでログインすると申請の詳細を確認できます。</p>
      <button class="btn btn-primary" @click="startLogin">
        e-Govでログイン
      </button>
    </div>

    <template v-else>
      <p v-if="loading" class="empty">
        取得中...
      </p>
      <p v-if="error" class="error">
        {{ error }}
        <button class="btn btn-secondary retry" @click="fetchDetail">
          再取得
        </button>
      </p>

      <template v-if="detail">
        <!-- 概要 -->
        <section class="card">
          <h2>概要</h2>
          <dl class="summary">
            <dt>手続名</dt>
            <dd>{{ detail.proc_name }}</dd>
            <dt>ステータス</dt>
            <dd>
              <span class="status-badge" :class="statusClass(detail.status)">{{ detail.status }}</span>
            </dd>
            <dt>到達日時</dt>
            <dd>{{ detail.arrive_date }}</dd>
            <dt>提出先</dt>
            <dd>{{ detail.submission_destination || '—' }}</dd>
            <dt>法人名</dt>
            <dd>{{ detail.corporation_name || '—' }}</dd>
            <dt>申請者</dt>
            <dd>{{ detail.applicant_name || '—' }}</dd>
            <dt>納付状況</dt>
            <dd>{{ detail.pay_status || '—' }}</dd>
            <dt>取下げ</dt>
            <dd>{{ detail.withdraw_flag ? '可能' : '不可' }}</dd>
            <template v-if="detail.applied_account">
              <dt>提出したアカウント</dt>
              <dd>{{ detail.applied_account }}</dd>
            </template>
          </dl>
        </section>

        <!-- 通知 (補正の連絡など) -->
        <section class="card">
          <h2>通知 ({{ detail.notice_count ?? detail.notice_list?.length ?? 0 }}件)</h2>
          <p v-if="!detail.notice_list?.length" class="none">
            通知はありません
          </p>
          <article v-for="n in detail.notice_list ?? []" :key="n.notice_sub_id" class="notice">
            <header class="notice-head">
              <span v-if="n.notice_data_type" class="tag">{{ n.notice_data_type }}</span>
              <strong>{{ n.notice_title }}</strong>
            </header>
            <p class="meta">
              {{ n.issue_date }}<template v-if="n.issuer_organization">
                ・{{ n.issuer_organization }}
              </template>
            </p>
            <p v-if="n.correct_expired_date || n.correct_completed_date" class="correct">
              <template v-if="n.correct_expired_date">
                補正期限: {{ n.correct_expired_date }}
              </template>
              <template v-if="n.correct_completed_date">
                ／補正日時: {{ n.correct_completed_date }}
              </template>
            </p>
            <p v-if="n.notice_sentence" class="sentence">
              {{ n.notice_sentence }}
            </p>

            <template v-if="n.notice_sub_id != null">
              <div v-if="noticeDetails[n.notice_sub_id]" class="notice-detail">
                <p v-if="noticeDetails[n.notice_sub_id]!.correct_type">
                  補正種別: {{ noticeDetails[n.notice_sub_id]!.correct_type }}
                </p>
                <p v-if="!noticeDetails[n.notice_sub_id]!.attached_file_list?.length" class="none">
                  添付ファイルはありません
                </p>
                <ul v-else class="files">
                  <li v-for="(f, i) in noticeDetails[n.notice_sub_id]!.attached_file_list" :key="i">
                    <button
                      class="link"
                      :disabled="!f.file_data"
                      @click="f.file_data && saveBase64(f.file_data, f.file_name || `attachment-${i + 1}`)"
                    >
                      {{ f.file_name || `添付 ${i + 1}` }} を保存
                    </button>
                  </li>
                </ul>
              </div>
              <button
                v-else
                class="btn btn-secondary small"
                :disabled="noticeLoading[n.notice_sub_id]"
                @click="fetchNotice(n.notice_sub_id)"
              >
                {{ noticeLoading[n.notice_sub_id] ? '取得中...' : '添付ファイル・補正種別を見る' }}
              </button>
              <p v-if="noticeErrors[n.notice_sub_id]" class="error">
                {{ noticeErrors[n.notice_sub_id] }}
              </p>
            </template>
          </article>
        </section>

        <!-- 公文書 -->
        <section class="card">
          <h2>公文書 ({{ detail.doc_count ?? detail.official_list?.length ?? 0 }}件)</h2>
          <p v-if="!detail.official_list?.length" class="none">
            公文書はありません
          </p>
          <table v-else class="table">
            <thead>
              <tr>
                <th>件名</th>
                <th>発行日時</th>
                <th>取得期限</th>
                <th>取得完了</th>
                <th>署名</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in detail.official_list" :key="d.notice_sub_id">
                <td>{{ d.doc_title }}</td>
                <td>{{ d.allowed_date }}</td>
                <td>{{ d.doc_download_expired_date || '—' }}</td>
                <td>{{ d.doc_download_date || '未' }}</td>
                <td>{{ d.sign || '—' }}</td>
                <td>
                  <button
                    v-if="d.notice_sub_id != null"
                    class="btn btn-primary small"
                    :disabled="docFetching"
                    @click="openOfficialDocument(d.notice_sub_id)"
                  >
                    表示
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="openedDocSubId != null" class="doc-view">
            <div class="doc-actions">
              <button
                v-if="docFileData"
                class="btn btn-secondary small"
                @click="saveBase64(docFileData, `${arriveId}_${openedDocSubId}.zip`, 'application/zip')"
              >
                ZIP を保存
              </button>
              <button class="btn btn-secondary small" @click="closeOfficialDocument">
                閉じる
              </button>
            </div>
            <p v-if="docFetching || docLoading" class="empty">
              公文書を取得中...
            </p>
            <p v-if="docFetchError || docError" class="error">
              {{ docFetchError || docError }}
            </p>
            <DocumentPackageView :letters="letters" :forms="forms" :csv-files="csvFiles" />
          </div>
        </section>

        <!-- 納付情報 -->
        <section v-if="detail.apply_pay_list?.length" class="card">
          <h2>納付情報</h2>
          <table class="table">
            <thead>
              <tr>
                <th>納付手続名</th>
                <th>払込金額</th>
                <th>払込期限</th>
                <th>収納機関番号</th>
                <th>納付番号</th>
                <th>確認番号</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in detail.apply_pay_list" :key="i">
                <td>{{ p.pay_name_kana }}</td>
                <td>{{ p.total_fee != null ? `${p.total_fee.toLocaleString()}円` : '—' }}</td>
                <td>{{ p.pay_expired || '—' }}</td>
                <td class="mono">
                  {{ p.facility_number }}
                </td>
                <td class="mono">
                  {{ p.pay_number }}
                </td>
                <td class="mono">
                  {{ p.confirm_number }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.arrive-id {
  margin-bottom: 0.5rem;
  color: #4a5568;
  font-size: 0.9rem;
}

.egov-hint a {
  color: #2b6cb0;
}

.egov-hint {
  margin-bottom: 1rem;
  color: #718096;
  font-size: 0.8rem;
}

.card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
}

.card h2 {
  font-size: 1.05rem;
  color: #2d3748;
  margin-bottom: 0.75rem;
}

.card .table {
  box-shadow: none;
}

.summary {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.5rem 1.5rem;
  font-size: 0.9rem;
}

.summary dt {
  color: #718096;
}

.none {
  color: #a0aec0;
  font-size: 0.9rem;
}

.notice {
  border-top: 1px solid #e2e8f0;
  padding: 0.75rem 0;
}

.notice:first-of-type {
  border-top: none;
}

.notice-head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.tag {
  background: #edf2f7;
  color: #4a5568;
  border-radius: 4px;
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
}

.meta {
  color: #718096;
  font-size: 0.8rem;
  margin: 0.25rem 0;
}

.correct {
  color: #c05621;
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
}

.sentence {
  white-space: pre-wrap;
  font-size: 0.9rem;
  line-height: 1.6;
  margin: 0.5rem 0;
}

.notice-detail {
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

.files {
  list-style: none;
}

.link {
  background: none;
  border: none;
  color: #2b6cb0;
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.85rem;
  padding: 0.15rem 0;
}

.small {
  padding: 0.3rem 0.8rem;
  font-size: 0.8rem;
}

.retry {
  margin-left: 1rem;
}

.doc-view {
  margin-top: 1.25rem;
}

.doc-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
</style>
