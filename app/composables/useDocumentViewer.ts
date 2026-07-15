import JSZip from 'jszip'

export interface ExtractedDocument {
  type: 'letter' | 'form'
  xmlFileName: string
  xslFileName: string
  renderedHtml: string
}

export interface ExtractedCsv {
  fileName: string
  content: string
}

export interface DocumentPackage {
  documents: ExtractedDocument[]
  csvFiles: ExtractedCsv[]
}

function findXslReference(xmlString: string): string | null {
  const match = xmlString.match(/<\?xml-stylesheet\s+[^?]*href\s*=\s*"([^"]+)"/)
  return match?.[1] ?? null
}

// iframe srcdoc に生 HTML として流すため、ZIP 由来のファイル名やエラー文言は
// 必ず HTML エスケープする (悪意ある ZIP からの XSS 防止)
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function transformXslt(xmlString: string, xslString: string): string {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlString, 'application/xml')
  const xslDoc = parser.parseFromString(xslString, 'application/xml')

  // DOMParser は失敗しても throw せず <parsererror> を埋め込むため明示的に検出する
  const parseErr
    = xmlDoc.querySelector('parsererror') ?? xslDoc.querySelector('parsererror')
  if (parseErr) {
    throw new Error(`XML/XSL の解析に失敗しました: ${parseErr.textContent?.trim() ?? ''}`)
  }

  const processor = new XSLTProcessor()
  processor.importStylesheet(xslDoc)

  // e-Gov の XSL は <xsl:output method="html"/> を使う。transformToDocument は
  // HTML 出力メソッドのとき Blink では null を返し、serializeToString(null) が
  // "parameter 1 is not of type 'Node'" で落ちる。出力メソッドに依存しない
  // transformToFragment で DocumentFragment を得てシリアライズする。
  const fragment = processor.transformToFragment(xmlDoc, document)
  if (!fragment) {
    throw new Error('XSLT 変換結果が空でした')
  }

  const serializer = new XMLSerializer()
  return Array.from(fragment.childNodes)
    .map(node => serializer.serializeToString(node))
    .join('')
}

function classifyXml(fileName: string): 'letter' | 'form' {
  // kagami.xsl を参照する XML は通知書、AS*.xsl を参照するのは申請書フォーム
  // ファイル名パターン: *E29000.xml = 通知書, AD*.xml = フォーム
  if (/^AD/i.test(fileName)) return 'form'
  return 'letter'
}

async function processDocumentZip(zip: JSZip): Promise<DocumentPackage> {
  const files = Object.keys(zip.files).filter(name => !zip.files[name]!.dir)

  // ファイル内容を全て読み込み
  const fileContents = new Map<string, string>()
  const binaryContents = new Map<string, ArrayBuffer>()

  await Promise.all(
    files.map(async (name) => {
      const baseName = name.split('/').pop()!
      if (name.endsWith('.csv')) {
        const buf = await zip.file(name)!.async('arraybuffer')
        binaryContents.set(baseName, buf)
      } else {
        const text = await zip.file(name)!.async('string')
        fileContents.set(baseName, text)
      }
    }),
  )

  // XML ファイルを探して XSL と紐付け
  const documents: ExtractedDocument[] = []
  for (const [fileName, content] of fileContents) {
    if (!fileName.endsWith('.xml')) continue

    const xslRef = findXslReference(content)
    if (!xslRef) continue

    const xslContent = fileContents.get(xslRef)
    if (!xslContent) continue

    // 1 文書の変換失敗で ZIP 全体を落とさない（他の文書 / CSV は表示する）
    let renderedHtml: string
    try {
      renderedHtml = transformXslt(content, xslContent)
    } catch (e) {
      renderedHtml = `<p style="color:#c00;padding:1rem">「${escapeHtml(fileName)}」の変換に失敗しました: ${
        escapeHtml(e instanceof Error ? e.message : String(e))
      }</p>`
    }
    documents.push({
      type: classifyXml(fileName),
      xmlFileName: fileName,
      xslFileName: xslRef,
      renderedHtml,
    })
  }

  // CSV ファイルをデコード
  const csvFiles: ExtractedCsv[] = []
  for (const [fileName, buf] of binaryContents) {
    const decoder = new TextDecoder('shift-jis')
    csvFiles.push({ fileName, content: decoder.decode(buf) })
  }

  return { documents, csvFiles }
}

export function useDocumentViewer() {
  const documentPackage = ref<DocumentPackage | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const letters = computed(
    () => documentPackage.value?.documents.filter(d => d.type === 'letter') ?? [],
  )
  const forms = computed(
    () => documentPackage.value?.documents.filter(d => d.type === 'form') ?? [],
  )
  const csvFiles = computed(
    () => documentPackage.value?.csvFiles ?? [],
  )

  async function processFile(file: File) {
    loading.value = true
    error.value = null
    documentPackage.value = null

    try {
      const buffer = await file.arrayBuffer()
      const outerZip = await JSZip.loadAsync(buffer)

      // 内側 ZIP を探す（二重 ZIP 対応）
      const innerZipEntries = Object.keys(outerZip.files).filter(
        name => name.endsWith('.zip'),
      )

      let targetZip: JSZip
      if (innerZipEntries.length > 0) {
        const innerBuffer = await outerZip.file(innerZipEntries[0]!)!.async('arraybuffer')
        targetZip = await JSZip.loadAsync(innerBuffer)
      } else {
        targetZip = outerZip
      }

      documentPackage.value = await processDocumentZip(targetZip)

      if (documentPackage.value.documents.length === 0) {
        error.value = 'ZIP内に公文書（XML + XSL）が見つかりませんでした'
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'ZIPファイルの処理に失敗しました'
    } finally {
      loading.value = false
    }
  }

  function reset() {
    documentPackage.value = null
    error.value = null
  }

  return {
    documentPackage,
    loading,
    error,
    letters,
    forms,
    csvFiles,
    processFile,
    reset,
  }
}
