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
/**
 * 导入依赖
 * - NButton: Naive UI 按钮组件
 * - NCard: Naive UI 卡片组件
 */
import { NButton, NCard } from "naive-ui";
import type { SelectedFile } from "../types/logTypes";

/**
 * 组件属性定义
 * @property {SelectedFile[]} selectedFiles - 已选择的文件列表
 * @property {Function} formatSize - 文件大小格式化函数
 */
defineProps<{
  selectedFiles: SelectedFile[];
  formatSize: (value: number) => string;
}>();

/**
 * 组件事件定义
 * @event remove - 移除指定索引的文件
 * @event clear - 清空所有已选择的文件
 */
const emit = defineEmits<{
  (e: "remove", index: number): void;
  (e: "clear"): void;
}>();
</script>

<!--
  模板部分
  - 卡片容器，标题栏包含清空按钮
  - 文件列表，每行显示文件信息和移除按钮
  - 空状态提示
-->
<template>
  <n-card
    class="panel file-list-panel"
    size="small"
  >
    <!-- 标题栏 -->
    <template #header>
      <div class="header-content">
        <span>文件列表</span>
        <!-- 全部移除按钮 -->
        <n-button
          v-if="selectedFiles.length > 0"
          size="tiny"
          type="error"
          @click="emit('clear')"
        >
          全部移除
        </n-button>
      </div>
    </template>
    <!-- 空状态 -->
    <div
      v-if="selectedFiles.length === 0"
      class="empty"
    >
      请先选择日志/配置文件
    </div>
    <!-- 文件列表 -->
    <div
      v-else
      class="file-list-wrapper"
    >
      <ul class="file-list">
        <li
          v-for="(file, index) in selectedFiles"
          :key="file.name"
          class="file-row"
        >
          <!-- 文件名 -->
          <div class="file-name">
            {{ file.name }}
          </div>
          <!-- 文件大小 -->
          <div class="file-meta">
            {{ formatSize(file.size) }}
          </div>
          <!-- 文件类型 -->
          <div class="file-meta">
            {{ file.type }}
          </div>
          <!-- 移除按钮 -->
          <div class="file-action">
            <n-button
              size="tiny"
              secondary
              type="error"
              @click="emit('remove', index)"
            >
              移除
            </n-button>
          </div>
        </li>
      </ul>
    </div>
  </n-card>
</template>

<!--
  样式部分
  - 标题栏布局：标题和按钮两端对齐
-->
<style scoped>
.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
</style>
