<!--
@component FileListPanel
@description 文件列表面板组件，显示已选择的文件并支持移除操作
@author MaaLogs Team
@license MIT

@summary
该组件显示用户选择的所有文件列表，包含：
- 文件名称、大小、类型信息
- 单个文件移除按钮
- 全部移除按钮

@emits remove - 移除指定索引的文件
@emits clear - 清空所有文件

@example
<FileListPanel
  :selected-files="files"
  :format-size="formatSize"
  @remove="handleRemove"
  @clear="handleClear"
/>
-->

<script setup lang="ts">
import { NButton, NCard, NTooltip, NIcon } from "naive-ui";
import { QuestionCircleOutlined } from "@vicons/antd";
import type { SelectedFile } from "@/types/logTypes";
import { ref } from "vue";

defineProps<{
  selectedFiles: SelectedFile[];
  formatSize: (value: number) => string;
}>();

const emit = defineEmits<{
  (e: "remove", index: number): void;
  (e: "clear"): void;
}>();

const expanded = ref(false);
</script>

<template>
  <n-card class="panel file-list-panel" size="small">
    <template #header>
      <div class="header-content" @click="expanded = !expanded">
        <div class="header-left">
          <span class="expand-icon">{{ expanded ? "▼" : "▶" }}</span>
          <span class="header-title">📁 文件列表</span>
          <span class="header-count">{{ selectedFiles.length }} 个文件</span>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-icon class="help-icon" :component="QuestionCircleOutlined" />
            </template>
            建议每次选择新的日志目录前清空，否则只会覆盖同名日志
          </n-tooltip>
        </div>
        <n-button
          v-if="selectedFiles.length > 0"
          size="tiny"
          type="error"
          quaternary
          @click.stop="emit('clear')"
        >
          清空
        </n-button>
      </div>
    </template>

    <div v-show="expanded" class="file-list-wrapper">
      <div v-if="selectedFiles.length === 0" class="empty">请先选择日志/配置文件</div>
      <ul v-else class="file-list">
        <li v-for="(file, index) in selectedFiles" :key="file.name" class="file-row">
          <span class="file-path" :title="file.path">{{ file.path || file.name }}</span>
          <span class="file-meta">{{ formatSize(file.size) }}</span>
          <n-button size="tiny" quaternary type="error" @click="emit('remove', index)">
            移除
          </n-button>
        </li>
      </ul>
    </div>
  </n-card>
</template>

<style scoped>
.file-list-panel {
  flex: none !important;
  min-height: auto !important;
}

.file-list-panel :deep(.n-card__content) {
  padding: 0 !important;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  cursor: pointer;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expand-icon {
  font-size: 10px;
  color: var(--n-text-color-3);
}

.header-title {
  font-weight: 500;
}

.header-count {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.help-icon {
  font-size: 14px;
  color: var(--n-text-color-3);
  cursor: help;
}

.help-icon:hover {
  color: var(--n-text-color-2);
}

.file-list-wrapper {
  padding: 8px 12px;
  max-height: 200px;
  overflow-y: auto;
}

.empty {
  padding: 12px;
  text-align: center;
  color: var(--n-text-color-3);
  font-size: 12px;
}

.file-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.file-row:hover {
  background: var(--n-color-modal);
}

.file-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--n-text-color-2);
}

.file-meta {
  color: var(--n-text-color-3);
}

.file-type {
  padding: 1px 6px;
  background: var(--n-color-modal);
  border-radius: 4px;
  font-size: 11px;
  color: var(--n-text-color-2);
}
</style>
