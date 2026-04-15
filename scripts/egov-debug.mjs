#!/usr/bin/env node
/**
 * e-Gov スケルトン検証スクリプト
 *
 * Usage:
 *   node scripts/egov-debug.mjs <proc_id>
 *   npm run egov-debug -- 950A101220029000
 *
 * Token: .env の EGOV_ACCESS_TOKEN から読む。なければ環境変数から。
 * ブラウザで window._egovToken をコピーして .env に追加:
 *   echo "EGOV_ACCESS_TOKEN=eyJ..." >> .env
 */
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const JSZip = require('jszip')

// .env 簡易パース
function loadEnv() {
  try {
    // worktree からもメインの .env を参照
    let envPath = resolve(__dirname, '..', '.env')
    try { readFileSync(envPath) } catch { envPath = resolve(__dirname, '..', '..', '..', '..', '.env') }
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim()
      }
    }
  } catch {}
}
loadEnv()

const API_BASE = process.env.NUXT_PUBLIC_EGOV_API_BASE || 'https://api2.sbx.e-gov.go.jp/shinsei/v2'
const TOKEN = process.env.EGOV_ACCESS_TOKEN
const PROC_ID = process.argv[2]

if (!TOKEN || !PROC_ID) {
  console.error(`Usage: node scripts/egov-debug.mjs <proc_id>

  .env に EGOV_ACCESS_TOKEN を追加してください:
    echo "EGOV_ACCESS_TOKEN=eyJ..." >> .env

  Token取得: ブラウザで window._egovToken`)
  process.exit(1)
}

console.log(`API: ${API_BASE}`)
console.log(`Proc: ${PROC_ID}`)
console.log(`Token: ${TOKEN.substring(0, 20)}...`)
console.log()

// 1. Procedure info (skeleton ZIP は base64 で含まれる)
const procRes = await fetch(`${API_BASE}/procedure/${PROC_ID}`, {
  headers: { Authorization: `Bearer ${TOKEN}` }
})
if (!procRes.ok) {
  console.error(`procedure API error: ${procRes.status}`)
  console.error(await procRes.text())
  process.exit(1)
}
const proc = await procRes.json()
const configFiles = proc.results.configuration_file_name
const fileInfo = proc.results.file_info

console.log('=== Procedure ===')
console.log('configFiles:', configFiles)
console.log('fileInfo:', fileInfo?.map(f => ({ name: f.apply_file_name, form_id: f.form_id })))

// 2. Skeleton ZIP 展開
const zipBytes = Buffer.from(proc.results.file_data, 'base64')
console.log(`skeleton ZIP: ${zipBytes.length} bytes`)
const zip = await JSZip.loadAsync(zipBytes)

// 3. 各構成情報ファイル
for (let i = 0; i < configFiles.length; i++) {
  const cf = configFiles[i]
  const file = zip.file(`${PROC_ID}/${cf}`)
  if (!file) { console.log(`\n[${i}] ${cf} — NOT FOUND`); continue }
  const xml = await file.async('string')
  const label = i === 0 ? 'Main' : i === 1 ? 'WriteAppli' : 'SignAttach'
  console.log(`\n=== [${i}] ${cf} (${label}) ===`)
  console.log(`  length: ${xml.length}`)
  console.log(`  <署名情報>: ${xml.includes('<署名情報>')}`)
  console.log(`  <その他>: ${xml.includes('<その他>')}`)
  console.log(`  <添付書類属性情報>: ${xml.includes('<添付書類属性情報>')}`)
  console.log(`  <申請書属性情報>: ${xml.includes('<申請書属性情報>')}`)
  console.log(`  tail:\n${xml.substring(xml.length - 200)}`)
}

// 4. 申請書XML
for (const fi of fileInfo || []) {
  const file = zip.file(`${PROC_ID}/${fi.apply_file_name}`)
  if (file) {
    const xml = await file.async('string')
    console.log(`\n=== Apply: ${fi.apply_file_name} (${xml.length} bytes) ===`)
    console.log(xml.substring(0, 300) + '...')
  }
}

// 5. Check XML (必須フィールド数)
for (const fi of fileInfo || []) {
  const file = zip.file(`${PROC_ID}/${fi.form_id}check.xml`)
  if (file) {
    const xml = await file.async('string')
    const required = (xml.match(/omitDisabled/g) || []).length
    console.log(`\n=== Check: ${fi.form_id}check.xml — required fields: ${required} ===`)
  }
}

// 6. ZIP 一覧
console.log('\n=== ZIP files ===')
zip.forEach((path, f) => { if (!f.dir) console.log(`  ${path}`) })
