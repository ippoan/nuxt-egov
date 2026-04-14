<script setup lang="ts">
import type { EgovClient } from '@ippoan/egov-shinsei-sdk'
import JSZip from 'jszip'
import { TEST_PROCEDURES, type TestProcedure } from '~/utils/finalTestProcedures'

const { isAuthenticated, startLogin, apiFetch, getClient } = useEgovAuth()
const { pfxLoaded, certSubject, loadPfx, signKouseiXml } = useXmlSign()

const enableSign = ref(false)
const pfxPassword = ref('gpkitest')
const pfxFileInput = ref<HTMLInputElement | null>(null)
const pfxError = ref('')

async function handleLoadPfx() {
  pfxError.value = ''
  const file = pfxFileInput.value?.files?.[0]
  if (!file) {
    pfxError.value = 'PFXファイルを選択してください'
    return
  }
  try {
    await loadPfx(file, pfxPassword.value)
  }
  catch (e: unknown) {
    pfxError.value = e instanceof Error ? e.message : String(e)
  }
}

// 半角英数記号→全角変換（e-Gov XMLは全角のみ許可のフィールドがある）
function toFullWidth(s: string): string {
  return s.replace(/[\x21-\x7E]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0))
}

// checkファイルから必須フィールドを解析し、タグ名+型に応じたテスト値を生成
function buildTestValuesFromCheck(checkXml: string): Record<string, string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(checkXml, 'text/xml')
  const items = doc.querySelectorAll('checkItem')
  const values: Record<string, string> = {}
  const now = new Date()

  items.forEach((item) => {
    const tag = item.querySelector('errtag')?.textContent
    if (!tag) return
    const required = item.querySelector('omitDisabled') !== null
    if (!required) return // 必須フィールドのみ

    const isNum = item.querySelector('numerical') !== null
    const isFullWidth = item.querySelector('fullAllChar') !== null
    const maxLenEl = item.querySelector('char > range > number')
    const maxLen = maxLenEl ? Number(maxLenEl.textContent) : 10
    const intDigitEl = item.querySelector('intDigit > number')
    const intDigit = intDigitEl ? Number(intDigitEl.textContent) : 0

    // タグ名パターンで値を決定（/区切りの場合は最後のセグメントで判定）
    const lastSeg = tag.includes('/') ? tag.split('/').pop()! : tag
    const t = lastSeg.toLowerCase()
    if (t.includes('年') && !t.includes('氏名') && !t.includes('名称')) {
      values[tag] = isNum ? String(now.getFullYear() % 100) : String(now.getFullYear())
    } else if (t.includes('月') && !t.includes('氏名') && !t.includes('名称')) {
      values[tag] = String(now.getMonth() + 1)
    } else if (t.includes('日') && !t.includes('氏名') && !t.includes('名称')) {
      values[tag] = String(now.getDate())
    } else if (t.includes('郵便番号') && t.includes('親')) {
      values[tag] = '100'
    } else if (t.includes('郵便番号') && t.includes('子')) {
      values[tag] = '0014'
    } else if (t.includes('所在地') || t.includes('住所')) {
      values[tag] = '東京都千代田区永田町'
    } else if (t.includes('名称') || t.includes('事業所名')) {
      values[tag] = isFullWidth ? 'テスト事業所' : 'テスト事業所'
    } else if (t.includes('氏名') && t.includes('カナ')) {
      values[tag] = isFullWidth ? 'テスト　タロウ' : 'テスト タロウ'
    } else if (t.includes('氏名')) {
      values[tag] = 'テスト　太郎'
    } else if (t.includes('記号')) {
      values[tag] = isNum ? '1' : 'ア'
    } else if (t.includes('番号') && isNum) {
      values[tag] = '1'.padStart(intDigit || 1, '0').substring(0, intDigit || 5)
    } else if (t.includes('番号')) {
      values[tag] = '0001'
    } else if (t.includes('件数') || t.includes('人数')) {
      values[tag] = '0'
    } else if (isNum) {
      values[tag] = '1'
    } else if (isFullWidth) {
      values[tag] = 'テスト'
    } else {
      values[tag] = 'test'
    }
  })

  return values
}

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
const showSettings = ref(false)

// 編集可能なテストデータ（localStorageで永続化）
const testData = reactive({
  氏名: 'テスト\u3000太郎',
  氏名フリガナ: 'テスト\u3000タロウ',
  郵便番号: '1000014',
  住所: '東京都千代田区永田町１丁目７番１号',
  住所フリガナ: 'トウキョウトチヨダクナガタチョウ',
  電話番号: '03-1234-5678',
  電子メールアドレス: 'test@example.com',
  法人名: 'テスト株式会社',
  提出先識別子: '49511000010000000003658',
  提出先名称: '北海道,札幌公共職業安定所',
})

// localStorage から結果とテストデータを復元
onMounted(() => {
  const saved = localStorage.getItem('egov_final_test_results')
  if (saved) {
    const arr: ProcedureResult[] = JSON.parse(saved)
    arr.forEach(r => results.value.set(r.proc_id, r))
  }
  const savedData = localStorage.getItem('egov_final_test_data')
  if (savedData) {
    Object.assign(testData, JSON.parse(savedData))
  }
})

function saveTestData() {
  localStorage.setItem('egov_final_test_data', JSON.stringify(testData))
}

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

    // 構成管理XML（kousei.xml）の必須フィールドのみに値を入れる
    // 提出先識別子/提出先名称はkouseiTestValuesに含めない（手続によって不要なため空タグのまま残す）
    const kouseiTestValues: Record<string, string> = {
      受付行政機関ID: '100' + proc.proc_id.substring(0, 3),
      手続ID: proc.proc_id,
      手続名称: proc.name,
      申請種別: '新規申請',
      氏名: testData.氏名,
      氏名フリガナ: testData.氏名フリガナ,
      郵便番号: testData.郵便番号,
      住所: testData.住所,
      住所フリガナ: testData.住所フリガナ,
      電話番号: testData.電話番号,
      電子メールアドレス: testData.電子メールアドレス,
      法人名: testData.法人名,
    }

    for (const configFileName of skeleton.results.configuration_file_name) {
      const kouseiPath = `${proc.proc_id}/${configFileName}`
      const kouseiFile = zip.file(kouseiPath)
      if (kouseiFile) {
        let xml = await kouseiFile.async('string')
        // デバッグ: kousei.xmlの内容をコンソールに出力
        console.log(`[${proc.proc_id}] kousei.xml (before):`, xml.substring(0, 3000))
        for (const [tag, value] of Object.entries(kouseiTestValues)) {
          xml = xml.replace(new RegExp(`<${tag}/>`, 'g'), `<${tag}>${value}</${tag}>`)
          xml = xml.replace(new RegExp(`<${tag}></${tag}>`, 'g'), `<${tag}>${value}</${tag}>`)
        }
        // 添付書類属性情報: スケルトンに既にある場合のみ値を埋める（無い場合は追加しない）
        if (xml.includes('<添付書類属性情報>')) {
          xml = xml.replace(/<添付種別\/>/g, '<添付種別>添付</添付種別>')
          const dummyFileName = 'dummy.txt'
          xml = xml.replace(/<添付書類ファイル名称\/>/g, `<添付書類ファイル名称>${dummyFileName}</添付書類ファイル名称>`)
          xml = xml.replace(/<提出情報\/>/g, '<提出情報>1</提出情報>')
          zip.file(`${proc.proc_id}/${dummyFileName}`, 'test')
        }
        // 申請書属性情報: file_infoから自動生成して挿入
        if (!xml.includes('<申請書属性情報>') && skeleton.results.file_info.length > 0) {
          const fi = skeleton.results.file_info[0]!
          const shinseishoBlock = `\n\t\t\t\t<申請書属性情報>\n\t\t\t\t\t<申請書様式ID>${fi.form_id}</申請書様式ID>\n\t\t\t\t\t<申請書様式バージョン>${String(fi.form_version).padStart(4, '0')}</申請書様式バージョン>\n\t\t\t\t\t<申請書様式名称>${fi.form_name}</申請書様式名称>\n\t\t\t\t\t<申請書ファイル名称>${fi.apply_file_name}</申請書ファイル名称>\n\t\t\t\t</申請書属性情報>`
          xml = xml.replace('</構成情報>', shinseishoBlock + '\n\t\t\t\t</構成情報>')
        }
        // 空タグはそのまま残す（不要な値を入れない）
        zip.file(kouseiPath, xml)
      }
    }

    // 申請書XML: checkファイルから必須フィールドを解析し、テスト値を自動填入
    for (const fi of skeleton.results.file_info) {
      const applyPath = `${proc.proc_id}/${fi.apply_file_name}`
      const checkPath = `${proc.proc_id}/${fi.form_id}check.xml`
      const applyFile = zip.file(applyPath)
      const checkFile = zip.file(checkPath)
      if (applyFile && checkFile) {
        let applyXml = await applyFile.async('string')
        const checkXml = await checkFile.async('string')
        const testValues = buildTestValuesFromCheck(checkXml)
        for (const [tag, value] of Object.entries(testValues)) {
          // check.xml の / 区切りはネスト構造のパス表現 — 最後のセグメントが実際のタグ名
          const actualTag = tag.includes('/') ? tag.split('/').pop()! : tag
          applyXml = applyXml.replace(new RegExp(`<${actualTag}></${actualTag}>`, 'g'), `<${actualTag}>${value}</${actualTag}>`)
        }
        // 年/月/日はネスト構造で複数存在するため、buildTestValuesでは1回しか置換されない
        // 残った空の年月日タグを全て埋める
        const now = new Date()
        applyXml = applyXml.replace(/<年><\/年>/g, `<年>${now.getFullYear() % 100}</年>`)
        applyXml = applyXml.replace(/<月><\/月>/g, `<月>${now.getMonth() + 1}</月>`)
        applyXml = applyXml.replace(/<日><\/日>/g, `<日>${now.getDate()}</日>`)
        console.log(`[${proc.proc_id}] apply filled ${Object.keys(testValues).length} fields`)
        zip.file(applyPath, applyXml)
      }
    }

    // 署名を付与（署名ON + PFX読込済み + 手続が署名必要な場合のみ）
    if (enableSign.value && pfxLoaded.value && proc.signatureRequired) {
      for (const configFileName of skeleton.results.configuration_file_name) {
        const kouseiPath = `${proc.proc_id}/${configFileName}`
        const kouseiFile = zip.file(kouseiPath)
        if (kouseiFile) {
          let kouseiXml = await kouseiFile.async('string')

          // 申請書XMLファイルを収集（署名 Reference 用）
          const appFiles = new Map<string, string | Uint8Array>()
          for (const fi of skeleton.results.file_info) {
            const appPath = `${proc.proc_id}/${fi.apply_file_name}`
            const appFile = zip.file(appPath)
            if (appFile) {
              appFiles.set(fi.apply_file_name, await appFile.async('string'))
            }
          }

          currentProc.value = `${proc.no}. 署名付与中...`
          kouseiXml = signKouseiXml(kouseiXml, appFiles)
          console.log(`[${proc.proc_id}] kousei.xml (signed):`, kouseiXml.substring(0, 3000))
          zip.file(kouseiPath, kouseiXml)
        }
      }
    }

    const newZipBase64 = await zip.generateAsync({ type: 'base64' })

    // 3. 申請送信
    r.status = 'submitting'
    currentProc.value = `${proc.no}. 申請送信中...`
    const submitHeaders: Record<string, string> = {
      Authorization: `Bearer ${useEgovAuth().accessToken.value}`,
    }
    // 署名ONかつ署名必要手続の場合のみTrialなし（本番挙動）。それ以外はTrialで送信。
    const useRealSubmit = enableSign.value && proc.signatureRequired
    if (!useRealSubmit) {
      submitHeaders['X-eGovAPI-Trial'] = 'true'
    }

    const applyResult = await $fetch<{ results: { arrive_id: string } }>('/api/egov/apply', {
      method: 'POST',
      body: {
        proc_id: proc.proc_id,
        send_file: {
          file_name: `${proc.proc_id}.zip`,
          file_data: newZipBase64,
        },
      },
      headers: submitHeaders,
    })

    r.arrive_id = applyResult.results.arrive_id
    r.status = 'done'
    currentProc.value = `${proc.no}. 完了 → ${r.arrive_id}`
  }
  catch (e: unknown) {
    r.status = 'error'
    const err = e as { data?: { data?: Record<string, unknown> }; message?: string }
    const apiData = err.data?.data
    const detail = apiData ? JSON.stringify(apiData, null, 2) : err.message || String(e)
    r.error = detail
    currentProc.value = `${proc.no}. エラー: ${apiData?.title || apiData?.detail || err.message}`
    console.error(`[${proc.proc_id}] full error:`, apiData || e)
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
      <!-- 電子署名設定 -->
      <div style="padding: 16px; background: #f0f4ff; border: 1px solid #b8c9ff; border-radius: 8px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <label style="font-weight: bold;">
            <input v-model="enableSign" type="checkbox" style="margin-right: 6px;" />
            電子署名を付与する
          </label>
          <span v-if="enableSign" style="font-size: 12px; color: #666;">
            (X-eGovAPI-Trial ヘッダーなしで送信)
          </span>
          <span v-else style="font-size: 12px; color: #999;">
            (Trial モード — 署名なし)
          </span>
        </div>
        <div v-if="enableSign" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <input ref="pfxFileInput" type="file" accept=".pfx,.p12" style="font-size: 13px;" />
          <input v-model="pfxPassword" type="password" placeholder="パスワード" style="width: 120px; padding: 4px 8px; font-size: 13px;" />
          <button @click="handleLoadPfx" style="padding: 4px 12px; font-size: 13px; cursor: pointer;">
            読込
          </button>
          <span v-if="pfxLoaded" style="color: #28a745; font-size: 13px;">
            {{ certSubject }}
          </span>
          <span v-if="pfxError" style="color: #dc3545; font-size: 13px;">
            {{ pfxError }}
          </span>
          <span v-if="enableSign && !pfxLoaded && !pfxError" style="color: #ffc107; font-size: 13px;">
            PFXファイルを読み込んでください
          </span>
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
        <button @click="runAll" :disabled="running || (enableSign && !pfxLoaded)" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
          {{ running ? '実行中...' : enableSign ? '全件実行（署名付き）' : '全件実行（Trial）' }}
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
        <button @click="showSettings = !showSettings" style="padding: 10px 20px; background: #fd7e14; color: white; border: none; border-radius: 4px; cursor: pointer;">
          {{ showSettings ? '設定を閉じる' : '申請データ設定' }}
        </button>
        <span style="margin-left: auto;">
          完了: {{ doneCount }} / {{ TEST_PROCEDURES.length }}
        </span>
      </div>

      <!-- 申請データ設定パネル -->
      <div v-if="showSettings" style="padding: 16px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 12px 0; font-size: 14px;">申請データ設定（編集後は自動保存）</h3>
        <div style="display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; align-items: center; font-size: 13px;">
          <label>氏名:</label>
          <input v-model="testData.氏名" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
          <label>氏名フリガナ:</label>
          <input v-model="testData.氏名フリガナ" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
          <label>郵便番号:</label>
          <input v-model="testData.郵便番号" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
          <label>住所:</label>
          <input v-model="testData.住所" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
          <label>住所フリガナ:</label>
          <input v-model="testData.住所フリガナ" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
          <label>電話番号:</label>
          <input v-model="testData.電話番号" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
          <label>メールアドレス:</label>
          <input v-model="testData.電子メールアドレス" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
          <label>法人名:</label>
          <input v-model="testData.法人名" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
          <label>提出先識別子:</label>
          <input v-model="testData.提出先識別子" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;" />
          <label>提出先名称:</label>
          <input v-model="testData.提出先名称" @change="saveTestData" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;" />
        </div>
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
          <template v-for="proc in standardProcs" :key="proc.proc_id">
          <tr>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">{{ proc.no }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 12px;">{{ proc.proc_id }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-size: 12px;">{{ proc.expected_state }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-size: 12px;">{{ proc.note }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">
              <span v-if="getResult(proc.proc_id).status === 'done'" style="color: #28a745;">完了</span>
              <span v-else-if="getResult(proc.proc_id).status === 'error'" style="color: #dc3545;">エラー</span>
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
          <tr v-if="getResult(proc.proc_id).status === 'error'">
            <td colspan="8" style="border: 1px solid #dee2e6; padding: 4px 8px; background: #fff5f5; color: #dc3545; font-size: 12px; word-break: break-all; white-space: pre-wrap;">
              {{ getResult(proc.proc_id).error }}
            </td>
          </tr>
          </template>
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
          <template v-for="proc in individualProcs" :key="proc.proc_id">
          <tr>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">{{ proc.no }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 12px;">{{ proc.proc_id }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-size: 12px;">{{ proc.expected_state }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-size: 12px;">{{ proc.note }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">
              <span v-if="getResult(proc.proc_id).status === 'done'" style="color: #28a745;">完了</span>
              <span v-else-if="getResult(proc.proc_id).status === 'error'" style="color: #dc3545;">エラー</span>
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
          <tr v-if="getResult(proc.proc_id).status === 'error'">
            <td colspan="8" style="border: 1px solid #dee2e6; padding: 4px 8px; background: #fff5f5; color: #dc3545; font-size: 12px; word-break: break-all; white-space: pre-wrap;">
              {{ getResult(proc.proc_id).error }}
            </td>
          </tr>
          </template>
        </tbody>
      </table>
    </template>
  </div>
</template>
