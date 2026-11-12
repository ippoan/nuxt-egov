<script setup lang="ts">
const { loading, error, letters, forms, csvFiles, processFile, reset } = useDocumentViewer()

const fileInput = ref<HTMLInputElement>()
const dragover = ref(false)

function onDrop(e: DragEvent) {
  dragover.value = false
  const file = e.dataTransfer?.files[0]
  if (file) processFile(file)
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
}

function handleReset() {
  reset()
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <div class="container">
    <div class="header">
      <h1>公文書ビューア</h1>
      <NuxtLink to="/" class="btn btn-secondary">
        申請状況チェック
      </NuxtLink>
    </div>

    <!-- アップロードエリア -->
    <div
      v-if="!letters.length && !forms.length && !loading"
      class="upload-zone"
      :class="{ dragover }"
      @dragover.prevent="dragover = true"
      @dragleave="dragover = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".zip"
        hidden
        @change="onFileChange"
      >
      <p class="upload-icon">
        📂
      </p>
      <p class="upload-text">
        ZIPファイルをドロップまたはクリックして選択
      </p>
      <p class="upload-hint">
        e-Gov公文書ZIPファイル（二重ZIP対応）
      </p>
    </div>

    <!-- ローディング -->
    <div v-if="loading" class="loading">
      処理中...
    </div>

    <!-- エラー -->
    <p v-if="error" class="error">
      {{ error }}
    </p>

    <!-- 結果表示 -->
    <div v-if="letters.length || forms.length">
      <button class="btn btn-secondary reset-btn" @click="handleReset">
        別のファイルを開く
      </button>

      <DocumentPackageView :letters="letters" :forms="forms" :csv-files="csvFiles" />
    </div>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.upload-zone {
  border: 2px dashed #cbd5e0;
  border-radius: 8px;
  padding: 4rem 2rem;
  text-align: center;
  cursor: pointer;
  background: #fff;
  transition: border-color 0.2s, background 0.2s;
}

.upload-zone:hover,
.upload-zone.dragover {
  border-color: #2b6cb0;
  background: #ebf8ff;
}

.upload-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.upload-text {
  font-size: 1.1rem;
  color: #4a5568;
  margin-bottom: 0.5rem;
}

.upload-hint {
  font-size: 0.85rem;
  color: #a0aec0;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #4a5568;
  font-size: 1.1rem;
}

.reset-btn {
  margin-bottom: 1.5rem;
}
</style>
