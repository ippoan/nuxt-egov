import forge from 'node-forge'
import { canonicalize, canonicalizeById } from './c14n'
import type { SignatureOptions, SignatureReference } from './types'

const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#'
const C14N_ALGO = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const SIG_ALGO = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
const DIGEST_ALGO = 'http://www.w3.org/2001/04/xmlenc#sha256'

/**
 * XML-DSig 署名を生成し、<署名情報> ブロックの XML 文字列を返す
 */
export function createSignatureBlock(options: SignatureOptions): string {
  const { pfx, references } = options

  // 1. 各 Reference の DigestValue を��算
  const referenceXmls = references.map(ref => {
    const digestValue = computeDigest(ref)
    return buildReferenceXml(ref.uri, digestValue, ref.isXml)
  })

  // 2. SignedInfo XML を構築
  const signedInfoXml = buildSignedInfoXml(referenceXmls)

  // 3. SignedInfo を C14N → RSA-SHA256 署名
  const canonicalSignedInfo = canonicalize(signedInfoXml)
  const signatureValue = rsaSha256Sign(canonicalSignedInfo, pfx.privateKey)

  // 4. Signature Id = yyyyMMddHHmmss
  const now = new Date()
  const id = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0')

  // 5. 完全な ds:Signature XML を組立て
  return buildFullSignatureXml(id, signedInfoXml, signatureValue, pfx.certificateBase64)
}

/**
 * kousei.xml に署名ブロッ���を挿入する
 * </構成情報> の後に <署名情報> ���挿入
 */
export function insertSignatureIntoKousei(kouseiXml: string, signatureBlockXml: string): string {
  const insertPoint = '</構成情報>'
  const idx = kouseiXml.lastIndexOf(insertPoint)
  if (idx === -1) {
    throw new Error('kousei.xml に </構成情報> タグが見つかりません')
  }
  const after = idx + insertPoint.length
  return kouseiXml.substring(0, after)
    + '\n\t\t' + signatureBlockXml
    + kouseiXml.substring(after)
}

/**
 * kousei.xml の構成情報要素と申請書ファイルから署名付き kousei.xml を返す
 */
export function signKousei(
  kouseiXml: string,
  applicationFiles: Map<string, string | Uint8Array>,
  pfx: SignatureOptions['pfx'],
): string {
  const references: SignatureReference[] = []

  // Reference 1: 構成情報要素 (URI="#��成情報")
  // C14N Transform 付き — in-document reference なので canonicalize が必要
  const canonicalizedKouseiInfo = canonicalizeById(kouseiXml, '構成情報')
  references.push({
    uri: '#構成情報',
    content: canonicalizedKouseiInfo,
    isXml: true, // Transform タグを出力
  })

  // Reference 2+: 申請書XMLファイル（ZIP内のファイルはそのまま hash）
  for (const [fileName, content] of applicationFiles) {
    references.push({ uri: fileName, content, isXml: false })
  }

  const signatureBlock = createSignatureBlock({ pfx, references })
  return insertSignatureIntoKousei(kouseiXml, signatureBlock)
}

// --- Internal helpers ---

function computeDigest(ref: SignatureReference): string {
  let bytes: string

  if (typeof ref.content === 'string') {
    if (ref.isXml && !ref.uri.startsWith('#')) {
      // 外部XMLファイルで Transform 指定がある場合は C14N してから hash
      bytes = canonicalize(ref.content)
    } else {
      // #構成情報 は既に canonicalize 済み / バイナリは直接
      bytes = ref.content
    }
  } else {
    // Uint8Array
    bytes = String.fromCharCode(...ref.content)
  }

  const md = forge.md.sha256.create()
  md.update(bytes, 'raw')
  return forge.util.encode64(md.digest().getBytes())
}

function rsaSha256Sign(data: string, privateKey: forge.pki.rsa.PrivateKey): string {
  const md = forge.md.sha256.create()
  md.update(data, 'raw')
  const signature = privateKey.sign(md)
  return forge.util.encode64(signature)
}

function buildReferenceXml(uri: string, digestValue: string, hasTransform: boolean): string {
  const transformBlock = hasTransform
    ? `<ds:Transforms><ds:Transform Algorithm="${C14N_ALGO}"/></ds:Transforms>`
    : ''
  return `<ds:Reference URI="${escapeXmlAttr(uri)}">`
    + transformBlock
    + `<ds:DigestMethod Algorithm="${DIGEST_ALGO}"/>`
    + `<ds:DigestValue>${digestValue}</ds:DigestValue>`
    + `</ds:Reference>`
}

function buildSignedInfoXml(referenceXmls: string[]): string {
  return `<ds:SignedInfo xmlns:ds="${DSIG_NS}">`
    + `<ds:CanonicalizationMethod Algorithm="${C14N_ALGO}"/>`
    + `<ds:SignatureMethod Algorithm="${SIG_ALGO}"/>`
    + referenceXmls.join('')
    + `</ds:SignedInfo>`
}

function buildFullSignatureXml(
  id: string,
  signedInfoXml: string,
  signatureValue: string,
  certificateBase64: string,
): string {
  // SignedInfo から xmlns:ds を除去（親の ds:Signature が宣言するため）
  const signedInfoInner = signedInfoXml.replace(` xmlns:ds="${DSIG_NS}"`, '')

  return `<署名情報>`
    + `<ds:Signature xmlns:ds="${DSIG_NS}" Id="${id}">`
    + signedInfoInner
    + `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>`
    + `<ds:KeyInfo>`
    + `<ds:X509Data>`
    + `<ds:X509Certificate>${certificateBase64}</ds:X509Certificate>`
    + `</ds:X509Data>`
    + `</ds:KeyInfo>`
    + `</ds:Signature>`
    + `</署名情報>`
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}
