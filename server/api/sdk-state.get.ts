import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(() => {
  const sdkBase = '/home/yhonda/js/egov-shinsei-sdk'

  // 1. SDK テスト結果 (.test-state.json)
  const statePath = resolve(sdkBase, 'coverage/.test-state.json')
  const state: Record<string, string> = {}
  if (existsSync(statePath)) {
    const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith('zipBase64') && !k.startsWith('zipBuffer') &&
          !k.startsWith('procResult') && k !== 'accessToken' &&
          !k.startsWith('officialDoc')) {
        state[k] = String(v)
      }
    }
  }

  // 2. 最終確認試験用データ情報 (テスト手続マッピング)
  const testDataPath = resolve(sdkBase, 'spec/final_confirmation_test_data.json')
  let testData: any[] = []
  if (existsSync(testDataPath)) {
    testData = JSON.parse(readFileSync(testDataPath, 'utf-8'))
  }

  return { state, testData }
})
