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
import { NButton, NCard, NProgress, NSwitch, NTooltip, NPopover } from "naive-ui";
import type { SelectedFile } from "@/types/logTypes";

type ParseState = "idle" | "ready" | "parsing" | "done";

defineProps<{
  selectedFiles: SelectedFile[];
  totalSize: number;
  parseState: ParseState;
  parseProgress: number;
  statusMessage: string;
  taskCount?: number;
  auxLogCount?: number;
  isDragging: boolean;
  formatSize: (value: number) => string;
  isAutoRefresh?: boolean;
  autoRefreshProject?: string;
  autoRefreshDir?: string;
  showAutoRefresh?: boolean;
}>();

const emit = defineEmits<{
  (e: "select-directory"): void;
  (e: "drag-over", event: DragEvent): void;
  (e: "drag-enter", event: DragEvent): void;
  (e: "drag-leave", event: DragEvent): void;
  (e: "drop", event: DragEvent): void;
  (e: "toggle-auto-refresh"): void;
  (e: "remove-file", index: number): void;
  (e: "clear-files"): void;
}>();
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
      <div class="actions">
        <!-- 目录选择按钮 -->
        <NButton size="small" @click="emit('select-directory')">📂 选择日志目录</NButton>
        <!-- 自动刷新开关 - 常驻显示 -->
        <div v-if="showAutoRefresh" class="auto-refresh-toggle">
          <NSwitch
            :value="isAutoRefresh"
            size="small"
            :disabled="!autoRefreshDir"
            @update:value="emit('toggle-auto-refresh')"
          />
          <NTooltip trigger="hover">
            <template #trigger>
              <span class="auto-refresh-label">实时监控</span>
            </template>
            开启后自动检测日志目录中的新任务，无需手动刷新。
          </NTooltip>
          <span v-if="autoRefreshDir && autoRefreshProject !== 'unknown'" class="auto-refresh-info"
            >({{ autoRefreshProject }}: {{ autoRefreshDir }})</span
          >
        </div>
      </div>
      <!-- 提示 -->
      <div class="drag-hint">
        <div class="hint-line" style="font-weight: bold">
          💡 请选择日志根目录，以便导入 maa.log、Custom 日志、vision目录、on_error目录！！！
        </div>
        <div class="hint-line">📂 支持拖拽导入（日志压缩包或日志目录），选择后自动解析</div>
      </div>
    </div>
    <!-- 状态信息卡片 -->
    <NCard class="hero-card" size="small">
      <template #header>
        <div class="hero-card-header">
          <!-- 左侧：文件列表按钮 -->
          <div class="file-section">
            <NPopover trigger="hover" placement="bottom-start" :show-arrow="false" :style="{ padding: '6px 0' }">
              <template #trigger>
                <div class="file-list-btn">
                  <span class="file-icon">📁</span>
                  <span class="file-label">文件列表</span>
                  <span v-if="selectedFiles.length > 0" class="file-badge">{{ selectedFiles.length }}</span>
                </div>
              </template>
              <div class="file-dropdown">
                <div v-if="selectedFiles.length === 0" class="empty-tip">请先选择日志目录</div>
                <ul v-else class="file-list">
                  <li v-for="(file, index) in selectedFiles" :key="file.name" class="file-item">
                    <span class="file-name" :title="file.path">{{ file.path || file.name }}</span>
                    <span class="file-size">{{ formatSize(file.size) }}</span>
                    <n-button size="tiny" quaternary type="error" @click="emit('remove-file', index)">移除</n-button>
                  </li>
                </ul>
              </div>
            </NPopover>
            <n-button v-if="selectedFiles.length > 0" size="tiny" type="error" quaternary @click="emit('clear-files')">清空</n-button>
          </div>
          <!-- 右侧：统计 -->
          <div class="stats-section">
            <span class="stat-item">大小 <strong>{{ formatSize(totalSize) }}</strong></span>
            <template v-if="taskCount">
              <span class="stat-divider">|</span>
              <span class="stat-item">任务 <strong>{{ taskCount }}</strong></span>
            </template>
            <template v-if="auxLogCount">
              <span class="stat-divider">|</span>
              <span class="stat-item">Custom 日志 <strong>{{ auxLogCount }}</strong></span>
            </template>
          </div>
        </div>
      </template>
      <!-- 解析进度条 -->
      <NProgress v-if="parseState === 'parsing'" :percentage="parseProgress" processing />
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
  align-items: center;
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
  align-items: center;
}

.auto-refresh-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color-2);
}

.auto-refresh-label {
  font-weight: 500;
}

.auto-refresh-info {
  color: var(--n-text-color-3);
  font-size: 11px;
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

.hero-card :deep(.n-card__header) {
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.hero-card :deep(.n-card__content) {
  padding: 8px 16px;
}

.hero-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.file-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-list-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f8f8f8 100%);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--n-text-color-1);
}

.file-list-btn:hover {
  background: linear-gradient(180deg, #f8f8f8 0%, #f0f0f0 100%);
}

.file-icon {
  font-size: 14px;
}

.file-label {
  font-size: 13px;
  font-weight: 500;
}

.file-badge {
  background: rgba(255, 255, 255, 0.3);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.stats-section {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-item strong {
  color: var(--n-text-color-1);
}

.stat-divider {
  color: var(--n-color-border);
}

.status-icon {
  cursor: pointer;
  font-size: 14px;
  margin-left: 4px;
}

.file-dropdown {
  min-width: 360px;
  max-height: 280px;
  overflow-y: auto;
}

.file-dropdown .empty-tip {
  padding: 16px;
  text-align: center;
  color: var(--n-text-color-3);
  font-size: 13px;
}

.file-dropdown .file-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-dropdown .file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.file-dropdown .file-item:last-child {
  border-bottom: none;
}

.file-dropdown .file-item:hover {
  background: var(--n-color-hover);
}

.file-dropdown .file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.file-dropdown .file-size {
  font-size: 12px;
  color: var(--n-text-color-3);
  white-space: nowrap;
}

.hero-card :deep(.n-card__header),
.hero-card :deep(.n-card__content) {
  padding: 8px 12px;
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
