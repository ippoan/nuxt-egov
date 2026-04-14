<script setup lang="ts">
// build: 20260414
import type { EgovClient } from '@ippoan/egov-shinsei-sdk'
import JSZip from 'jszip'
import { TEST_PROCEDURES, PROCS_WITH_DESTINATION, type TestProcedure } from '~/utils/finalTestProcedures'

const { isAuthenticated, startLogin, apiFetch, getClient } = useEgovAuth()
const { pfxLoaded, certSubject, loadPfx, loadTestPfx, signKouseiXml } = useXmlSign()

const useGbizId = ref(false)
const enableSign = ref(true)
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
    } else if (t.includes('所在地') || t.includes('住所')) {
      values[tag] = '東京都千代田区永田町'
    } else if (t.includes('あて先') || t.includes('宛先')) {
      values[tag] = 'テスト宛先'
    } else if (t.includes('概要')) {
      values[tag] = 'テスト事業'
    } else if (t.includes('種類') || t.includes('業種')) {
      values[tag] = 'その他'
    } else if (t.includes('名称') || t.includes('事業所名') || t.includes('事業の名称')) {
      values[tag] = isFullWidth ? 'テスト事業所' : 'テスト事業所'
    } else if ((t.includes('フリガナ') || t.includes('カナ')) && (fullTag.includes('氏名') || t.includes('氏名'))) {
      values[tag] = 'テストタロウ'
    } else if (t.includes('カナ') || t.includes('フリガナ')) {
      values[tag] = 'テスト'
    } else if (t.includes('氏名')) {
      values[tag] = 'テスト太郎'
    } else if (t.includes('チェックボックス') || t.includes('チェック')) {
      values[tag] = '1'
    } else if (t.includes('記号')) {
      values[tag] = isNum ? '1' : 'ア'
    } else if (t.includes('賃金') || t.includes('金額') || t.includes('見込額')) {
      values[tag] = '100000'
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
  const entry: Record<string, unknown> = { no: proc.no, proc_id: proc.proc_id, git: gitCommit, status: r.status }
  if (r.arrive_id) entry.arrive_id = r.arrive_id
  if (r.error) try { entry.error = JSON.parse(r.error) } catch { entry.error = r.error }
  if (r.debugKouseiXml) entry.kouseiXml = r.debugKouseiXml
  if (r.debugApplyXml) entry.applyXml = r.debugApplyXml
  errorLog.value = JSON.stringify(entry, null, 2) + '\n---\n' + errorLog.value
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
      // configFiles[0] = "kousei.xml" (main)
      // configFiles[1] = WriteAppli構成情報 (様式ID=001→009に変換)
      // configFiles[2] = SignAttach構成情報 (様式ID=009→001に変換)

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
        // 添付書類属性情報: 申請書XML + configFiles[1] + configFiles[2] を登録
        if (fi0) {
          let attachBlocks = ''
          // 申請書XML
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>${fi0.form_name}</添付書類名称><添付書類ファイル名称>${fi0.apply_file_name}</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          // configFiles[1] (WriteAppli構成情報)
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>申請書作成構成情報</添付書類名称><添付書類ファイル名称>${configFiles[1]}</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          // configFiles[2] (SignAttach構成情報)
          attachBlocks += `<添付書類属性情報><添付種別>添付</添付種別><添付書類名称>添付書類署名構成情報</添付書類名称><添付書類ファイル名称>${configFiles[2]}</添付書類ファイル名称><提出情報>1</提出情報></添付書類属性情報>`
          xml = xml.replace('</管理情報>', '</管理情報>' + attachBlocks)
        }
        // 申請書属性情報は入れない（個別署名形式）
        zip.file(mainPath, xml)
      }

      // --- configFiles[1]: WriteAppli（申請書作成） ---
      // スケルトンでは様式ID=001だが、APIは009を期待 → 001→009にスワップ
      const writeAppliPath = `${proc.proc_id}/${configFiles[1]}`
      const writeAppliFile = zip.file(writeAppliPath)
      if (writeAppliFile) {
        let xml = await writeAppliFile.async('string')
        console.log(`[${proc.proc_id}] WriteAppli (before):`, xml.substring(0, 3000))
        // 様式ID 001→009 にスワップ（xml-stylesheet PIを含む全箇所）
        xml = xml.split('999000000000000001').join('999000000000000009')
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
        // WriteAppli: 申請書属性情報・添付書類属性情報・提出先情報は入れない（スケルトンの空タグのまま残す）
        zip.file(writeAppliPath, xml)
      }

      // --- configFiles[2]: SignAttach（添付書類署名） ---
      // スケルトンでは様式ID=009だが、APIは001を期待 → 009→001にスワップ
      const signAttachPath = `${proc.proc_id}/${configFiles[2]}`
      const signAttachFile = zip.file(signAttachPath)
      if (signAttachFile) {
        let xml = await signAttachFile.async('string')
        console.log(`[${proc.proc_id}] SignAttach (before):`, xml.substring(0, 3000))
        // 様式ID 009→001 にスワップ（xml-stylesheet PIを含む全箇所）
        xml = xml.split('999000000000000009').join('999000000000000001')
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
        // SignAttach: 申請書属性情報は入れない（スケルトンの空タグのまま残す）
        zip.file(signAttachPath, xml)
      }
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
          applyXml = applyXml.replace(new RegExp(`<${actualTag}(\\s[^>]*)?>\\s*</${actualTag}>`, 'g'), (m, attrs) => `<${actualTag}${attrs || ''}>${value}</${actualTag}>`)
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
        console.log(`[${proc.proc_id}] apply filled ${Object.keys(testValues).length} fields + ${fallbackCount} fallback`)
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
    <h1>最終確認試験 - 申請送信 <span style="font-size: 12px; color: #6c757d; font-weight: normal;">{{ gitCommit }}</span></h1>

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
