<!--
@component HeroPanel
@description 首页主面板组件，提供文件选择、拖拽上传和解析控制功能
@author MaaLogs Team
@license MIT

@summary
该组件是应用的核心入口面板，包含：
- 文件选择按钮和拖拽上传区域
- 解析进度显示
- 当前选择文件的状态信息

@emits select-directory - 目录选择事件
@emits parse - 开始解析事件
@emits drag-over - 拖拽悬停事件
@emits drag-enter - 拖拽进入事件
@emits drag-leave - 拖拽离开事件
@emits drop - 拖拽放置事件

@example
<HeroPanel
  :selected-files="files"
  :total-size="totalSize"
  :parse-state="parseState"
  :parse-progress="progress"
  :status-message="message"
  :is-dragging="isDragging"
  :format-size="formatSize"
  @file-change="handleFileChange"
  @parse="handleParse"
/>
-->

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
  (e: "select-directory"): void;
  (e: "parse"): void;
  (e: "drag-over", event: DragEvent): void;
  (e: "drag-enter", event: DragEvent): void;
  (e: "drag-leave", event: DragEvent): void;
  (e: "drop", event: DragEvent): void;
}>();

const emitParse = () => emit("parse");
</script>

<!--
  模板部分
  - 主区域支持拖拽上传
  - 包含文件选择按钮和解析按钮
  - 显示当前选择的文件信息和解析进度
-->
<template>
  <section
    class="hero"
    :class="{ 'drop-active': isDragging }"
    @dragover="emit('drag-over', $event)"
    @dragenter="emit('drag-enter', $event)"
    @dragleave="emit('drag-leave', $event)"
    @drop="emit('drop', $event)"
  >
    <!-- 主标题和操作区域 -->
    <div class="hero-text">
      <h1>📊 日志解析 · 任务与节点可视化</h1>
      <div class="actions">
        <!-- 目录选择按钮 -->
        <NButton size="small" @click="emit('select-directory')">📂 选择日志目录</NButton>
        <!-- 解析按钮 -->
        <NButton
          type="primary"
          size="small"
          :disabled="parseState === 'parsing' || selectedFiles.length === 0"
          @click="emitParse"
        >
          {{ parseState === "parsing" ? "解析中…" : "开始解析" }}
        </NButton>
      </div>
      <!-- 提示 -->
      <div class="drag-hint">
        <div class="hint-line" style="font-weight: bold">💡 请选择日志根目录，以便导入 maa.log、Custom 日志、错误截图！！！</div>
        <div class="hint-line">📂 支持拖拽导入（日志压缩包或日志目录）</div>
      </div>
    </div>
    <!-- 状态信息卡片 -->
    <NCard class="hero-card" size="small">
      <template #header>
        <span>当前选择：</span>
        <span class="card-stat-divider">|</span>
        <span
          >文件数量 <strong>{{ selectedFiles.length }}</strong></span
        >
        <span class="card-stat-divider">|</span>
        <span
          >总大小 <strong>{{ formatSize(totalSize) }}</strong></span
        >
      </template>
      <!-- 解析进度条 -->
      <NProgress v-if="parseState === 'parsing'" :percentage="parseProgress" processing />
      <!-- 状态消息 -->
      <div class="card-hint">
        {{ statusMessage }}
      </div>
    </NCard>
  </section>
</template>

<!--
  样式部分
  - 解析器选择区域布局
  - 标签样式
-->
<style scoped>
.hero {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 12px;
  position: relative;
  flex-shrink: 0;
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-text h1 {
  font-size: 20px;
  margin: 0;
}

.hero-subtitle {
  color: var(--n-text-color-2);
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.drag-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--n-text-color-3);
}

.hint-line {
  margin: 2px 0;
}

.hint-line code {
  background: var(--n-color-modal);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: "Consolas", "Monaco", monospace;
}

.hint-line.highlight {
  color: var(--n-primary-color);
  font-weight: 500;
}

.upload {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.hero-card {
  background: var(--n-color-modal);
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
}

.hero-card :deep(.n-card__header),
.hero-card :deep(.n-card__content) {
  padding: 8px 12px;
}

.card-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.card-stat-divider {
  color: var(--n-text-color-3);
  margin: 0 4px;
}

.hero.drop-active {
  outline: 2px dashed var(--n-primary-color);
  outline-offset: 6px;
  border-radius: 16px;
}

@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
  }
}
</style>
