<script setup lang="ts">
import type { ExtractedCsv, ExtractedDocument } from '~/composables/useDocumentViewer'

// 公文書 ZIP を読んだ結果 (通知書・申請書フォーム・添付 CSV) を描画する。
// 公文書ビューア (ZIP を選ぶ) と申請の詳細画面 (e-Gov API から取る) で共用。
defineProps<{
  letters: ExtractedDocument[]
  forms: ExtractedDocument[]
  csvFiles: ExtractedCsv[]
}>()

// iframe 高さ自動調整
function onLetterLoad(e: Event) {
  const iframe = e.target as HTMLIFrameElement
  try {
    const height = iframe.contentDocument?.documentElement.scrollHeight
    if (height) iframe.style.height = `${height + 32}px`
  } catch {
    // cross-origin の場合は無視
  }
}

// フォーム iframe のスケール計算
const rootRef = ref<HTMLElement>()
const formScale = ref(1)

function updateFormScale() {
  const w = rootRef.value?.clientWidth ?? 1121
  formScale.value = Math.min(1, w / 1121)
}

onMounted(() => {
  updateFormScale()
  window.addEventListener('resize', updateFormScale)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateFormScale)
})
</script>

<template>
  <div ref="rootRef">
    <!-- 通知書 -->
    <section v-for="(doc, i) in letters" :key="`letter-${i}`" class="doc-section">
      <h2>通知書</h2>
      <iframe
        :srcdoc="doc.renderedHtml"
        class="letter-frame"
        @load="onLetterLoad"
      />
    </section>

    <!-- 申請書フォーム -->
    <section v-for="(doc, i) in forms" :key="`form-${i}`" class="doc-section">
      <h2>申請書データ</h2>
      <div class="form-container">
        <iframe
          :srcdoc="doc.renderedHtml"
          class="form-frame"
          width="1121"
          height="793"
          :style="{
            transform: `scale(${formScale})`,
            transformOrigin: 'top left',
          }"
        />
      </div>
    </section>

    <!-- CSV -->
    <section v-if="csvFiles.length" class="doc-section">
      <h2>添付データ (CSV)</h2>
      <div v-for="(csv, i) in csvFiles" :key="`csv-${i}`" class="csv-section">
        <h3>{{ csv.fileName }}</h3>
        <pre class="csv-content">{{ csv.content }}</pre>
      </div>
    </section>
  </div>
</template>

<style scoped>
.doc-section {
  margin-bottom: 2rem;
}

.doc-section h2 {
  font-size: 1.1rem;
  color: #2d3748;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e2e8f0;
}

.letter-frame {
  width: 100%;
  min-height: 300px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fff;
}

.form-container {
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fff;
}

.form-frame {
  border: none;
  display: block;
}

.csv-section h3 {
  font-size: 0.9rem;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.csv-content {
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 1rem;
  overflow-x: auto;
  font-size: 0.8rem;
  line-height: 1.5;
}
</style>
