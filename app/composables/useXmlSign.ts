import { parsePfx } from '~/utils/xmldsig/pfx'
import { signConfig, signKousei } from '~/utils/xmldsig/sign'
import type { ParsedPfx } from '~/utils/xmldsig/types'

// 検証環境テスト用証明書 (e-GovEE01_sha2.pfx, pw: gpkitest)
const TEST_PFX_BASE64 = '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'
const TEST_PFX_PASSWORD = 'gpkitest'

export function useXmlSign() {
  const pfxLoaded = useState('xmlsign-pfx-loaded', () => false)
  const certSubject = useState('xmlsign-cert-subject', () => '')
  const parsedPfx = useState<ParsedPfx | null>('xmlsign-parsed-pfx', () => null)

  async function loadPfx(file: File, password: string): Promise<void> {
    const arrayBuffer = await file.arrayBuffer()
    const result = parsePfx(arrayBuffer, password)
    parsedPfx.value = result
    certSubject.value = result.certSubject
    pfxLoaded.value = true
  }

  function loadTestPfx(): void {
    if (pfxLoaded.value) return
    const binary = atob(TEST_PFX_BASE64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const result = parsePfx(bytes.buffer, TEST_PFX_PASSWORD)
    parsedPfx.value = result
    certSubject.value = result.certSubject
    pfxLoaded.value = true
  }

  // 追加証明書（連署用）
  const extraPfxList = useState<ParsedPfx[]>('xmlsign-extra-pfx', () => [])

  function loadExtraPfx(file: File, password: string): Promise<void> {
    return file.arrayBuffer().then((buf) => {
      const result = parsePfx(buf, password)
      extraPfxList.value = [...extraPfxList.value, result]
    })
  }

  function signKouseiXml(
    kouseiXml: string,
    applicationFiles: Map<string, string | Uint8Array>,
    signatureCount = 1,
  ): string {
    if (!parsedPfx.value) {
      throw new Error('PFX証明書が読み込まれていません')
    }
    if (signatureCount <= 1) {
      return signKousei(kouseiXml, applicationFiles, parsedPfx.value)
    }
    // 連署: メイン証明書 + extraPfxList から必要数を取得
    const pfxList: ParsedPfx[] = [parsedPfx.value, ...extraPfxList.value]
    if (pfxList.length < signatureCount) {
      console.warn(`署名者数 ${signatureCount} に対して証明書 ${pfxList.length} 個しかありません。足りない分は最初の証明書で代用します`)
      while (pfxList.length < signatureCount) pfxList.push(parsedPfx.value)
    }
    return signKousei(kouseiXml, applicationFiles, parsedPfx.value, pfxList.slice(0, signatureCount))
  }

  function signConfigXml(
    configXml: string,
    referencedFileName: string,
    referencedFileContent: string | Uint8Array,
  ): string {
    if (!parsedPfx.value) {
      throw new Error('PFX証明書が読み込まれていません')
    }
    return signConfig(configXml, referencedFileName, referencedFileContent, parsedPfx.value)
  }

  return {
    pfxLoaded: readonly(pfxLoaded),
    certSubject: readonly(certSubject),
    extraPfxCount: computed(() => extraPfxList.value.length),
    loadPfx,
    loadTestPfx,
    loadExtraPfx,
    signKouseiXml,
    signConfigXml,
  }
}
