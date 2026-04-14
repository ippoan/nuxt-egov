import { parsePfx } from '~/utils/xmldsig/pfx'
import { signKousei } from '~/utils/xmldsig/sign'
import type { ParsedPfx } from '~/utils/xmldsig/types'

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

  function signKouseiXml(
    kouseiXml: string,
    applicationFiles: Map<string, string | Uint8Array>,
  ): string {
    if (!parsedPfx.value) {
      throw new Error('PFX証明書が読み込まれていません')
    }
    return signKousei(kouseiXml, applicationFiles, parsedPfx.value)
  }

  return {
    pfxLoaded: readonly(pfxLoaded),
    certSubject: readonly(certSubject),
    loadPfx,
    signKouseiXml,
  }
}
