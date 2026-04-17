import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const SDK_BASE = '/home/yhonda/js/egov-shinsei-sdk'
const TID_DIR = resolve(SDK_BASE, 'spec/最終確認試験用データ情報(TID_202604130039)_1版')
const STANDARD_JSON = resolve(TID_DIR, 'standard.json')
const INDIVIDUAL_JSON = resolve(TID_DIR, 'individual-signature.json')
const RESULT_JSON = resolve(SDK_BASE, 'spec/final_confirmation_test_data.json')

export interface SpecSlot {
  送信番号: string
  到達番号: string
}

export interface SpecTestDataEntry {
  format: 'standard' | 'individual'
  proc_id: string
  proc_name: string
  data_state: string
  status: string
  remarks: string
  slots: { '1': SpecSlot; '2': SpecSlot; '3': SpecSlot }
  updatedAt: string | null
}

interface OriginalEntry {
  手続識別子: string
  手続名: string
  データの状態: string
  ステータス: string
  備考: string
}

interface OriginalFile {
  category: string
  entries: OriginalEntry[]
}

function emptySlots(): SpecTestDataEntry['slots'] {
  return {
    '1': { 送信番号: '', 到達番号: '' },
    '2': { 送信番号: '', 到達番号: '' },
    '3': { 送信番号: '', 到達番号: '' },
  }
}

function readOriginals(): SpecTestDataEntry[] {
  const std = JSON.parse(readFileSync(STANDARD_JSON, 'utf-8')) as OriginalFile
  const ind = JSON.parse(readFileSync(INDIVIDUAL_JSON, 'utf-8')) as OriginalFile
  const toEntry = (o: OriginalEntry, format: 'standard' | 'individual'): SpecTestDataEntry => ({
    format,
    proc_id: o.手続識別子,
    proc_name: o.手続名,
    data_state: o.データの状態,
    status: o.ステータス,
    remarks: o.備考,
    slots: emptySlots(),
    updatedAt: null,
  })
  return [
    ...std.entries.map(o => toEntry(o, 'standard')),
    ...ind.entries.map(o => toEntry(o, 'individual')),
  ]
}

export function loadSpecTestData(): SpecTestDataEntry[] {
  const merged = readOriginals()
  if (!existsSync(RESULT_JSON)) return merged
  const saved = JSON.parse(readFileSync(RESULT_JSON, 'utf-8')) as SpecTestDataEntry[]
  const map = new Map(saved.map(e => [e.proc_id, e]))
  for (const e of merged) {
    const s = map.get(e.proc_id)
    if (s) {
      e.slots = s.slots
      e.updatedAt = s.updatedAt
    }
  }
  return merged
}

export default defineEventHandler(() => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 403, message: 'dev only' })
  }
  return { entries: loadSpecTestData(), resultPath: RESULT_JSON }
})
