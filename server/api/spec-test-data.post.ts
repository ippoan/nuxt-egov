import { writeFileSync, renameSync } from 'fs'
import { resolve } from 'path'
import { loadSpecTestData, type SpecTestDataEntry } from './spec-test-data.get'

const SDK_BASE = '/home/yhonda/js/egov-shinsei-sdk'
const RESULT_JSON = resolve(SDK_BASE, 'spec/final_confirmation_test_data.json')

type SlotKey = '1' | '2' | '3'

interface UpdateBody {
  proc_id: string
  slot: 1 | 2 | 3
  送信番号?: string
  到達番号?: string
}

let writeQueue: Promise<SpecTestDataEntry[]> = Promise.resolve([])

function atomicWrite(entries: SpecTestDataEntry[]) {
  const tmp = RESULT_JSON + '.tmp'
  writeFileSync(tmp, JSON.stringify(entries, null, 2) + '\n', 'utf-8')
  renameSync(tmp, RESULT_JSON)
}

function applyUpdate(body: UpdateBody): SpecTestDataEntry {
  const entries = loadSpecTestData()
  const entry = entries.find(e => e.proc_id === body.proc_id)
  if (!entry) {
    throw createError({ statusCode: 400, message: `unknown proc_id: ${body.proc_id}` })
  }
  if (![1, 2, 3].includes(body.slot)) {
    throw createError({ statusCode: 400, message: `invalid slot: ${body.slot}` })
  }
  const slot = entry.slots[String(body.slot) as SlotKey]
  if (body.送信番号 !== undefined && body.送信番号 !== '') slot.送信番号 = body.送信番号
  if (body.到達番号 !== undefined && body.到達番号 !== '') slot.到達番号 = body.到達番号
  entry.updatedAt = new Date().toISOString()
  atomicWrite(entries)
  return entry
}

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 403, message: 'dev only' })
  }
  const body = await readBody<UpdateBody>(event)
  if (!body?.proc_id) {
    throw createError({ statusCode: 400, message: 'proc_id required' })
  }
  const run = writeQueue.then(() => applyUpdate(body)).catch((e) => { throw e })
  writeQueue = run.then(() => [] as SpecTestDataEntry[], () => [] as SpecTestDataEntry[])
  return await run
})
