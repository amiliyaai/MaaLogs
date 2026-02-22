<script setup lang="ts">
import { NButton, NCard, NProgress } from "naive-ui";
import type { SelectedFile } from "../types/logTypes";

type ParseState = "idle" | "ready" | "parsing" | "done";

defineProps<{
  selectedFiles: SelectedFile[];
  totalSize: number;
  parseState: ParseState;
  parseProgress: number;
  statusMessage: string;
  isDragging: boolean;
  formatSize: (value: number) => string;
}>();

const emit = defineEmits<{
  (e: "file-change", event: Event): void;
  (e: "parse"): void;
  (e: "drag-over", event: DragEvent): void;
  (e: "drag-enter", event: DragEvent): void;
  (e: "drag-leave", event: DragEvent): void;
  (e: "drop", event: DragEvent): void;
}>();

const emitParse = () => emit("parse");
</script>

<template>
  <section
    class="hero"
    :class="{ 'drop-active': isDragging }"
    @dragover="emit('drag-over', $event)"
    @dragenter="emit('drag-enter', $event)"
    @dragleave="emit('drag-leave', $event)"
    @drop="emit('drop', $event)"
  >
    <div class="hero-text">
      <h1>快速定位任务节点与异常</h1>
      <div class="actions">
        <label class="upload">
          <NButton size="small">选择日志文件</NButton>
          <input type="file" multiple accept=".log,.json,.zip" @change="emit('file-change', $event)" />
        </label>
        <NButton
          type="primary"
          size="small"
          :disabled="parseState === 'parsing' || selectedFiles.length === 0"
          @click="emitParse"
        >
          {{ parseState === "parsing" ? "解析中…" : "开始解析" }}
        </NButton>
      </div>
      <div class="drag-hint">导入 maa.log 或 pipeline.json，支持拖拽导入(包括日志压缩包或日志目录)</div>
    </div>
    <NCard class="hero-card" size="small">
      <template #header>当前选择</template>
      <div class="card-stat">
        <div class="card-stat-item">
          <span>文件数量</span>
          <strong>{{ selectedFiles.length }}</strong>
        </div>
        <span class="card-stat-divider">·</span>
        <div class="card-stat-item">
          <span>总大小</span>
          <strong>{{ formatSize(totalSize) }}</strong>
        </div>
      </div>
      <NProgress v-if="parseState === 'parsing'" :percentage="parseProgress" processing />
      <div class="card-hint">{{ statusMessage }}</div>
    </NCard>
  </section>
</template>
