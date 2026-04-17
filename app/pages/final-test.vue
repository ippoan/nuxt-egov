<script setup lang="ts">
const BUILD_TIME = '20260415-0430'
import type { EgovClient } from '@ippoan/egov-shinsei-sdk'
import JSZip from 'jszip'
import { TEST_PROCEDURES, PROCS_WITH_DESTINATION, type TestProcedure } from '~/utils/finalTestProcedures'

const { isAuthenticated, startLogin, logout, apiFetch, getClient } = useEgovAuth()
const { pfxLoaded, certSubject, extraPfxCount, loadPfx, loadTestPfx, loadExtraPfx, signKouseiXml, signConfigXml } = useXmlSign()

const useGbizId = ref(false)
const enableSign = ref(true)
const pfxPassword = ref('gpkitest')
const pfxFileInput = ref<HTMLInputElement | null>(null)
const extraPfxInput = ref<HTMLInputElement | null>(null)
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

async function handleLoadExtraPfx() {
  const files = extraPfxInput.value?.files
  if (!files || files.length === 0) return
  for (const file of files) {
    await loadExtraPfx(file, pfxPassword.value)
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
    const isEqual = item.querySelector('char > range > equal') !== null

    // タグ名パターンで値を決定（/区切りの場合は最後のセグメントで判定）
    const lastSeg = tag.includes('/') ? tag.split('/').pop()! : tag
    const fullTag = tag.toLowerCase()
    const t = lastSeg.toLowerCase()
    if (t.includes('年号')) {
      values[tag] = '令和'
    } else if (t.includes('年') && !t.includes('氏名') && !t.includes('名称')) {
      // intDigit>=4 は西暦（在留期間等）、それ以外は和暦
      values[tag] = intDigit >= 4 ? String(now.getFullYear()) : '8'
    } else if (t.includes('月') && !t.includes('氏名') && !t.includes('名称')) {
      values[tag] = String(now.getMonth() + 1)
    } else if (t.includes('日') && !t.includes('氏名') && !t.includes('名称')) {
      values[tag] = String(now.getDate())
    } else if (t.includes('配達局番号')) {
      values[tag] = '100'
    } else if (t.includes('町域番号')) {
      values[tag] = '0014'
    } else if (t.includes('郵便番号') && t.includes('親')) {
      values[tag] = '100'
    } else if (t.includes('郵便番号') && t.includes('子')) {
      values[tag] = '0014'
    } else if (t.includes('市外局番')) {
      values[tag] = '03'
    } else if (t.includes('市内局番')) {
      values[tag] = '1234'
    } else if (t.includes('加入者番号')) {
      values[tag] = '5678'
    } else if ((t.includes('フリガナ') || t.includes('カナ')) && (fullTag.includes('氏名') || t.includes('氏名'))) {
      values[tag] = 'テストタロウ'
    } else if (t.includes('カナ') || t.includes('フリガナ')) {
      values[tag] = 'テストジギョウショ'
    } else if ((t.includes('所在地') || t.includes('住所')) && !t.includes('フリガナ') && !t.includes('カナ')) {
      values[tag] = '東京都千代田区永田町'
    } else if (t.includes('あて先') || t.includes('宛先')) {
      values[tag] = 'テスト宛先'
    } else if (t.includes('概要')) {
      values[tag] = 'テスト事業'
    } else if (t.includes('種類') || t.includes('業種')) {
      values[tag] = 'その他'
    } else if (t.includes('名称') || t.includes('事業所名') || t.includes('事業の名称')) {
      values[tag] = 'テスト事業所'
    } else if (t.includes('氏名')) {
      values[tag] = 'テスト太郎'
    } else if (t.includes('チェックボックス') || t.includes('チェック')) {
      values[tag] = '1'
    } else if (t.includes('記号')) {
      values[tag] = isNum ? '1' : 'ア'
    } else if ((t.includes('賃金') || t.includes('金額') || t.includes('見込額')) && !t.includes('日')) {
      values[tag] = maxLen >= 6 ? '100000' : '1'.repeat(Math.min(maxLen, 5))
    } else if (t.includes('番号') && maxLenEl && isEqual) {
      values[tag] = '1'.repeat(maxLen)
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
  /** デバッグ用: 送信したkousei.xmlの内容 */
  debugKouseiXml?: string
  /** デバッグ用: 送信した申請書XMLの内容 */
  debugApplyXml?: string
}

const appConfig = useAppConfig()
const gitCommit = (appConfig as any).gitCommit || 'dev'

const results = ref<Map<string, ProcedureResult>>(new Map())
const running = ref(false)
const progress = ref(0)
const currentProc = ref('')
const delay = ref(2000)
const showSettings = ref(false)
const errorLog = ref('')

// errorLogをlocalStorageに永続化（消えても復元可能）
watch(errorLog, (v) => { if (v) localStorage.setItem('egov_error_log', v) })

function appendLog(proc: TestProcedure, r: ProcedureResult) {
  const entry: Record<string, unknown> = { no: proc.no, proc_id: proc.proc_id, git: gitCommit, build: BUILD_TIME, status: r.status }
  if (r.arrive_id) entry.arrive_id = r.arrive_id
  if (r.error) try { entry.error = JSON.parse(r.error) } catch { entry.error = r.error }
  if (r.debugKouseiXml) entry.kouseiXml = r.debugKouseiXml
  if (r.debugApplyXml) entry.applyXml = r.debugApplyXml
  errorLog.value = errorLog.value + JSON.stringify(entry, null, 2) + '\n---\n'
}

function copyErrorLog() {
  navigator.clipboard.writeText(errorLog.value)
}

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

// localStorage から結果とテストデータを復元 + テスト証明書自動ロード
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
  const savedLog = localStorage.getItem('egov_error_log')
  if (savedLog) errorLog.value = savedLog
  loadTestPfx()
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

async function submitOne(proc: TestProcedure, clearLog = false) {
  if (clearLog) errorLog.value = ''
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

    // 提出先: Excelで提出先ありの手続のみ設定（不要な手続に入れるとエラー）
    if (PROCS_WITH_DESTINATION.has(proc.proc_id)) {
      const destId = proc.proc_id.startsWith('950A') ? '950API00000000001001001' : '900API00000000001001001'
      kouseiTestValues['提出先識別子'] = destId
      kouseiTestValues['提出先名称'] = '総務省,行政管理局,API'
    }

    const configFiles = skeleton.results.configuration_file_name
    const fi0 = skeleton.results.file_info[0]

    if (proc.format === 'individual' && configFiles.length >= 3) {
      // 個別署名形式: 3つの構成情報XMLをそれぞれ異なるルールで処理
      // configFiles[0] = "kousei.xml" (main, 様式ID=001)
      // configFiles[1] = SignAttach構成情報 (スケルトン 様式ID=001のまま、添付書類署名)
      // configFiles[2] = WriteAppli構成情報 (スケルトン 様式ID=009のまま、申請書作成)

      // --- configFiles[0]: メイン kousei.xml ---
      const mainPath = `${proc.proc_id}/${configFiles[0]}`
      const mainFile = zip.file(mainPath)
      if (mainFile) {
        let xml = await mainFile.async('string')
        console.log(`[${proc.proc_id}] main kousei.xml (before):`, xml.substring(0, 3000))
        // kouseiTestValues を適用（個人情報 + 新規申請）
        for (const [tag, value] of Object.entries(kouseiTestValues)) {
          xml = xml.replace(new RegExp(`<${tag}/>`, 'g'), `<${tag}>${value}</${tag}>`)
          xml = xml.replace(new RegExp(`<${tag}></${tag}>`, 'g'), `<${tag}>${value}</${tag}>`)
        }
        // 添付書類属性情報: 4 件 (apply + config[1] + config[2] + dummy) — 仕様準拠
        if (fi0) {
          let attachBlocks = ''
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>${fi0.form_name}</添付書類名称><添付書類ファイル名称>${fi0.apply_file_name}</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>添付書類署名構成情報</添付書類名称><添付書類ファイル名称>${configFiles[1]}</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>申請書作成構成情報</添付書類名称><添付書類ファイル名称>${configFiles[2]}</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>添付書類署名ファイル１</添付書類名称><添付書類ファイル名称>dummy.txt</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          xml = xml.replace('</管理情報>', '</管理情報>' + attachBlocks)
        }
        // 申請書属性情報は入れない (個別形式 仕様 No.119)
        zip.file(mainPath, xml)
      }

      // --- configFiles[1]: SignAttach（添付書類署名、様式ID=001のまま） ---
      const signAttachPath = `${proc.proc_id}/${configFiles[1]}`
      const signAttachFile = zip.file(signAttachPath)
      if (signAttachFile) {
        let xml = await signAttachFile.async('string')
        console.log(`[${proc.proc_id}] SignAttach (before):`, xml.substring(0, 3000))
        // 最小限のフィールドのみ: 受付行政機関ID, 手続ID, 手続名称, 申請種別
        const signAttachValues: Record<string, string> = {
          受付行政機関ID: '100' + proc.proc_id.substring(0, 3),
          手続ID: proc.proc_id,
          手続名称: proc.name,
          申請種別: '添付書類署名',
        }
        for (const [tag, value] of Object.entries(signAttachValues)) {
          xml = xml.replace(new RegExp(`<${tag}/>`, 'g'), `<${tag}>${value}</${tag}>`)
          xml = xml.replace(new RegExp(`<${tag}></${tag}>`, 'g'), `<${tag}>${value}</${tag}>`)
        }
        // 添付書類属性情報: apply + dummy (v6で確認: apply無しだと「添付必須」エラー) — 仕様 No.48
        if (!xml.includes('<添付書類属性情報>') && fi0) {
          let attachBlocks = ''
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>${fi0.form_name}</添付書類名称><添付書類ファイル名称>${fi0.apply_file_name}</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>添付書類署名ファイル１</添付書類名称><添付書類ファイル名称>dummy.txt</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          xml = xml.replace('</管理情報>', '</管理情報>' + attachBlocks)
        }
        // 申請書属性情報は入れない（添付書類に対する署名の場合は省略）
        zip.file(signAttachPath, xml)
      }

      // --- configFiles[2]: WriteAppli（申請書作成、様式ID=009のまま） ---
      const writeAppliPath = `${proc.proc_id}/${configFiles[2]}`
      const writeAppliFile = zip.file(writeAppliPath)
      if (writeAppliFile) {
        let xml = await writeAppliFile.async('string')
        console.log(`[${proc.proc_id}] WriteAppli (before):`, xml.substring(0, 3000))
        // 最小限のフィールドのみ: 受付行政機関ID, 手続ID, 手続名称, 申請種別
        const writeAppliValues: Record<string, string> = {
          受付行政機関ID: '100' + proc.proc_id.substring(0, 3),
          手続ID: proc.proc_id,
          手続名称: proc.name,
          申請種別: '申請書作成',
        }
        for (const [tag, value] of Object.entries(writeAppliValues)) {
          xml = xml.replace(new RegExp(`<${tag}/>`, 'g'), `<${tag}>${value}</${tag}>`)
          xml = xml.replace(new RegExp(`<${tag}></${tag}>`, 'g'), `<${tag}>${value}</${tag}>`)
        }
        // WriteAppli: 申請書属性情報 値あり (仕様 No.119 必須)
        if (!xml.includes('<申請書属性情報>') && fi0) {
          const shinseishoBlock = `<申請書属性情報><申請書様式ID>${fi0.form_id}</申請書様式ID><申請書様式バージョン>${String(fi0.form_version).padStart(4, '0')}</申請書様式バージョン><申請書様式名称>${fi0.form_name}</申請書様式名称><申請書ファイル名称>${fi0.apply_file_name}</申請書ファイル名称></申請書属性情報>`
          xml = xml.replace('</構成情報>', shinseishoBlock + '</構成情報>')
        }
        zip.file(writeAppliPath, xml)
      }
      // ダミー添付ファイルをZIPに追加（添付書類署名対象）
      zip.file(`${proc.proc_id}/dummy.txt`, 'test')
    } else {
      // 標準形式: 既存ロジック（全configFileに同じkouseiTestValuesを適用）
      for (const configFileName of configFiles) {
        const kouseiPath = `${proc.proc_id}/${configFileName}`
        const kouseiFile = zip.file(kouseiPath)
        if (kouseiFile) {
          let xml = await kouseiFile.async('string')
          console.log(`[${proc.proc_id}] kousei.xml (before):`, xml.substring(0, 3000))
          for (const [tag, value] of Object.entries(kouseiTestValues)) {
            xml = xml.replace(new RegExp(`<${tag}/>`, 'g'), `<${tag}>${value}</${tag}>`)
            xml = xml.replace(new RegExp(`<${tag}></${tag}>`, 'g'), `<${tag}>${value}</${tag}>`)
          }
          // 添付書類属性情報: スケルトンに既にある場合のみ値を埋める
          if (xml.includes('<添付書類属性情報>')) {
            xml = xml.replace(/<添付種別\/>/g, '<添付種別>添付</添付種別>')
            const dummyFileName = 'dummy.txt'
            xml = xml.replace(/<添付書類ファイル名称\/>/g, `<添付書類ファイル名称>${dummyFileName}</添付書類ファイル名称>`)
            xml = xml.replace(/<提出情報\/>/g, '<提出情報>1</提出情報>')
            zip.file(`${proc.proc_id}/${dummyFileName}`, 'test')
          }
          // 添付書類属性情報がスケルトンに無い場合: 提出先ありかつ電子送達でない手続のみ追加
          if (!xml.includes('<添付書類属性情報>') && PROCS_WITH_DESTINATION.has(proc.proc_id) && proc.proc_id !== '900A013800001000') {
            const dummyFileName = 'dummy.txt'
            const attachBlock = `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>テスト添付書類１</添付書類名称><添付書類ファイル名称>${dummyFileName}</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
            xml = xml.replace('</提出先情報>', '</提出先情報>' + attachBlock)
            zip.file(`${proc.proc_id}/${dummyFileName}`, 'test')
          }
          // 標準形式: 申請書属性情報をkousei.xmlに挿入
          if (!xml.includes('<申請書属性情報>') && fi0) {
            const shinseishoBlock = `\n\t\t\t\t<申請書属性情報>\n\t\t\t\t\t<申請書様式ID>${fi0.form_id}</申請書様式ID>\n\t\t\t\t\t<申請書様式バージョン>${String(fi0.form_version).padStart(4, '0')}</申請書様式バージョン>\n\t\t\t\t\t<申請書様式名称>${fi0.form_name}</申請書様式名称>\n\t\t\t\t\t<申請書ファイル名称>${fi0.apply_file_name}</申請書ファイル名称>\n\t\t\t\t</申請書属性情報>`
            xml = xml.replace('</構成情報>', shinseishoBlock + '\n\t\t\t\t</構成情報>')
          }
          // 空タグはそのまま残す（不要な値を入れない）
          zip.file(kouseiPath, xml)
        }
      }

      // 納付方法が必要な手続（手数料納付が期待状態に含まれる場合）
      if (proc.expected_state.includes('手数料納付')) {
        const mainKouseiPath = `${proc.proc_id}/${configFiles[0]}`
        const mainKouseiFile = zip.file(mainKouseiPath)
        if (mainKouseiFile) {
          let mainXml = await mainKouseiFile.async('string')
          if (!mainXml.includes('<納付関連情報>')) {
            mainXml = mainXml.replace('<法人番号>', '<納付関連情報><納付方法>1</納付方法><振込者氏名カナ>テストタロウ</振込者氏名カナ></納付関連情報>\n\t\t\t\t\t<法人番号>')
            zip.file(mainKouseiPath, mainXml)
          }
        }
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
          // XMLタグに属性（DispName等）が付いている場合にも対応、自己閉じタグも対応
          // 既に値が入っているタグも上書き（スケルトンのプリセット値がカタカナ制約等に違反する場合がある）
          applyXml = applyXml.replace(new RegExp(`<${actualTag}(\\s[^>]*)?>([^<]*)</${actualTag}>`, 'g'), (m, attrs) => `<${actualTag}${attrs || ''}>${value}</${actualTag}>`)
          applyXml = applyXml.replace(new RegExp(`<${actualTag}(\\s[^>]*)?\\/>`, 'g'), (m, attrs) => `<${actualTag}${attrs || ''}>${value}</${actualTag}>`)
        }
        // 年/月/日はネスト構造で複数存在するため、buildTestValuesでは1回しか置換されない
        // 残った空の年月日タグを全て埋める（空タグ + 自己閉じタグ両対応）
        const now = new Date()
        applyXml = applyXml.replace(/<年号(\s[^>]*)?>(\s*)<\/年号>/g, (m, a) => `<年号${a || ''}>令和</年号>`)
        applyXml = applyXml.replace(/<年号(\s[^>]*)?\/>(?!<\/)/g, (m, a) => `<年号${a || ''}>令和</年号>`)
        applyXml = applyXml.replace(/<年(\s[^>]*)?>(\s*)<\/年>/g, (m, a) => `<年${a || ''}>8</年>`)
        applyXml = applyXml.replace(/<年(\s[^>]*)?\/>(?!<\/)/g, (m, a) => `<年${a || ''}>8</年>`)
        applyXml = applyXml.replace(/<月(\s[^>]*)?>(\s*)<\/月>/g, (m, a) => `<月${a || ''}>${now.getMonth() + 1}</月>`)
        applyXml = applyXml.replace(/<月(\s[^>]*)?\/>(?!<\/)/g, (m, a) => `<月${a || ''}>${now.getMonth() + 1}</月>`)
        applyXml = applyXml.replace(/<日(\s[^>]*)?>(\s*)<\/日>/g, (m, a) => `<日${a || ''}>${now.getDate()}</日>`)
        applyXml = applyXml.replace(/<日(\s[^>]*)?\/>(?!<\/)/g, (m, a) => `<日${a || ''}>${now.getDate()}</日>`)
        // 在留期間は非必須だが年月日が入ると日付チェックされる → 西暦4桁に修正
        applyXml = applyXml.replace(/<在留期間>([\s\S]*?)<\/在留期間>/g, (m) => m.replace(/<年([^>]*)>8<\/年>/, `<年$1>${now.getFullYear()}</年>`))
        // check.xmlにomitDisabledがない必須フィールドのフォールバック: 残り空タグをタグ名パターンで埋める
        let fallbackCount = 0
        applyXml = applyXml.replace(/<([^\s/>]+)(\s[^>]*)?>(\s*)<\/\1>/g, (m, tag, attrs, content) => {
          if (content.trim()) return m // 既に値がある
          const t = tag.toLowerCase()
          let val = ''
          if (t.includes('scriptcheck')) val = '1'
          else if (t.includes('配達局番号')) val = '100'
          else if (t.includes('町域番号')) val = '0014'
          else if (t.includes('市外局番')) val = '03'
          else if (t.includes('市内局番')) val = '1234'
          else if (t.includes('加入者番号')) val = '5678'
          else if (t.includes('カナ住所') || t.includes('住所カナ')) val = 'トウキョウト'
          else if (t.includes('カナ名称') || t.includes('名称カナ')) val = 'テスト'
          else if (t.includes('漢字住所')) val = '東京都千代田区永田町'
          else if (t.includes('漢字名称')) val = 'テスト事業所'
          else if (t.includes('所在地') || (t.includes('住所') && !t.includes('届') && !t.includes('変更'))) val = '東京都千代田区永田町'
          else if (t.includes('名称') || t.includes('事業所名')) val = 'テスト事業所'
          else if (t.includes('氏名')) val = 'テスト太郎'
          else if (t.includes('見込額') || t.includes('賃金')) val = '100000'
          else if (t.includes('チェックボックス') || t.includes('チェック')) val = '1'
          if (!val) return m
          fallbackCount++
          return `<${tag}${attrs || ''}>${val}</${tag}>`
        })
        // ポストプロセス: スケルトンにプリセットされた値の文字種修正
        // カタカナ/フリガナフィールドに漢字が入っている場合はカタカナに置換
        applyXml = applyXml.replace(/<([^<>]*(?:カタカナ|フリガナ)[^<>]*)>([^<]+)<\/\1>/g, (m, tag, val) => {
          // 既にカタカナのみなら何もしない
          if (/^[\u30A0-\u30FF\u3000\s]+$/.test(val)) return m
          // 漢字/ひらがな混じりの場合はタグ名に基づいてカタカナ値を設定
          const t = tag.toLowerCase()
          if (t.includes('氏名')) return `<${tag}>テストタロウ</${tag}>`
          if (t.includes('所在地') || t.includes('住所')) return `<${tag}>トウキョウトチヨダクナガタチョウ</${tag}>`
          return `<${tag}>テストジギョウショ</${tag}>`
        })
        // 賃金関連フィールド: 桁数制限（maxLen不明だが6桁超はエラーなので1桁に）
        applyXml = applyXml.replace(/<(賃金締切日|賃金支払日当翌|賃金支払日)>(\d{4,})<\/\1>/g, '<$1>1</$1>')
        console.log(`[${proc.proc_id}] apply filled ${Object.keys(testValues).length} fields + ${fallbackCount} fallback`)
        zip.file(applyPath, applyXml)
      }
    }

    // 署名を付与（署名ON + PFX読込済み + 手続が署名必要な場合のみ）
    if (enableSign.value && pfxLoaded.value && proc.signatureRequired) {
      if (proc.format === 'individual' && configFiles.length >= 3) {
        // 個別署名形式: Main kousei.xml は署名不要（構成管理XMLに署名値が存在しない仕様）
        // WriteAppli / SignAttach のみ署名

        // --- configFiles[1] = SignAttach: dummy.txt を参照して署名 ---
        const saSignPath = `${proc.proc_id}/${configFiles[1]}`
        const saSignFile = zip.file(saSignPath)
        if (saSignFile) {
          let saXml = await saSignFile.async('string')
          const dummyFile = zip.file(`${proc.proc_id}/dummy.txt`)
          if (dummyFile) {
            const dummyContent = await dummyFile.async('string')
            currentProc.value = `${proc.no}. SignAttach署名付与中...`
            saXml = signConfigXml(saXml, 'dummy.txt', dummyContent)
            console.log(`[${proc.proc_id}] SignAttach (signed):`, saXml.substring(0, 3000))
            zip.file(saSignPath, saXml)
          }
        }

        // --- configFiles[2] = WriteAppli: 申請書ファイルを参照して署名 ---
        const waSignPath = `${proc.proc_id}/${configFiles[2]}`
        const waSignFile = zip.file(waSignPath)
        if (waSignFile && fi0) {
          let waXml = await waSignFile.async('string')
          const applyFile = zip.file(`${proc.proc_id}/${fi0.apply_file_name}`)
          if (applyFile) {
            const applyContent = await applyFile.async('string')
            currentProc.value = `${proc.no}. WriteAppli署名付与中...`
            waXml = signConfigXml(waXml, fi0.apply_file_name, applyContent)
            console.log(`[${proc.proc_id}] WriteAppli (signed):`, waXml.substring(0, 3000))
            zip.file(waSignPath, waXml)
          }
        }
      } else {
        // 標準形式: 既存の統一署名ロジック
        for (const configFileName of skeleton.results.configuration_file_name) {
          const kouseiPath = `${proc.proc_id}/${configFileName}`
          const kouseiFile = zip.file(kouseiPath)
          if (kouseiFile) {
            let kouseiXml = await kouseiFile.async('string')
            const appFiles = new Map<string, string | Uint8Array>()
            for (const fi of skeleton.results.file_info) {
              const appPath = `${proc.proc_id}/${fi.apply_file_name}`
              const appFile = zip.file(appPath)
              if (appFile) {
                appFiles.set(fi.apply_file_name, await appFile.async('string'))
              }
            }
            currentProc.value = `${proc.no}. 署名付与中...`
            kouseiXml = signKouseiXml(kouseiXml, appFiles, proc.signatureCount)
            console.log(`[${proc.proc_id}] kousei.xml (signed):`, kouseiXml.substring(0, 3000))
            zip.file(kouseiPath, kouseiXml)
          }
        }
      }
    }

    // デバッグ: 送信するXMLを保存
    const mainKousei = zip.file(`${proc.proc_id}/${configFiles[0]}`)
    if (mainKousei) r.debugKouseiXml = await mainKousei.async('string')
    const mainApply = zip.file(`${proc.proc_id}/${skeleton.results.file_info[0]?.apply_file_name}`)
    if (mainApply) r.debugApplyXml = await mainApply.async('string')

    const newZipBase64 = await zip.generateAsync({ type: 'base64' })

    // 3. 申請送信
    r.status = 'submitting'
    currentProc.value = `${proc.no}. 申請送信中...`
    const submitHeaders: Record<string, string> = {
      Authorization: `Bearer ${useEgovAuth().accessToken.value}`,
    }
    // GビズIDモード: 署名不要で本番送信（署名省略可の手続は署名なしで成功）
    // 署名モード: 署名必要手続のみ本番送信
    // それ以外: Trial送信
    const useRealSubmit = useGbizId.value || (enableSign.value && proc.signatureRequired)
    if (!useRealSubmit) {
      submitHeaders['X-eGovAPI-Trial'] = 'true'
    }

    // 電子送達手続は /post-apply エンドポイントを使用
    const applyEndpoint = proc.proc_id === '900A013800001000' ? '/api/egov/post-apply' : '/api/egov/apply'
    const applyResult = await $fetch<{ results: { arrive_id: string } }>(applyEndpoint, {
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
  appendLog(proc, r)
  saveResults()
}

function copyResult(proc: TestProcedure) {
  const r = getResult(proc.proc_id)
  const data: Record<string, unknown> = { no: proc.no, proc_id: proc.proc_id, name: proc.name, format: proc.format, status: r.status, arrive_id: r.arrive_id, git: gitCommit }
  if (r.error) try { data.error = JSON.parse(r.error) } catch { data.error = r.error }
  if (r.debugKouseiXml) data.kouseiXml = r.debugKouseiXml
  if (r.debugApplyXml) data.applyXml = r.debugApplyXml
  const entry = JSON.stringify(data, null, 2)
  errorLog.value = entry + '\n---\n' + errorLog.value
}

async function runAll() {
  running.value = true
  progress.value = 0
  errorLog.value = ''

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

// Excel 貼付用: 各セルにシングルクォート prefix を付けて文字列扱いにし、精度落ちを防ぐ
// TSV (タブ区切り) で 送信番号\t到達番号 の順 (エクセル最終確認試験用データ情報のデータ1 列順)
async function copyStandardForExcel() {
  const lines: string[] = []
  for (const proc of standardProcs) {
    const r = getResult(proc.proc_id)
    const send = r.send_number ?? ''
    const arrive = r.arrive_id ?? ''
    lines.push(`'${send}\t'${arrive}`)
  }
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    currentProc.value = `標準形式 ${standardProcs.length}件を TSV でコピー (送信番号\\t到達番号、'prefix付)`
  }
  catch (e) {
    alert('クリップボードコピーに失敗しました: ' + (e instanceof Error ? e.message : e))
  }
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

// ============================================================
// テストデータ準備 (TID_202604130039 spec/final_confirmation_test_data.json 出力)
// ============================================================

interface SpecSlot { 送信番号: string; 到達番号: string }
interface SpecTestDataEntry {
  format: 'standard' | 'individual'
  proc_id: string
  proc_name: string
  data_state: string
  status: string
  remarks: string
  slots: { '1': SpecSlot; '2': SpecSlot; '3': SpecSlot }
  updatedAt: string | null
}

const TEST_PROCEDURE_MAP = new Map(TEST_PROCEDURES.map(p => [p.proc_id, p]))
const specEntries = ref<SpecTestDataEntry[]>([])
const specResultPath = ref('')
const specRunning = ref(false)
const specProgress = ref(0)
const specCurrent = ref('')

async function loadSpecData() {
  const res = await $fetch<{ entries: SpecTestDataEntry[]; resultPath: string }>('/api/spec-test-data')
  specEntries.value = res.entries
  specResultPath.value = res.resultPath
}

async function postSpecUpdate(proc_id: string, slot: 1 | 2 | 3, patch: Partial<SpecSlot>) {
  await $fetch('/api/spec-test-data', { method: 'POST', body: { proc_id, slot, ...patch } })
}

async function submitSpecSlot1(entry: SpecTestDataEntry) {
  const proc = TEST_PROCEDURE_MAP.get(entry.proc_id)
  if (!proc) {
    specCurrent.value = `proc_id ${entry.proc_id} が TEST_PROCEDURES に無い`
    return
  }
  await submitOne(proc)
  const r = results.value.get(proc.proc_id)
  if (r?.status === 'done' && r.arrive_id) {
    await postSpecUpdate(entry.proc_id, 1, { 到達番号: r.arrive_id })
    entry.slots['1'].到達番号 = r.arrive_id
    entry.updatedAt = new Date().toISOString()
    specEntries.value = [...specEntries.value]
  }
}

async function submitAllSpecSlot1() {
  if (!confirm(`データ1 が未取得の手続について申請送信します。\n${specEntries.value.filter(e => !e.slots['1'].到達番号).length} 件。続行しますか？`)) return
  specRunning.value = true
  specProgress.value = 0
  const pending = specEntries.value.filter(e => !e.slots['1'].到達番号)
  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i]!
    specCurrent.value = `${i + 1}/${pending.length} ${entry.proc_id} 送信中...`
    await submitSpecSlot1(entry)
    specProgress.value = Math.round(((i + 1) / pending.length) * 100)
    if (i < pending.length - 1) await new Promise(r => setTimeout(r, delay.value))
  }
  await loadSpecData()
  specRunning.value = false
  specCurrent.value = 'データ1 送信完了'
}

async function submitBulkForSlot1(entry: SpecTestDataEntry) {
  const proc = TEST_PROCEDURE_MAP.get(entry.proc_id)
  if (!proc) {
    specCurrent.value = `proc_id ${entry.proc_id} が TEST_PROCEDURES に無い`
    return
  }
  // skeleton ZIP を取得 → そのまま /bulk-apply に送る (Trial)
  const skeleton = await apiFetch<{ results: { file_data: string } }>(`/procedure/${proc.proc_id}`)
  const bulkRes = await $fetch<{ results: { send_number: string } }>('/api/egov/bulk-apply', {
    method: 'POST',
    body: { send_file: { file_name: `${proc.proc_id}-bulk.zip`, file_data: skeleton.results.file_data } },
    headers: {
      Authorization: `Bearer ${useEgovAuth().accessToken.value}`,
      'x-egovapi-trial': 'true',
    },
  })
  const sn = bulkRes.results?.send_number
  if (sn) {
    await postSpecUpdate(entry.proc_id, 1, { 送信番号: sn })
    entry.slots['1'].送信番号 = sn
    entry.updatedAt = new Date().toISOString()
    specEntries.value = [...specEntries.value]
  }
}

async function submitAllBulkSpecSlot1() {
  const pending = specEntries.value.filter(e => !e.slots['1'].送信番号)
  if (!confirm(`送信番号が未取得の手続について bulk送信 (Trial) します。\n${pending.length} 件。続行しますか？`)) return
  specRunning.value = true
  specProgress.value = 0
  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i]!
    specCurrent.value = `${i + 1}/${pending.length} ${entry.proc_id} bulk送信中...`
    try {
      await submitBulkForSlot1(entry)
    } catch (e: unknown) {
      const err = e as { data?: unknown; message?: string }
      specCurrent.value = `${entry.proc_id} bulk失敗: ${err.message ?? String(e)}`
    }
    specProgress.value = Math.round(((i + 1) / pending.length) * 100)
    if (i < pending.length - 1) await new Promise(r => setTimeout(r, delay.value))
  }
  await loadSpecData()
  specRunning.value = false
  specCurrent.value = `bulk送信完了: ${pending.length} 件`
}

onMounted(() => { loadSpecData().catch(() => {}) })

// ============================================================
// 照会テスト (13-1 〜 31-1)
// ============================================================

interface InquiryTestItem {
  test_no: string
  api_name: string
  category: string
  needsPreparedData?: boolean
  needsGbizId?: boolean
}

const INQUIRY_TESTS: InquiryTestItem[] = [
  { test_no: '01-1', api_name: 'ユーザー認可', category: '認証・認可' },
  { test_no: '02-1', api_name: 'アクセストークン取得', category: '認証・認可' },
  { test_no: '03-1', api_name: 'アクセストークン再取得', category: '認証・認可' },
  { test_no: '04-1', api_name: 'アクセストークン検証', category: '認証・認可' },
  { test_no: '04-2', api_name: 'アクセストークン検証（リフレッシュ）', category: '認証・認可' },
  { test_no: '05-1', api_name: '手続選択', category: '申請書作成' },
  { test_no: '06-1', api_name: 'プレ印字データ取得', category: '申請書作成' },
  { test_no: '07-1', api_name: '申請データ送信（添付なし）', category: '申請書作成' },
  { test_no: '07-2', api_name: '申請データ送信（添付あり）', category: '申請書作成' },
  { test_no: '08-1', api_name: '申請データbulk送信（正常）', category: '申請書作成' },
  { test_no: '08-2', api_name: '申請データbulk送信（エラー）', category: '申請書作成' },
  { test_no: '09-1', api_name: '申請データ送信（再提出）', category: '申請書作成', needsPreparedData: true },
  { test_no: '10-1', api_name: '補正データ送信', category: '申請書作成', needsPreparedData: true },
  { test_no: '11-1', api_name: '取下げ依頼送信', category: '申請書作成' },
  { test_no: '12-1', api_name: '形式チェック実行（正常）', category: '申請データチェック' },
  { test_no: '12-2', api_name: '形式チェック実行（エラー）', category: '申請データチェック' },
  { test_no: '13-1', api_name: '申請案件一覧取得（送信番号）', category: '申請案件取得' },
  { test_no: '13-2', api_name: '申請案件一覧取得（期間指定）', category: '申請案件取得' },
  { test_no: '14-1', api_name: '申請案件取得', category: '申請案件取得' },
  { test_no: '15-1', api_name: 'エラーレポート取得（送信番号）', category: '申請案件取得' },
  { test_no: '15-2', api_name: 'エラーレポート取得（期間指定）', category: '申請案件取得' },
  { test_no: '16-1', api_name: '手続に関するご案内一覧取得', category: 'お知らせ' },
  { test_no: '17-1', api_name: '手続に関するご案内取得', category: 'お知らせ' },
  { test_no: '18-1', api_name: '申請案件に関する通知一覧取得', category: 'お知らせ' },
  { test_no: '18-2', api_name: '申請案件に関する通知取得', category: 'お知らせ' },
  { test_no: '19-1', api_name: '公文書取得', category: '公文書', needsPreparedData: true },
  { test_no: '20-1', api_name: '公文書取得完了', category: '公文書', needsPreparedData: true },
  { test_no: '21-1', api_name: '公文書署名検証要求', category: '公文書', needsPreparedData: true },
  { test_no: '22-1', api_name: '国庫金電子納付取扱金融機関一覧取得', category: '電子納付' },
  { test_no: '23-1', api_name: '電子納付情報一覧取得', category: '電子納付' },
  { test_no: '24-1', api_name: '電子納付金融機関サイト表示', category: '電子納付' },
  { test_no: '25-1', api_name: 'ログアウト', category: '認証・認可' },
  { test_no: '26-1', api_name: 'アクセストークン検証（ログアウト後）', category: '認証・認可' },
  { test_no: '27-1', api_name: '電子送達利用申込み', category: '電子送達' },
  { test_no: '28-1', api_name: '電子送達状況確認', category: '電子送達' },
  { test_no: '29-1', api_name: '電子送達一覧取得', category: '電子送達' },
  { test_no: '30-1', api_name: '電子送達取得', category: '電子送達' },
  { test_no: '31-1', api_name: '電子送達取得完了', category: '電子送達' },
  { test_no: '32-1', api_name: '情報共有設定', category: 'アカウント間情報共有', needsGbizId: true },
  { test_no: '33-1', api_name: '情報共有更新', category: 'アカウント間情報共有', needsGbizId: true },
  { test_no: '34-1', api_name: '情報共有解除', category: 'アカウント間情報共有', needsGbizId: true },
  { test_no: '35-1', api_name: '情報共有確認', category: 'アカウント間情報共有', needsGbizId: true },
  { test_no: '36-1', api_name: '情報共有一覧取得', category: 'アカウント間情報共有', needsGbizId: true },
]

interface InquiryResult {
  test_no: string
  status: 'pending' | 'running' | 'pass' | 'error' | 'skip'
  response?: string
  error?: string
  durationMs?: number
}

const inquiryResults = ref<Map<string, InquiryResult>>(new Map())
const inquiryRunning = ref(false)
const inquiryProgress = ref(0)

// 照会テスト用の中間データ
// 優先順位: ブラウザ実行中に生成 > localStorage 保存分 > SDK テスト結果
const inquiryState = reactive<Record<string, string>>({})
// 最終確認試験用データ情報 (手続→テストデータマッピング)
const testDataItems = ref<Array<{ proc_id: string; data_state: string; remarks: string; format: string }>>([])

/** テストデータから条件に合う手続IDを探す */
function findTestProc(condition: string): string | undefined {
  return testDataItems.value.find(t => t.data_state.includes(condition))?.proc_id
}

// localStorage から復元
onMounted(async () => {
  const saved = localStorage.getItem('egov_inquiry_results')
  if (saved) {
    const arr: InquiryResult[] = JSON.parse(saved)
    arr.forEach(r => inquiryResults.value.set(r.test_no, r))
  }
  // 1. localStorage の保存分をまず読む
  const savedState = localStorage.getItem('egov_inquiry_state')
  if (savedState) Object.assign(inquiryState, JSON.parse(savedState))
  // 2. SDK テスト結果で上書き（SDK の方が信頼性が高い）
  try {
    const sdk = await $fetch<{ state: Record<string, string>; testData: any[] }>('/api/sdk-state')
    Object.assign(inquiryState, sdk.state)
    testDataItems.value = sdk.testData
  } catch { /* SDK state なくても動く */ }
  preparedArriveId.value = localStorage.getItem('egov_prepared_arrive_id') ?? ''
  preparedNoticeSubId.value = localStorage.getItem('egov_prepared_notice_sub_id') ?? ''
  postArriveId.value = localStorage.getItem('egov_post_arrive_id') ?? ''
  postId.value = localStorage.getItem('egov_post_id') ?? ''
  paymentArriveId.value = localStorage.getItem('egov_payment_arrive_id') ?? ''
})

function saveInquiryResults() {
  localStorage.setItem('egov_inquiry_results', JSON.stringify([...inquiryResults.value.values()]))
  localStorage.setItem('egov_inquiry_state', JSON.stringify(inquiryState))
}

function getInquiryResult(testNo: string): InquiryResult {
  return inquiryResults.value.get(testNo) ?? { test_no: testNo, status: 'pending' }
}

// 公文書DL用の到達番号・通知通番入力
const preparedArriveId = ref('')
const preparedNoticeSubId = ref('')
const postArriveId = ref('')
const postId = ref('')
const paymentArriveId = ref('')

function savePreparedIds() {
  localStorage.setItem('egov_prepared_arrive_id', preparedArriveId.value)
  localStorage.setItem('egov_prepared_notice_sub_id', preparedNoticeSubId.value)
  localStorage.setItem('egov_post_arrive_id', postArriveId.value)
  localStorage.setItem('egov_post_id', postId.value)
  localStorage.setItem('egov_payment_arrive_id', paymentArriveId.value)
}

const today = new Date().toISOString().slice(0, 10)

async function runInquiryTest(item: InquiryTestItem) {
  const r: InquiryResult = { test_no: item.test_no, status: 'running' }
  inquiryResults.value.set(item.test_no, r)
  const client = getClient()
  const start = Date.now()

  // ※最終確認試験用データ情報を参照 — e-Gov から送付されるテストデータ必須のためskip
  if (item.needsPreparedData) {
    r.status = 'skip'
    r.response = '※最終確認試験用データ情報を参照（e-Govから送付される到達番号/通知通番が必要）'
    r.durationMs = 0
    inquiryResults.value.set(item.test_no, { ...r })
    saveInquiryResults()
    return
  }

  try {
    switch (item.test_no) {
      // 認証・認可 (01-1 〜 04-2): ログイン済みなら自動pass
      case '01-1': {
        if (!isAuthenticated.value) throw new Error('未ログイン')
        r.response = 'ログイン済み（OAuth認可完了）'
        break
      }
      case '02-1': {
        if (!isAuthenticated.value) throw new Error('未ログイン')
        r.response = 'トークン取得済み'
        break
      }
      case '03-1': {
        // composable 経由でリフレッシュ（最新の refreshToken を使う、1回で済ませる）
        await useEgovAuth().refreshAccessToken()
        // リフレッシュ後の新トークンを保存（04-1, 04-2 で使用）
        const saved03 = JSON.parse(localStorage.getItem('egov_tokens') || '{}')
        if (!saved03.accessToken) throw new Error('リフレッシュ失敗。再ログインしてください。')
        inquiryState.newAccessToken = saved03.accessToken
        inquiryState.newRefreshToken = saved03.refreshToken
        r.response = `新トークン取得成功`
        break
      }
      case '04-1': {
        // 03-1 で取得した新アクセストークンを検証
        const token04 = inquiryState.newAccessToken || useEgovAuth().accessToken.value
        if (!token04) throw new Error('アクセストークンなし')
        const res = await $fetch<{ active: boolean }>('/api/egov/introspect', {
          method: 'POST',
          body: { token: token04, token_type_hint: 'access_token' },
        })
        r.response = `active=${res.active}`
        break
      }
      case '04-2': {
        // 03-1 で取得した新リフレッシュトークンを検証
        const rt04 = inquiryState.newRefreshToken || JSON.parse(localStorage.getItem('egov_tokens') || '{}').refreshToken
        if (!rt04) throw new Error('リフレッシュトークンなし')
        const res = await $fetch<{ active: boolean }>('/api/egov/introspect', {
          method: 'POST',
          body: { token: rt04, token_type_hint: 'refresh_token' },
        })
        r.response = `active=${res.active}`
        break
      }
      // 申請書作成 (05-1 〜 12-2): 既存submitOneを活用
      case '05-1': {
        const proc = TEST_PROCEDURES.find(p => p.proc_id === '950A010700005000')
        if (!proc) throw new Error('手続 950A010700005000 not found')
        const skeleton = await apiFetch<{ results: { file_data: string } }>(`/procedure/${proc.proc_id}`)
        r.response = `スケルトン取得成功 (${Math.round(skeleton.results.file_data.length / 1024)}KB)`
        break
      }
      case '06-1': {
        // まずスケルトン取得 → 申請書XMLをBase64で渡す
        const preprintProcId = '900A102800072000'
        const skeleton = await apiFetch<{ results: { file_data: string; file_info: Array<{ form_id: string; form_version: number; apply_file_name: string }> } }>(`/procedure/${preprintProcId}`)
        const fi = skeleton.results.file_info[0]!
        const zipData = Uint8Array.from(atob(skeleton.results.file_data), c => c.charCodeAt(0))
        const zip = await JSZip.loadAsync(zipData)
        const applyFile = zip.file(`${preprintProcId}/${fi.apply_file_name}`)
        const applyXml = applyFile ? await applyFile.async('base64') : ''
        const res = await client.getPreprint({
          proc_id: preprintProcId,
          form_id: fi.form_id,
          form_version: fi.form_version,
          file_data: applyXml,
          application_info: [
            { label: '労働保険番号', value: '12345678901234' },
            { label: 'アクセスコード', value: '0000000000' },
          ],
        })
        r.response = 'プレ印字取得成功'
        break
      }
      case '07-1': {
        // 申請データ送信（添付なし）— 既存 submitOne を利用
        const proc071 = TEST_PROCEDURES.find(p => p.proc_id === '950A010700005000')
        if (!proc071) throw new Error('手続 950A010700005000 not found')
        await submitOne(proc071)
        const res071 = results.value.get(proc071.proc_id)
        if (res071?.status === 'done') {
          inquiryState.arriveId_07_1 = res071.arrive_id!
          r.response = `arrive_id=${res071.arrive_id}`
        } else {
          throw new Error(res071?.error ?? '申請送信失敗')
        }
        break
      }
      case '07-2': {
        // 申請データ送信（添付あり）
        const proc072 = TEST_PROCEDURES.find(p => p.proc_id === '950A010700006000')
        if (!proc072) throw new Error('手続 950A010700006000 not found')
        await submitOne(proc072)
        const res072 = results.value.get(proc072.proc_id)
        if (res072?.status === 'done') {
          inquiryState.arriveId_07_2 = res072.arrive_id!
          r.response = `arrive_id=${res072.arrive_id}`
        } else {
          throw new Error(res072?.error ?? '申請送信失敗')
        }
        break
      }
      case '08-1': {
        // bulk送信（正常）— 2件分のZIPをまとめて送信
        const proc081 = TEST_PROCEDURES.find(p => p.proc_id === '950A010700005000')
        if (!proc081) throw new Error('手続 not found')
        const skeleton081 = await apiFetch<{ results: { file_data: string; configuration_file_name: string[]; file_info: Array<{ form_id: string; form_version: number; form_name: string; apply_file_name: string }> } }>(`/procedure/${proc081.proc_id}`)
        // ZIP構築（簡易版 — Trial送信）
        const zipData081 = Uint8Array.from(atob(skeleton081.results.file_data), c => c.charCodeAt(0))
        const zip081 = await JSZip.loadAsync(zipData081)
        const bulkBase64 = await zip081.generateAsync({ type: 'base64' })
        const bulkRes = await $fetch<{ results: { send_number: string } }>('/api/egov/bulk-apply', {
          method: 'POST',
          body: { send_file: { file_name: 'bulk.zip', file_data: bulkBase64 } },
          headers: { Authorization: `Bearer ${useEgovAuth().accessToken.value}` },
        })
        inquiryState.sendNumber_08_1 = bulkRes.results.send_number
        r.response = `send_number=${bulkRes.results.send_number}`
        break
      }
      case '08-2': {
        // bulk送信（エラーあり）— 不正な手続名
        const proc082 = TEST_PROCEDURES.find(p => p.proc_id === '950A010700005000')
        if (!proc082) throw new Error('手続 not found')
        const skeleton082 = await apiFetch<{ results: { file_data: string; configuration_file_name: string[]; file_info: Array<{ form_id: string; form_version: number; form_name: string; apply_file_name: string }> } }>(`/procedure/${proc082.proc_id}`)
        const zipData082 = Uint8Array.from(atob(skeleton082.results.file_data), c => c.charCodeAt(0))
        const zip082 = await JSZip.loadAsync(zipData082)
        // 不正な手続名を設定
        for (const cfn of skeleton082.results.configuration_file_name) {
          const p = `${proc082.proc_id}/${cfn}`
          const f = zip082.file(p)
          if (f) {
            let xml = await f.async('string')
            xml = xml.replace(/<手続名称\/>/g, '<手続名称>偽テスト用手続０００１</手続名称>')
            xml = xml.replace(/<手続名称><\/手続名称>/g, '<手続名称>偽テスト用手続０００１</手続名称>')
            zip082.file(p, xml)
          }
        }
        const bulkBase64_082 = await zip082.generateAsync({ type: 'base64' })
        const bulkRes082 = await $fetch<{ results: { send_number: string } }>('/api/egov/bulk-apply', {
          method: 'POST',
          body: { send_file: { file_name: 'bulk-error.zip', file_data: bulkBase64_082 } },
          headers: { Authorization: `Bearer ${useEgovAuth().accessToken.value}` },
        })
        inquiryState.sendNumber_08_2 = bulkRes082.results.send_number
        r.response = `send_number=${bulkRes082.results.send_number}`
        break
      }
      case '09-1': {
        // 再提出: 900A020700013000 で申請 → 補正待ちなら再提出
        const procId09 = '900A020700013000'
        // まず申請（submitOne で連署付き送信）
        const proc09 = TEST_PROCEDURES.find(p => p.proc_id === procId09)
        // SDK state から補正待ち案件の arrive_id を取得（新規申請はしない）
        let aid09 = inquiryState.arriveId_09_base
        if (!aid09) throw new Error('900A020700013000 の申請送信失敗')
        // ステータス確認
        const detail09 = await client.getApplication(aid09)
        if (!detail09.results.status.includes('補正待ち')) {
          r.status = 'skip'
          r.error = `${aid09} status=${detail09.results.status}（補正待ちではない。sandbox遷移後に再実行）`
          break
        }
        // 再提出用 ZIP
        const sk09r = await apiFetch<{ results: { file_data: string; configuration_file_name: string[]; file_info: Array<{ form_id: string; form_version: number; form_name: string; apply_file_name: string }> } }>(`/procedure/${procId09}`)
        const zipData09r = Uint8Array.from(atob(sk09r.results.file_data), c => c.charCodeAt(0))
        const zip09r = await JSZip.loadAsync(zipData09r)
        for (const cfn of sk09r.results.configuration_file_name) {
          const p = `${procId09}/${cfn}`
          const f = zip09r.file(p)
          if (f) {
            let xml = await f.async('string')
            xml = xml.replace(/<初回受付番号\/>/g, `<初回受付番号>${aid09}</初回受付番号>`)
            xml = xml.replace(/<初回受付番号><\/初回受付番号>/g, `<初回受付番号>${aid09}</初回受付番号>`)
            xml = xml.replace(/<申請種別\/>/g, '<申請種別>再提出</申請種別>')
            xml = xml.replace(/<申請種別><\/申請種別>/g, '<申請種別>再提出</申請種別>')
            zip09r.file(p, xml)
          }
        }
        const base64_09r = await zip09r.generateAsync({ type: 'base64' })
        const res09 = await client.submitApplication({ proc_id: procId09, send_file: { file_name: `${procId09}.zip`, file_data: base64_09r } })
        r.response = `arrive_id=${res09.results.arrive_id} (初回=${aid09})`
        break
      }
      case '10-1': {
        // 補正: 09-1 と同じ arrive_id で補正送信
        const procId10 = '900A020700013000'
        let aid10 = inquiryState.arriveId_09_base
        if (!aid10) throw new Error('09-1を先に実行してください')
        const detail10 = await client.getApplication(aid10)
        if (!detail10.results.status.includes('補正待ち')) {
          r.status = 'skip'
          r.error = `${aid10} status=${detail10.results.status}（補正待ちではない。sandbox遷移後に再実行）`
          break
        }
        const sk10 = await apiFetch<{ results: { file_data: string; configuration_file_name: string[]; file_info: Array<{ form_id: string; form_version: number; form_name: string; apply_file_name: string }> } }>(`/procedure/${procId10}`)
        const zipData10 = Uint8Array.from(atob(sk10.results.file_data), c => c.charCodeAt(0))
        const zip10 = await JSZip.loadAsync(zipData10)
        for (const cfn of sk10.results.configuration_file_name) {
          const p = `${procId10}/${cfn}`
          const f = zip10.file(p)
          if (f) {
            let xml = await f.async('string')
            xml = xml.replace(/<申請種別\/>/g, '<申請種別>補正</申請種別>')
            xml = xml.replace(/<申請種別><\/申請種別>/g, '<申請種別>補正</申請種別>')
            zip10.file(p, xml)
          }
        }
        const base64_10 = await zip10.generateAsync({ type: 'base64' })
        const res10 = await client.amendApplication({ arrive_id: aid10, send_file: { file_name: `${procId10}.zip`, file_data: base64_10 } })
        r.response = `arrive_id=${res10.results.arrive_id}`
        break
      }
      case '11-1': {
        // 取下げ依頼 — 07-1 の到達番号を使用（SDK と同じ）
        const aid111 = inquiryState.arriveId_07_1
        if (!aid111) throw new Error('07-1を先に実行してください')
        const proc111 = TEST_PROCEDURES.find(p => p.proc_id === '950A010700005000')!
        // スケルトン取得
        const skRes111 = await apiFetch<{ results: { file_data: string; configuration_file_name: string[]; file_info: Array<{ form_id: string; form_version: number; form_name: string; apply_file_name: string }> } }>(`/procedure/${proc111.proc_id}`)
        const fi0_111 = skRes111.results.file_info[0]!
        const baseName111 = fi0_111.form_name.replace(/＿[０-９\d]+$/, '')
        const procName111 = `${baseName111}／${baseName111}`
        const zipData111 = Uint8Array.from(atob(skRes111.results.file_data), c => c.charCodeAt(0))
        const zip111 = await JSZip.loadAsync(zipData111)
        // kousei.xml を取下げ用に修正
        const mainPath111 = `${proc111.proc_id}/kousei.xml`
        let mainXml111 = await zip111.file(mainPath111)!.async('string')
        // 様式IDを009に変更
        mainXml111 = mainXml111.split('999000000000000001').join('999000000000000009')
        mainXml111 = mainXml111.replace(/<手続ID\/>/g, '<手続ID>9990000000000003</手続ID>')
        mainXml111 = mainXml111.replace(/<手続ID><\/手続ID>/g, '<手続ID>9990000000000003</手続ID>')
        mainXml111 = mainXml111.replace(/<手続名称\/>/g, `<手続名称>${procName111}</手続名称>`)
        mainXml111 = mainXml111.replace(/<手続名称><\/手続名称>/g, `<手続名称>${procName111}</手続名称>`)
        mainXml111 = mainXml111.replace(/<初回受付番号\/>/g, `<初回受付番号>${aid111}</初回受付番号>`)
        mainXml111 = mainXml111.replace(/<初回受付番号><\/初回受付番号>/g, `<初回受付番号>${aid111}</初回受付番号>`)
        mainXml111 = mainXml111.replace(/<申請種別\/>/g, '<申請種別>取下げ依頼</申請種別>')
        mainXml111 = mainXml111.replace(/<申請種別><\/申請種別>/g, '<申請種別>取下げ依頼</申請種別>')
        // 添付書類属性情報を除去
        mainXml111 = mainXml111.replace(/<添付書類属性情報>[\s\S]*?<\/添付書類属性情報>/g, '')
        // 申請書属性情報（取下げ依頼用）
        if (!mainXml111.includes('<申請書属性情報>')) {
          mainXml111 = mainXml111.replace('</構成情報>',
            '<申請書属性情報><申請書様式ID>999000000000000003</申請書様式ID><申請書様式バージョン>0001</申請書様式バージョン><申請書様式名称>取下げ依頼XML</申請書様式名称><申請書ファイル名称>torisageirai.xml</申請書ファイル名称></申請書属性情報></構成情報>')
        }
        zip111.file(mainPath111, mainXml111)
        // 取下げ依頼情報 XML
        const now111 = new Date()
        const withdrawXml = `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet href="999000000000000003.xsl" type="text/xsl"?><DataRoot><様式ID>999000000000000003</様式ID><様式バージョン>0001</様式バージョン><STYLESHEET>999000000000000003.xsl</STYLESHEET><取下げ依頼情報><到達番号>${aid111}</到達番号><手続名称>${procName111}</手続名称><申請者氏名>テスト　太郎</申請者氏名><依頼年月日><年>${now111.getFullYear()}</年><月>${now111.getMonth() + 1}</月><日>${now111.getDate()}</日></依頼年月日><理由>テスト取下げ</理由></取下げ依頼情報></DataRoot>`
        zip111.file(`${proc111.proc_id}/torisageirai.xml`, withdrawXml)
        // 署名（useXmlSign composable 使用）
        if (pfxLoaded.value) {
          let signedMain111 = await zip111.file(mainPath111)!.async('string')
          const torisageContent = await zip111.file(`${proc111.proc_id}/torisageirai.xml`)!.async('string')
          const appFiles111 = new Map<string, string | Uint8Array>()
          appFiles111.set('torisageirai.xml', torisageContent)
          signedMain111 = signKouseiXml(signedMain111, appFiles111, 1)
          zip111.file(mainPath111, signedMain111)
        }
        const withdrawBase64 = await zip111.generateAsync({ type: 'base64' })
        await client.withdrawApplication({
          arrive_id: aid111,
          send_file: { file_name: 'withdraw.zip', file_data: withdrawBase64 },
        })
        r.response = `取下げ成功 arrive_id=${aid111}`
        break
      }
      case '12-1': {
        // 形式チェック（正常）
        const proc121 = TEST_PROCEDURES.find(p => p.proc_id === '950A010700005000')!
        const sk121 = await apiFetch<{ results: { file_data: string; configuration_file_name: string[]; file_info: Array<{ form_id: string; form_version: number; form_name: string; apply_file_name: string }> } }>(`/procedure/${proc121.proc_id}`)
        const zipData121 = Uint8Array.from(atob(sk121.results.file_data), c => c.charCodeAt(0))
        const zip121 = await JSZip.loadAsync(zipData121)
        const base64_121 = await zip121.generateAsync({ type: 'base64' })
        const checkRes = await client.checkFormat({
          proc_id: proc121.proc_id,
          send_file: { file_name: 'check.zip', file_data: base64_121 },
        })
        r.response = JSON.stringify(checkRes.results).substring(0, 200)
        break
      }
      case '12-2': {
        // 形式チェック（エラーあり）— 不正な手続名
        const proc122 = TEST_PROCEDURES.find(p => p.proc_id === '950A010700005000')!
        const sk122 = await apiFetch<{ results: { file_data: string; configuration_file_name: string[]; file_info: Array<{ form_id: string; form_version: number; form_name: string; apply_file_name: string }> } }>(`/procedure/${proc122.proc_id}`)
        const zipData122 = Uint8Array.from(atob(sk122.results.file_data), c => c.charCodeAt(0))
        const zip122 = await JSZip.loadAsync(zipData122)
        for (const cfn of sk122.results.configuration_file_name) {
          const p = `${proc122.proc_id}/${cfn}`
          const f = zip122.file(p)
          if (f) {
            let xml = await f.async('string')
            xml = xml.replace(/<手続名称\/>/g, '<手続名称>偽テスト用手続０００１</手続名称>')
            xml = xml.replace(/<手続名称><\/手続名称>/g, '<手続名称>偽テスト用手続０００１</手続名称>')
            zip122.file(p, xml)
          }
        }
        const base64_122 = await zip122.generateAsync({ type: 'base64' })
        const checkRes122 = await client.checkFormat({
          proc_id: proc122.proc_id,
          send_file: { file_name: 'check-error.zip', file_data: base64_122 },
        })
        r.response = JSON.stringify(checkRes122.results).substring(0, 200)
        break
      }
      case '13-1': {
        const sn = inquiryState.sendNumber_08_1
        if (!sn) throw new Error('08-1を先に実行してください')
        const res = await client.listApplications({ send_number: sn })
        r.response = `count=${res.resultset?.count ?? 'N/A'}, send_number=${sn}`
        break
      }
      case '13-2': {
        const res = await client.listApplications({ date_from: today, date_to: today, limit: 10, offset: 0 })
        const list = (res.results as any)?.apply_list
        if (list?.[0]?.arrive_id) inquiryState.arriveId = list[0].arrive_id
        r.response = `count=${res.resultset?.count ?? 'N/A'}`
        break
      }
      case '14-1': {
        const arriveId = inquiryState.arriveId_07_1 || inquiryState.arriveId
        if (!arriveId) throw new Error('07-1を先に実行してください')
        const res = await client.getApplication(arriveId)
        r.response = `status=${res.results.status}, notices=${res.results.notice_count}, docs=${res.results.doc_count}`
        break
      }
      case '15-1': {
        const sn15 = inquiryState.sendNumber_08_2
        if (!sn15) throw new Error('08-2を先に実行してください')
        const res = await client.getErrorReport({ send_number: sn15 })
        r.response = `send_number=${sn15}, ${JSON.stringify(res.results).substring(0, 150)}`
        break
      }
      case '15-2': {
        const res = await client.getErrorReport({ date_from: today, date_to: today, limit: 10, offset: 0 })
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      case '16-1': {
        const res = await client.listMessages({ date_from: '2020-11-24', date_to: today, limit: 10, offset: 0 })
        const list = (res.results as any)?.message_list
        if (list?.[0]?.information_id) {
          inquiryState.informationId = list[0].information_id
        }
        r.response = `count=${res.resultset?.count ?? 'N/A'}`
        break
      }
      case '17-1': {
        const infoId = inquiryState.informationId
        if (!infoId) { r.status = 'skip'; r.response = '※最終確認試験用データ情報を参照（e-Govから送付されるお知らせIDが必要）'; break }
        const res = await client.getMessage(infoId)
        r.response = `title=${(res.results as any)?.message?.title ?? 'N/A'}`
        break
      }
      case '18-1': {
        const res = await client.listNotices({ date_from: '2020-11-24', date_to: today, limit: 10, offset: 0 })
        const list = (res.results as any)?.notice_list
        if (list?.[0]) {
          inquiryState.noticeArriveId = list[0].arrive_id
          inquiryState.noticeSubId = String(list[0].notice_sub_id)
        }
        r.response = `count=${res.resultset?.count ?? 'N/A'}`
        break
      }
      case '18-2': {
        const aid = inquiryState.noticeArriveId
        const nsid = inquiryState.noticeSubId
        if (!aid || !nsid) { r.status = 'skip'; r.error = '18-1の通知データなし'; break }
        const res = await client.getNotice(aid, nsid)
        r.response = `title=${(res.results as any)?.notice?.notice_title ?? 'N/A'}`
        break
      }
      case '19-1': {
        // 公文書取得: テストデータ設定 > 申請済み案件から自動検索
        let docArriveId = preparedArriveId.value || inquiryState.officialDocArriveId
        let docNoticeSubId = preparedNoticeSubId.value || inquiryState.officialDocNoticeSubId
        if (!docArriveId || !docNoticeSubId) {
          // 申請一覧から公文書のある案件を検索
          const list19 = await client.listApplications({ date_from: '2020-01-01', date_to: today, limit: 50, offset: 0 })
          const apps19 = (list19.results as any)?.apply_list ?? []
          for (const app of apps19) {
            try {
              const detail = await client.getApplication(app.arrive_id)
              if (detail.results.official_list?.length) {
                const doc = detail.results.official_list[0]!
                docArriveId = detail.results.arrive_id
                docNoticeSubId = String(doc.notice_sub_id)
                inquiryState.officialDocArriveId = docArriveId
                inquiryState.officialDocNoticeSubId = docNoticeSubId
                break
              }
            } catch { continue }
          }
        }
        if (!docArriveId || !docNoticeSubId) throw new Error('公文書のある案件がありません。sandbox で公文書発行後に再実行してください。')
        const res = await client.getOfficialDocument(preparedArriveId.value, preparedNoticeSubId.value)
        inquiryState.officialDocFileData = res.results.file_data
        r.response = `files=${res.results.file_name_list?.length ?? 0}`
        break
      }
      case '20-1': {
        if (!preparedArriveId.value || !preparedNoticeSubId.value) throw new Error('19-1のデータなし')
        await client.completeOfficialDocument({ arrive_id: preparedArriveId.value, notice_sub_id: Number(preparedNoticeSubId.value) })
        r.response = 'OK'
        break
      }
      case '21-1': {
        const fileData = inquiryState.officialDocFileData
        if (!fileData) throw new Error('19-1のfile_dataなし')
        const res = await client.verifyOfficialDocument({ file_name: 'official_doc.zip', file_data: fileData, sig_verification_xml_file_name: 'kousei.xml' })
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      case '22-1': {
        const res = await client.listPaymentBanks()
        const banks = (res.results as any)?.bank_list
        if (banks?.[0]?.bank_name) inquiryState.bankName = banks[0].bank_name
        r.response = `banks=${banks?.length ?? 'N/A'}`
        break
      }
      case '23-1': {
        // 納付手続 (950A010002018000) で申請 → 納付情報取得
        const payProc = TEST_PROCEDURES.find(p => p.proc_id === '950A010002018000')
        if (!payProc) throw new Error('手続 950A010002018000 not found')
        // まだ申請してなければ submitOne で申請
        if (!inquiryState.payArriveId) {
          await submitOne(payProc)
          const payResult = results.value.get(payProc.proc_id)
          if (payResult?.status === 'done' && payResult.arrive_id) {
            inquiryState.payArriveId = payResult.arrive_id
          } else {
            throw new Error('納付手続の申請送信失敗')
          }
        }
        const res = await client.getPaymentInfo(inquiryState.payArriveId)
        const pay = (res.results as any)
        if (pay?.proc_id) inquiryState.paymentProcId = pay.proc_id
        if (pay?.apply_pay_list?.[0]?.pay_number) {
          inquiryState.paymentNumber = pay.apply_pay_list[0].pay_number
        }
        if (!inquiryState.bankName) inquiryState.bankName = 'テスト銀行'
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      case '24-1': {
        const payAid24 = inquiryState.payArriveId
        if (!inquiryState.paymentProcId || !inquiryState.paymentNumber || !payAid24) {
          r.status = 'skip'
          r.response = '※最終確認試験用データ情報を参照（e-Govから送付される納付番号が必要）'
          break
        }
        const res = await client.displayPaymentSite({ proc_id: inquiryState.paymentProcId, arrive_id: payAid24, pay_number: inquiryState.paymentNumber, bank_name: inquiryState.bankName || 'テスト銀行' })
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      case '27-1': {
        // 電子送達利用申込み — 既存 submitOne で送信
        const proc27 = TEST_PROCEDURES.find(p => p.proc_id === '900A013800001000')
        if (!proc27) throw new Error('電子送達手続 900A013800001000 not found')
        await submitOne(proc27)
        const res27 = results.value.get(proc27.proc_id)
        if (res27?.status === 'done' && res27.arrive_id) {
          postArriveId.value = res27.arrive_id
          savePreparedIds()
          r.response = `arrive_id=${res27.arrive_id}`
        } else {
          throw new Error(res27?.error ?? '電子送達申請失敗')
        }
        break
      }
      case '28-1': {
        if (!postArriveId.value) throw new Error('27-1を先に実行してください')
        const res = await client.getPostApplyStatus(postArriveId.value)
        r.response = `status=${(res.results as any)?.status ?? 'N/A'}`
        break
      }
      case '29-1': {
        // ※開始日は最終試験開始日を、終了日は現在日を指定すること
        const res = await client.listPostDeliveries({ date_from: today, date_to: today, limit: 10, offset: 0 })
        const list = (res.results as any)?.post_list
        if (list?.[0]?.post_id) {
          inquiryState.postId_29_1 = list[0].post_id
        }
        r.response = `count=${res.resultset?.count ?? 'N/A'}`
        break
      }
      case '30-1': {
        const pid30 = inquiryState.postId_29_1
        if (!pid30) {
          r.status = 'skip'
          r.response = '※最終確認試験用データ情報を参照（e-Govから送付される電子送達post_idが必要）'
          break
        }
        const res = await client.getPostDelivery(pid30)
        inquiryState.postDocFileData = (res.results as any)?.file_data
        r.response = `files=${(res.results as any)?.file_name_list?.length ?? 0}`
        break
      }
      case '31-1': {
        const pid31 = inquiryState.postId_29_1
        if (!pid31) {
          r.status = 'skip'
          r.response = '※最終確認試験用データ情報を参照（e-Govから送付される電子送達post_idが必要）'
          break
        }
        await client.completePostDelivery({ post_id: pid31 })
        r.response = 'OK'
        break
      }
      case '25-1': {
        const saved = JSON.parse(localStorage.getItem('egov_tokens') || '{}')
        if (!saved.refreshToken) throw new Error('リフレッシュトークンなし')
        await $fetch('/api/egov/logout', {
          method: 'POST',
          body: { refresh_token: saved.refreshToken },
        })
        r.response = '204 No Content'
        break
      }
      case '26-1': {
        const saved = JSON.parse(localStorage.getItem('egov_tokens') || '{}')
        if (!saved.refreshToken) throw new Error('リフレッシュトークンなし')
        try {
          const res = await $fetch<{ active: boolean }>('/api/egov/introspect', {
            method: 'POST',
            body: { token: saved.refreshToken, token_type_hint: 'refresh_token' },
          })
          r.response = `active=${res.active}`
        } catch (e: any) {
          // ログアウト後はエラーになる場合あり（仕様通り）
          r.response = `expected error: ${e.data?.error ?? e.message}`
        }
        break
      }
      case '32-1': {
        if (!useGbizId.value) { r.status = 'skip'; r.error = 'gBizIDアカウント必須'; break }
        const res = await client.createShareSetting({ gbiz_id: 'test@example.com', official_doc_permission: 'READ', post_doc_permission: 'READ' })
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      case '33-1': {
        if (!useGbizId.value) { r.status = 'skip'; r.error = 'gBizIDアカウント必須'; break }
        const res = await client.updateShareSetting({ gbiz_id: 'test@example.com', official_doc_permission: 'DOWNLOAD', post_doc_permission: 'DOWNLOAD' })
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      case '34-1': {
        if (!useGbizId.value) { r.status = 'skip'; r.error = 'gBizIDアカウント必須'; break }
        const res = await client.deleteShareSetting({ gbiz_id: 'test@example.com' })
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      case '35-1': {
        if (!useGbizId.value) { r.status = 'skip'; r.error = 'gBizIDアカウント必須'; break }
        const res = await client.confirmShareSetting({ gbiz_id: 'test@example.com', share_acceptance: 'ACCEPT' })
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      case '36-1': {
        if (!useGbizId.value) { r.status = 'skip'; r.error = 'gBizIDアカウント必須'; break }
        const res = await client.listShareSettings()
        r.response = JSON.stringify(res.results).substring(0, 200)
        break
      }
      default:
        r.status = 'skip'
        r.error = '未実装'
    }
    if (r.status === 'running') r.status = 'pass'
  } catch (e: unknown) {
    if (r.status === 'running') r.status = 'error'
    if (e instanceof EgovApiError) {
      r.error = JSON.stringify({ statusCode: e.statusCode, resultCode: e.resultCode, messages: e.errorMessages, report: e.reportList }, null, 2)
    } else {
      const err = e as { data?: { data?: Record<string, unknown> }; message?: string }
      r.error = err.data?.data ? JSON.stringify(err.data.data, null, 2) : err.message || String(e)
    }
  }

  r.durationMs = Date.now() - start
  inquiryResults.value.set(item.test_no, { ...r })

  // エラーログに記録
  const entry: Record<string, unknown> = { test_no: item.test_no, api_name: item.api_name, status: r.status, durationMs: r.durationMs }
  if (r.response) entry.response = r.response
  if (r.error) try { entry.error = JSON.parse(r.error) } catch { entry.error = r.error }
  errorLog.value = errorLog.value + JSON.stringify(entry, null, 2) + '\n---\n'

  saveInquiryResults()
}

async function runAllInquiry() {
  inquiryRunning.value = true
  inquiryProgress.value = 0
  const tests = INQUIRY_TESTS.filter(t => !t.needsGbizId && getInquiryResult(t.test_no).status !== 'pass')
  for (let i = 0; i < tests.length; i++) {
    await runInquiryTest(tests[i]!)
    inquiryProgress.value = Math.round(((i + 1) / tests.length) * 100)
    if (i < tests.length - 1) await new Promise(r => setTimeout(r, 1000))
  }
  inquiryRunning.value = false
}

function resetInquiry() {
  if (!confirm('テスト結果をリセットしますか？')) return
  inquiryResults.value.clear()
  localStorage.removeItem('egov_inquiry_results')
  inquiryProgress.value = 0
  errorLog.value = ''
  localStorage.removeItem('egov_error_log')
}

async function exportAllResults() {
  const zip = new JSZip()

  // 照会テスト結果CSV
  const csvLines = ['test_no,api_name,status,response,durationMs,error']
  for (const t of INQUIRY_TESTS) {
    const r = getInquiryResult(t.test_no)
    const esc = (s?: string) => s ? `"${s.replace(/"/g, '""').replace(/\n/g, ' ')}"` : ''
    csvLines.push(`${t.test_no},${esc(t.api_name)},${r.status},${esc(r.response)},${r.durationMs ?? ''},${esc(r.error)}`)
  }
  zip.file('inquiry-results.csv', csvLines.join('\n'))

  // 申請送信結果CSV
  const applyLines = ['No,proc_id,format,arrive_id,send_number']
  for (const proc of TEST_PROCEDURES) {
    const r = getResult(proc.proc_id)
    applyLines.push(`${proc.no},${proc.proc_id},${proc.format},${r.arrive_id ?? ''},${r.send_number ?? ''}`)
  }
  zip.file('apply-results.csv', applyLines.join('\n'))

  // 公文書ZIP (19-1)
  if (inquiryState.officialDocFileData) {
    const binary = atob(inquiryState.officialDocFileData)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    zip.file('official_document_19-1.zip', bytes)
  }

  // 電子送達ZIP (30-1)
  if (inquiryState.postDocFileData) {
    const binary = atob(inquiryState.postDocFileData)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    zip.file('post_delivery_30-1.zip', bytes)
  }

  // エラーログ
  if (errorLog.value) {
    zip.file('error-log.txt', errorLog.value)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `final-test-results_${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

function exportInquiryCsv() {
  const lines = ['test_no,api_name,status,response,durationMs,error']
  for (const t of INQUIRY_TESTS) {
    const r = getInquiryResult(t.test_no)
    const esc = (s?: string) => s ? `"${s.replace(/"/g, '""').replace(/\n/g, ' ')}"` : ''
    lines.push(`${t.test_no},${esc(t.api_name)},${r.status},${esc(r.response)},${r.durationMs ?? ''},${esc(r.error)}`)
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'inquiry-test-results.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const inquiryDoneCount = computed(() => [...inquiryResults.value.values()].filter(r => r.status === 'pass').length)
</script>

<template>
  <div style="max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h1>最終確認試験 - 申請送信 <span style="font-size: 12px; color: #6c757d; font-weight: normal;">{{ gitCommit }}</span></h1>
      <button v-if="isAuthenticated" @click="logout" style="padding: 6px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">ログアウト</button>
    </div>

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
            <input v-model="useGbizId" type="checkbox" style="margin-right: 6px;" />
            GビズIDアカウント
          </label>
          <span v-if="useGbizId" style="font-size: 12px; color: #28a745;">
            署名省略で本番送信（Trial なし）
          </span>
          <span v-else style="font-size: 12px; color: #999;">
            e-Gov アカウント
          </span>
        </div>
        <template v-if="!useGbizId">
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
          <div v-if="enableSign && pfxLoaded" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 8px;">
            <span style="font-size: 13px; color: #666;">連署用追加証明書:</span>
            <input ref="extraPfxInput" type="file" accept=".pfx,.p12" multiple style="font-size: 13px;" />
            <button @click="handleLoadExtraPfx" style="padding: 4px 12px; font-size: 13px; cursor: pointer;">
              追加読込
            </button>
            <span v-if="extraPfxCount > 0" style="color: #28a745; font-size: 13px;">
              +{{ extraPfxCount }}件
            </span>
          </div>
        </template>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
        <button @click="runAll" :disabled="running || (!useGbizId && enableSign && !pfxLoaded)" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
          {{ running ? '実行中...' : useGbizId ? '全件実行（GビズID）' : enableSign ? '全件実行（署名付き）' : '全件実行（Trial）' }}
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

      <!-- エラーログ -->
      <div v-if="errorLog" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: flex-end; margin-bottom: 4px;">
          <button @click="copyErrorLog" style="padding: 4px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">コピー</button>
        </div>
        <textarea v-model="errorLog" readonly style="width: 100%; height: 200px; font-family: monospace; font-size: 11px; padding: 8px; border: 1px solid #dc3545; border-radius: 4px; background: #fff5f5; resize: vertical;" />
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

      <!-- テストデータ準備 (TID_202604130039) -->
      <details style="margin-bottom: 20px; border: 1px solid #b8c9ff; border-radius: 8px; background: #f0f4ff;">
        <summary style="padding: 12px 16px; cursor: pointer; font-weight: bold; font-size: 14px;">
          テストデータ準備 (TID_202604130039) — データ1 送信番号/到達番号生成
        </summary>
        <div style="padding: 0 16px 16px;">
          <p style="margin: 0 0 12px; font-size: 12px; color: #666;">
            出力先: <code style="font-family: monospace;">{{ specResultPath }}</code><br>
            ※ standard.json / individual-signature.json (原本) は不変。新規ファイルに追記されます。
          </p>
          <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;">
            <button @click="submitAllSpecSlot1" :disabled="specRunning || running || (!useGbizId && enableSign && !pfxLoaded)" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
              {{ specRunning ? '実行中...' : '全件 データ1 送信' }}
            </button>
            <button @click="submitAllBulkSpecSlot1" :disabled="specRunning || running" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">
              全件 bulk送信 (送信番号)
            </button>
            <button @click="loadSpecData" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
              再読込
            </button>
            <span style="margin-left: auto; font-size: 13px;">
              到達番号: {{ specEntries.filter(e => e.slots['1'].到達番号).length }} / {{ specEntries.length }}
              送信番号: {{ specEntries.filter(e => e.slots['1'].送信番号).length }} / {{ specEntries.length }}
            </span>
          </div>
          <div v-if="specRunning || specCurrent" style="padding: 8px; background: #e9ecef; border-radius: 4px; margin-bottom: 12px; font-size: 13px;">
            <div v-if="specRunning" style="background: #dee2e6; border-radius: 4px; height: 6px; margin-bottom: 6px;">
              <div :style="{ width: specProgress + '%', background: '#28a745', height: '100%', borderRadius: '4px', transition: 'width 0.3s' }" />
            </div>
            <span>{{ specCurrent }}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #dee2e6;">
                <th style="padding: 6px; text-align: left; border: 1px solid #ced4da;">format</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #ced4da;">proc_id</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #ced4da;">データの状態</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #ced4da;">データ1.到達番号</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #ced4da;">データ1.送信番号</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #ced4da;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in specEntries" :key="entry.proc_id">
                <td style="padding: 4px 6px; border: 1px solid #ced4da;">{{ entry.format }}</td>
                <td style="padding: 4px 6px; border: 1px solid #ced4da; font-family: monospace;">{{ entry.proc_id }}</td>
                <td style="padding: 4px 6px; border: 1px solid #ced4da;">{{ entry.data_state }}</td>
                <td style="padding: 4px 6px; border: 1px solid #ced4da; font-family: monospace;">{{ entry.slots['1'].到達番号 || '-' }}</td>
                <td style="padding: 4px 6px; border: 1px solid #ced4da; font-family: monospace;">{{ entry.slots['1'].送信番号 || '-' }}</td>
                <td style="padding: 4px 6px; border: 1px solid #ced4da;">
                  <button @click="submitSpecSlot1(entry)" :disabled="specRunning || running" style="padding: 2px 8px; font-size: 11px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">
                    送信
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <h2>全テスト項目 ({{ INQUIRY_TESTS.length }}件)</h2>

      <!-- 準備データ入力 -->
      <div style="padding: 16px; background: #f0f4ff; border: 1px solid #b8c9ff; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 12px 0; font-size: 14px;">テストデータ設定</h3>
        <div style="display: grid; grid-template-columns: 160px 1fr; gap: 6px 12px; align-items: center; font-size: 13px;">
          <label>公文書 到達番号:</label>
          <input v-model="preparedArriveId" @change="savePreparedIds" placeholder="19-1/20-1/21-1用" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;" />
          <label>公文書 通知通番:</label>
          <input v-model="preparedNoticeSubId" @change="savePreparedIds" placeholder="19-1/20-1/21-1用" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;" />
          <label>納付 到達番号:</label>
          <input v-model="paymentArriveId" @change="savePreparedIds" placeholder="23-1/24-1用" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;" />
          <label>電子送達 到達番号:</label>
          <input v-model="postArriveId" @change="savePreparedIds" placeholder="28-1用" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;" />
          <label>電子送達 post_id:</label>
          <input v-model="postId" @change="savePreparedIds" placeholder="30-1/31-1用" style="padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: monospace;" />
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px; margin-top: 20px;">
        <h2 style="margin: 0;">標準形式 ({{ standardProcs.length }}件)</h2>
        <button
          @click="copyStandardForExcel"
          style="padding: 4px 12px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;"
          title="送信番号\t到達番号 の TSV をクリップボードにコピー (Excel にそのまま貼付可)"
        >
          Excel貼付用コピー (送信→到達)
        </button>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="border: 1px solid #dee2e6; padding: 6px;">No</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">手続識別子</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">期待状態</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">備考</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">状態</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">送信番号</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">到達番号</th>
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
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 11px;">{{ getResult(proc.proc_id).send_number ?? '' }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 11px;">{{ getResult(proc.proc_id).arrive_id ?? '' }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">
              <button
                @click="submitOne(proc, true)"
                :disabled="running || getResult(proc.proc_id).status === 'done'"
                style="padding: 2px 8px; font-size: 12px; cursor: pointer;"
              >
                実行
              </button>
            </td>
          </tr>
          <tr v-if="getResult(proc.proc_id).status === 'error'">
            <td colspan="8" style="border: 1px solid #dee2e6; padding: 4px 8px; background: #fff5f5; color: #dc3545; font-size: 12px; word-break: break-all; white-space: pre-wrap; cursor: pointer;" @click="copyResult(proc)">
              <span style="color: #999; font-size: 10px;">[{{ gitCommit }}]</span> {{ getResult(proc.proc_id).error }}
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
            <th style="border: 1px solid #dee2e6; padding: 6px;">送信番号</th>
            <th style="border: 1px solid #dee2e6; padding: 6px;">到達番号</th>
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
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 11px;">{{ getResult(proc.proc_id).send_number ?? '' }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; font-family: monospace; font-size: 11px;">{{ getResult(proc.proc_id).arrive_id ?? '' }}</td>
            <td style="border: 1px solid #dee2e6; padding: 4px; text-align: center;">
              <button
                @click="submitOne(proc, true)"
                :disabled="running || getResult(proc.proc_id).status === 'done'"
                style="padding: 2px 8px; font-size: 12px; cursor: pointer;"
              >
                実行
              </button>
            </td>
          </tr>
          <tr v-if="getResult(proc.proc_id).status === 'error'">
            <td colspan="8" style="border: 1px solid #dee2e6; padding: 4px 8px; background: #fff5f5; color: #dc3545; font-size: 12px; word-break: break-all; white-space: pre-wrap; cursor: pointer;" @click="copyResult(proc)">
              <span style="color: #999; font-size: 10px;">[{{ gitCommit }}]</span> {{ getResult(proc.proc_id).error }}
            </td>
          </tr>
          </template>
        </tbody>
      </table>
    </template>
  </div>
</template>
