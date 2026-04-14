<script setup lang="ts">
import type { EgovClient } from '@ippoan/egov-shinsei-sdk'
import JSZip from 'jszip'
import { TEST_PROCEDURES, type TestProcedure } from '~/utils/finalTestProcedures'

const { isAuthenticated, startLogin, apiFetch, getClient } = useEgovAuth()

interface ProcedureResult {
  proc_id: string
  status: 'pending' | 'skeleton' | 'submitting' | 'done' | 'error'
  arrive_id?: string
  send_number?: string
  error?: string
}

const results = ref<Map<string, ProcedureResult>>(new Map())
const running = ref(false)
const progress = ref(0)
const currentProc = ref('')
const delay = ref(2000)

// localStorage から結果を復元
onMounted(() => {
  const saved = localStorage.getItem('egov_final_test_results')
  if (saved) {
    const arr: ProcedureResult[] = JSON.parse(saved)
    arr.forEach(r => results.value.set(r.proc_id, r))
  }
})

function saveResults() {
  localStorage.setItem('egov_final_test_results', JSON.stringify([...results.value.values()]))
}

function getResult(procId: string): ProcedureResult {
  return results.value.get(procId) ?? { proc_id: procId, status: 'pending' }
}

async function submitOne(proc: TestProcedure) {
  const r: ProcedureResult = { proc_id: proc.proc_id, status: 'skeleton' }
  results.value.set(proc.proc_id, r)

  try {
    // 1. スケルトン取得
    currentProc.value = `${proc.no}. スケルトン取得中...`
    const skeleton = await apiFetch<{ results: { file_data: string; configuration_file_name: string[]; file_info: Array<{ form_id: string; form_version: number; form_name: string; apply_file_name: string }> } }>(`/procedure/${proc.proc_id}`)

    // 2. スケルトンZIP展開 → 申請書XMLにテスト値を入れて再ZIP
    currentProc.value = `${proc.no}. 申請データ構築中...`
    const zipData = Uint8Array.from(atob(skeleton.results.file_data), c => c.charCodeAt(0))
    const zip = await JSZip.loadAsync(zipData)

    // 構成管理XML（kousei.xml）の必須フィールドのみに値を入れる（空タグはそのまま残す）
    const kouseiTestValues: Record<string, string> = {
      受付行政機関ID: '100' + proc.proc_id.substring(0, 3),
      手続ID: proc.proc_id,
      手続名称: proc.name,
      申請種別: '新規申請',
      氏名: 'テスト太郎',
      氏名フリガナ: 'テストタロウ',
      郵便番号: '1000001',
      住所: '東京都千代田区千代田１−１',
      電話番号: '0312345678',
      電子メールアドレス: 'test@example.com',
      法人名: 'テスト株式会社',
      提出先識別子: '49511000010000000003658',
      提出先名称: '北海道,札幌公共職業安定所',
    }

    for (const configFileName of skeleton.results.configuration_file_name) {
      const kouseiPath = `${proc.proc_id}/${configFileName}`
      const kouseiFile = zip.file(kouseiPath)
      if (kouseiFile) {
        let xml = await kouseiFile.async('string')
        // デバッグ: kousei.xmlの内容をコンソールに出力
        console.log(`[${proc.proc_id}] kousei.xml (before):`, xml.substring(0, 2000))
        for (const [tag, value] of Object.entries(kouseiTestValues)) {
          xml = xml.replace(new RegExp(`<${tag}/>`, 'g'), `<${tag}>${value}</${tag}>`)
          xml = xml.replace(new RegExp(`<${tag}></${tag}>`, 'g'), `<${tag}>${value}</${tag}>`)
        }
        // 提出先情報: 自己閉じタグ <提出先情報/> を展開
        xml = xml.replace('<提出先情報/>', `<提出先情報>\n\t\t\t\t\t\t<提出先識別子>49511000010000000003658</提出先識別子>\n\t\t\t\t\t\t<提出先名称>北海道,札幌公共職業安定所</提出先名称>\n\t\t\t\t\t</提出先情報>`)
        // 提出先情報ブロックが無い場合、<申請書属性情報>の前に挿入
        if (!xml.includes('<提出先情報>')) {
          const teishutsusakiBlock = `\n\t\t\t\t\t<提出先情報>\n\t\t\t\t\t\t<提出先識別子>49511000010000000003658</提出先識別子>\n\t\t\t\t\t\t<提出先名称>北海道,札幌公共職業安定所</提出先名称>\n\t\t\t\t\t</提出先情報>`
          if (xml.includes('<申請書属性情報>')) {
            xml = xml.replace('<申請書属性情報>', teishutsusakiBlock + '\n\t\t\t\t\t<申請書属性情報>')
          } else if (xml.includes('</構成情報>')) {
            xml = xml.replace('</構成情報>', teishutsusakiBlock + '\n\t\t\t\t</構成情報>')
          }
        }
        // 添付書類属性情報: ダミーファイルを「添付」として登録
        const dummyFileName = 'dummy.txt'
        if (!xml.includes('<添付書類属性情報>')) {
          const attachBlock = `
\t\t\t\t\t<添付書類属性情報>
\t\t\t\t\t\t<添付種別>添付</添付種別>
\t\t\t\t\t\t<添付書類名称>テスト添付書類１</添付書類名称>
\t\t\t\t\t\t<添付書類ファイル名称>${dummyFileName}</添付書類ファイル名称>
\t\t\t\t\t\t<提出情報>1</提出情報>
\t\t\t\t\t</添付書類属性情報>`
          xml = xml.replace('</管理情報>', '</管理情報>' + attachBlock)
        } else {
          xml = xml.replace(/<添付種別\/>/g, '<添付種別>添付</添付種別>')
          xml = xml.replace(/<添付書類ファイル名称\/>/g, `<添付書類ファイル名称>${dummyFileName}</添付書類ファイル名称>`)
          xml = xml.replace(/<提出情報\/>/g, '<提出情報>1</提出情報>')
        }
        // ダミー添付ファイルをZIPに追加
        zip.file(`${proc.proc_id}/${dummyFileName}`, 'test')
        // 空タグはそのまま残す
        zip.file(kouseiPath, xml)
      }
    }

    // 申請書XMLも空タグはそのまま残す（形式チェックファイルが必須項目を判定するため）

    const newZipBase64 = await zip.generateAsync({ type: 'base64' })

    // 3. 申請送信
    r.status = 'submitting'
    currentProc.value = `${proc.no}. 申請送信中...`
    const applyResult = await $fetch<{ results: { arrive_id: string } }>('/api/egov/apply', {
      method: 'POST',
      body: {
        proc_id: proc.proc_id,
        send_file: {
          file_name: `${proc.proc_id}.zip`,
          file_data: newZipBase64,
        },
      },
      headers: {
        Authorization: `Bearer ${useEgovAuth().accessToken.value}`,
      },
    })

    r.arrive_id = applyResult.results.arrive_id
    r.status = 'done'
    currentProc.value = `${proc.no}. 完了 → ${r.arrive_id}`
  }
  catch (e: unknown) {
    r.status = 'error'
    const err = e as { data?: { data?: { detail?: string; title?: string } }; message?: string }
    const detail = err.data?.data?.detail || err.data?.data?.title || err.message || String(e)
    r.error = detail
    currentProc.value = `${proc.no}. エラー: ${detail}`
    console.error(`[${proc.proc_id}]`, err.data?.data || e)
  }

  results.value.set(proc.proc_id, { ...r })
  saveResults()
}

async function runAll() {
  running.value = true
  progress.value = 0

  const pending = TEST_PROCEDURES.filter(p => getResult(p.proc_id).status !== 'done')

  for (let i = 0; i < pending.length; i++) {
    await submitOne(pending[i]!)
    progress.value = Math.round(((i + 1) / pending.length) * 100)
    if (i < pending.length - 1) {
      await new Promise(r => setTimeout(r, delay.value))
    }
  }

  running.value = false
  currentProc.value = '全件完了'
}

async function fetchSendNumbers() {
  currentProc.value = '送信番号取得中...'
  try {
    const list = await apiFetch<{ results: { apply_list: Array<{ arrive_id: string; send_number: string }> } }>('/apply/lists', {
      date_from: '2026-01-01',
      date_to: '2026-12-31',
      limit: '50',
    })

    if (list.results.apply_list) {
      for (const item of list.results.apply_list) {
        const r = results.value.get(
          [...results.value.entries()].find(([_, v]) => v.arrive_id === item.arrive_id)?.[0] ?? '',
        )
        if (r) {
          r.send_number = item.send_number
          results.value.set(r.proc_id, { ...r })
        }
      }
      saveResults()
    }
    currentProc.value = '送信番号取得完了'
  }
  catch (e: unknown) {
    currentProc.value = `エラー: ${e instanceof Error ? e.message : e}`
  }
}

function exportCsv() {
  const lines = ['No,proc_id,format,arrive_id,send_number']
  for (const proc of TEST_PROCEDURES) {
    const r = getResult(proc.proc_id)
    lines.push(`${proc.no},${proc.proc_id},${proc.format},${r.arrive_id ?? ''},${r.send_number ?? ''}`)
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'final-test-results.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function resetAll() {
  if (!confirm('全結果をリセットしますか？')) return
  results.value.clear()
  localStorage.removeItem('egov_final_test_results')
  progress.value = 0
  currentProc.value = ''
}

const standardProcs = TEST_PROCEDURES.filter(p => p.format === 'standard')
const individualProcs = TEST_PROCEDURES.filter(p => p.format === 'individual')
const doneCount = computed(() => [...results.value.values()].filter(r => r.status === 'done').length)
</script>

<template>
  <div style="max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
    <h1>最終確認試験 - 申請送信</h1>

    <div v-if="!isAuthenticated" style="padding: 20px; background: #fff3cd; border-radius: 8px; margin-bottom: 20px;">
      <p>e-Govにログインしてください</p>
      <button @click="startLogin" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
        e-Govでログイン
      </button>
    </div>

    <template v-else>
      <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
        <button @click="runAll" :disabled="running" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
          {{ running ? '実行中...' : '全件実行' }}
        </button>
        <button @click="fetchSendNumbers" :disabled="running" style="padding: 10px 20px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">
          送信番号取得
        </button>
        <button @click="exportCsv" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
          CSV出力
        </button>
        <button @click="resetAll" :disabled="running" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
          リセット
        </button>
        <span style="margin-left: auto;">
          完了: {{ doneCount }} / {{ TEST_PROCEDURES.length }}
        </span>
      </div>

      <div v-if="running || currentProc" style="padding: 10px; background: #e9ecef; border-radius: 4px; margin-bottom: 20px;">
        <div v-if="running" style="background: #dee2e6; border-radius: 4px; height: 8px; margin-bottom: 8px;">
          <div :style="{ width: progress + '%', background: '#28a745', height: '100%', borderRadius: '4px', transition: 'width 0.3s' }" />
        </div>
        <span>{{ currentProc }}</span>
      </div>

      <div style="display: flex; gap: 4px; margin-bottom: 10px;">
        <label>送信間隔(ms):</label>
        <input v-model.number="delay" type="number" min="500" max="10000" step="500" style="width: 80px;" />
      </div>

      <h2>標準形式 ({{ standardProcs.length }}件)</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="border: 1px solid #dee2e6; padding: 6px;">No</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">手続識別子</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">期待状態</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">備考</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">状態</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">到達番号</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">送信番号</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="proc in standardProcs" :key="proc.proc_id">
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">{{ proc.no }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 12px;">{{ proc.proc_id }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-size: 12px;">{{ proc.expected_state }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-size: 12px;">{{ proc.note }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">
              <span v-if="getResult(proc.proc_id).status === 'done'" style="color: #28a745;">完了</span>
              <span v-else-if="getResult(proc.proc_id).status === 'error'" style="color: #dc3545;" :title="getResult(proc.proc_id).error">エラー</span>
              <span v-else-if="getResult(proc.proc_id).status === 'skeleton'" style="color: #ffc107;">取得中</span>
              <span v-else-if="getResult(proc.proc_id).status === 'submitting'" style="color: #17a2b8;">送信中</span>
              <span v-else style="color: #6c757d;">待機</span>
            </td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 11px;">{{ getResult(proc.proc_id).arrive_id ?? '' }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 11px;">{{ getResult(proc.proc_id).send_number ?? '' }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">
              <button
                @click="submitOne(proc)"
                :disabled="running || getResult(proc.proc_id).status === 'done'"
                style="padding: 2px 8px; font-size: 12px; cursor: pointer;"
              >
                実行
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>個別署名形式 ({{ individualProcs.length }}件)</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="border: 1px solid #dee2e6; padding: 6px;">No</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">手続識別子</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">期待状態</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">備考</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">状態</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">到達番号</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">送信番号</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="proc in individualProcs" :key="proc.proc_id">
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">{{ proc.no }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 12px;">{{ proc.proc_id }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-size: 12px;">{{ proc.expected_state }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-size: 12px;">{{ proc.note }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">
              <span v-if="getResult(proc.proc_id).status === 'done'" style="color: #28a745;">完了</span>
              <span v-else-if="getResult(proc.proc_id).status === 'error'" style="color: #dc3545;" :title="getResult(proc.proc_id).error">エラー</span>
              <span v-else-if="getResult(proc.proc_id).status === 'skeleton'" style="color: #ffc107;">取得中</span>
              <span v-else-if="getResult(proc.proc_id).status === 'submitting'" style="color: #17a2b8;">送信中</span>
              <span v-else style="color: #6c757d;">待機</span>
            </td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 11px;">{{ getResult(proc.proc_id).arrive_id ?? '' }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 11px;">{{ getResult(proc.proc_id).send_number ?? '' }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">
              <button
                @click="submitOne(proc)"
                :disabled="running || getResult(proc.proc_id).status === 'done'"
                style="padding: 2px 8px; font-size: 12px; cursor: pointer;"
              >
                実行
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
