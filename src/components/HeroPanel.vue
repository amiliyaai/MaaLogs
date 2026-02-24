<!--
@component HeroPanel
@description 首页主面板组件，提供文件选择、拖拽上传和解析控制功能
@author MaaLogs Team
@license MIT

@summary
该组件是应用的核心入口面板，包含：
- 文件选择按钮和拖拽上传区域
- 解析器选择下拉框
- 解析进度显示
- 当前选择文件的状态信息

@emits file-change - 文件选择变更事件
@emits parse - 开始解析事件
@emits drag-over - 拖拽悬停事件
@emits drag-enter - 拖拽进入事件
@emits drag-leave - 拖拽离开事件
@emits drop - 拖拽放置事件
@emits update:selectedParserId - 解析器选择变更事件

@example
<HeroPanel
  :selected-files="files"
  :total-size="totalSize"
  :parse-state="parseState"
  :parse-progress="progress"
  :status-message="message"
  :is-dragging="isDragging"
  :format-size="formatSize"
  :parser-options="parsers"
  :selected-parser-id="parserId"
  @file-change="handleFileChange"
  @parse="handleParse"
  @update:selected-parser-id="handleParserChange"
/>
-->

<script setup lang="ts">
/**
 * 导入依赖
 * - NButton: Naive UI 按钮组件
 * - NCard: Naive UI 卡片组件
 * - NProgress: Naive UI 进度条组件
 * - NSelect: Naive UI 选择器组件
 */
import { NButton, NCard, NProgress, NSelect } from "naive-ui";
import type { SelectedFile } from "../types/logTypes";
import type { AuxLogParserInfo } from "../parsers";

/**
 * 解析状态类型定义
 * @typedef {'idle' | 'ready' | 'parsing' | 'done'} ParseState
 * - idle: 空闲状态，未选择文件
 * - ready: 就绪状态，已选择文件等待解析
 * - parsing: 解析中
 * - done: 解析完成
 */
type ParseState = "idle" | "ready" | "parsing" | "done";

/**
 * 组件属性定义
 * @property {SelectedFile[]} selectedFiles - 已选择的文件列表
 * @property {number} totalSize - 已选择文件的总大小（字节）
 * @property {ParseState} parseState - 当前解析状态
 * @property {number} parseProgress - 解析进度（0-100）
 * @property {string} statusMessage - 状态提示消息
 * @property {boolean} isDragging - 是否正在拖拽文件
 * @property {Function} formatSize - 文件大小格式化函数
 * @property {AuxLogParserInfo[]} parserOptions - 可用的Custom日志解析器列表
 * @property {string} selectedParserId - 当前选中的解析器 ID
 */
defineProps<{
  selectedFiles: SelectedFile[];
  totalSize: number;
  parseState: ParseState;
  parseProgress: number;
  statusMessage: string;
  isDragging: boolean;
  formatSize: (value: number) => string;
  parserOptions: AuxLogParserInfo[];
  selectedParserId: string;
}>();

/**
 * 组件事件定义
 * @event file-change - 文件输入框变更事件
 * @event parse - 点击解析按钮事件
 * @event drag-over - 拖拽悬停事件
 * @event drag-enter - 拖拽进入事件
 * @event drag-leave - 拖拽离开事件
 * @event drop - 拖拽放置事件
 * @event update:selectedParserId - 解析器选择变更事件
 */
const emit = defineEmits<{
  (e: "file-change", event: Event): void;
  (e: "parse"): void;
  (e: "drag-over", event: DragEvent): void;
  (e: "drag-enter", event: DragEvent): void;
  (e: "drag-leave", event: DragEvent): void;
  (e: "drop", event: DragEvent): void;
  (e: "update:selectedParserId", value: string): void;
}>();

/**
 * 发送解析事件
 * 触发父组件开始解析日志文件
 */
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
      <h1>快速定位任务节点与异常</h1>
      <div class="actions">
        <!-- 文件选择按钮（隐藏的 input） -->
        <label class="upload">
          <NButton size="small">选择日志文件</NButton>
          <input
            type="file"
            multiple
            accept=".log,.json,.zip"
            @change="emit('file-change', $event)"
          >
        </label>
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
      <!-- 拖拽提示 -->
      <div class="drag-hint">
        导入 maa.log 可选导入Custom日志，支持拖拽导入(包括日志压缩包或日志目录)
      </div>
    </div>
    <!-- 状态信息卡片 -->
    <NCard
      class="hero-card"
      size="small"
    >
      <template #header>
        <span>当前选择：</span>
        <span class="card-stat-divider">|</span>
        <span>文件数量 <strong>{{ selectedFiles.length }}</strong></span>
        <span class="card-stat-divider">|</span>
        <span>总大小 <strong>{{ formatSize(totalSize) }}</strong></span>
      </template>
      <!-- 解析器选择 -->
      <div class="parser-select">
        <span class="parser-label">Custom日志解析器：</span>
        <NSelect
          :value="selectedParserId"
          :options="parserOptions.map(p => ({ label: p.name, value: p.id }))"
          size="small"
          style="width: 160px"
          @update:value="emit('update:selectedParserId', $event)"
        />
      </div>
      <!-- 解析进度条 -->
      <NProgress
        v-if="parseState === 'parsing'"
        :percentage="parseProgress"
        processing
      />
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
.parser-select {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.parser-label {
  font-size: 12px;
  color: #6b7280;
}
</style>
