<!--
  MaaLogs - Maa 框架日志分析器

  本文件是应用程序的主组件，负责：
  - 整合所有子组件
  - 管理全局状态
  - 处理文件选择和解析流程
  - 提供 Tauri 桌面环境集成

  @component App.vue
  @author MaaLogs Team
  @license MIT
-->

<script setup lang="ts">
/**
 * Vue 核心导入
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { NConfigProvider, NMessageProvider, createDiscreteApi } from "naive-ui";

/**
 * Tauri API 导入
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { appDataDir, appLogDir } from "@tauri-apps/api/path";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * 虚拟滚动样式
 */
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

const { message: $message } = createDiscreteApi(["message"], {
  configProviderProps: {
    theme: undefined
  }
});

/**
 * 子组件导入
 */
import AppTopBar from "./components/AppTopBar.vue";
import HeroPanel from "./components/HeroPanel.vue";
import FileListPanel from "./components/FileListPanel.vue";
import AnalysisPanel from "./components/AnalysisPanel.vue";
import SearchPanel from "./components/SearchPanel.vue";
import StatisticsPanel from "./components/StatisticsPanel.vue";

/**
 * Composables 导入
 */
import {
  useLogParser,
  setSelectedFiles,
  useSearch,
  useStatistics,
  useFileSelection,
  quickSearchOptions
} from "./composables";

/**
 * 工具函数导入
 */
import {
  formatSize,
  formatDuration,
  formatTaskStatus,
  formatTaskTimeParts,
  formatResultStatus,
  formatNextName,
  formatBox,
  formatAuxLevel,
  normalizeAuxLevel,
  summarizeBase,
  summarizeRecognition,
  summarizeNestedActions,
  summarizeNextList,
  summarizeNodeDetail,
  summarizeFocus,
  splitMatch
} from "./utils/format";
import { extractCustomActionFromActionDetails } from "./utils/parse";
import { isTauriEnv } from "./utils/file";
import { createLogger, init, flushLogs } from "./utils/logger";
import type { AuxLogEntry } from "./types/logTypes";

// ============================================
// 日志记录器
// ============================================

/** 应用日志记录器 */
const logger = createLogger("App");

// ============================================
// 视图状态
// ============================================

/** 当前视图模式：分析、搜索、统计 */
const viewMode = ref<"analysis" | "search" | "statistics">("analysis");

/** 当前选中的任务键 */
const selectedTaskKey = ref<string | null>(null);

/** 当前选中的节点 ID */
const selectedNodeId = ref<number | null>(null);

/** 选中的Custom日志级别 */
const selectedAuxLevels = ref<string[]>(["error", "warn", "info", "debug", "other"]);

/** 隐藏的调用者列表 */
const hiddenCallers = ref<string[]>([]);

/** 复制提示消息 */
const copyMessage = ref("");

// ============================================
// 虚拟滚动配置
// ============================================

/** 任务列表项高度 */
const taskItemHeight = 120;

/** 节点列表项高度 */
const nodeItemHeight = 72;

/** 搜索结果项高度 */
const searchItemHeight = 64;

// ============================================
// Composables 初始化
// ============================================

/**
 * 日志解析器
 * 提供日志解析、任务构建等功能
 */
const logParser = useLogParser();
const {
  parseState,
  parseProgress,
  statusMessage,
  tasks,
  rawLines,
  auxLogs,
  pipelineCustomActions,
  selectedParserId,
  parserOptions,
  selectedProcessId,
  selectedThreadId,
  processOptions,
  threadOptions,
  filteredTasks,
  handleParse,
  resetParseState
} = logParser;

/**
 * 文件选择器
 * 提供文件选择、拖拽等功能
 */
const fileSelector = useFileSelection((files) => {
  setSelectedFiles(files);
  if (files.length > 0) {
    parseState.value = "ready";
  } else {
    parseState.value = "idle";
  }
  resetParseState();
  searcherResetSearch();
});
const {
  selectedFiles,
  totalSize,
  isDragging,
  handleFileChange,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleRemoveSelectedFile,
  handleClearSelectedFiles,
  handleTauriDrop
} = fileSelector;

/**
 * 搜索器
 * 提供文本搜索功能
 */
const searcher = useSearch();
const {
  searchText,
  searchCaseSensitive,
  searchUseRegex,
  hideDebugInfo,
  searchMaxResults,
  searchResults,
  searchMessage,
  performSearch: searcherPerformSearch,
  resetSearch: searcherResetSearch
} = searcher;

/**
 * 统计器
 * 提供节点统计分析功能
 */
const statistics = useStatistics(() => tasks.value);
const {
  statSort,
  statKeyword,
  nodeStatistics,
  nodeSummary
} = statistics;

// ============================================
// 计算属性
// ============================================

/**
 * 当前选中的任务
 */
const selectedTask = computed(() => {
  if (!selectedTaskKey.value) return null;
  return filteredTasks.value.find(task => task.key === selectedTaskKey.value) || null;
});

/**
 * 当前选中的节点
 */
const selectedNode = computed(() => {
  if (!selectedTask.value || selectedNodeId.value === null) return null;
  return selectedTask.value.nodes.find(node => node.node_id === selectedNodeId.value) || null;
});

/**
 * 当前选中任务的节点列表
 */
const selectedTaskNodes = computed(() => selectedTask.value?.nodes || []);

/**
 * 当前选中节点的 Custom Actions
 */
const selectedNodeCustomActions = computed(() => {
  if (!selectedNode.value) return [];
  const name = selectedNode.value.name || selectedNode.value.node_details?.name;
  const items = (name && pipelineCustomActions.value[name]) || [];
  const fromLog = extractCustomActionFromActionDetails(selectedNode.value.action_details);
  if (fromLog && !items.some(item => item.name === fromLog)) {
    return [...items, { name: fromLog, fileName: "日志" }];
  }
  return items;
});

/**
 * 当前选中任务的Custom日志
 */
const selectedTaskAuxLogs = computed(() => {
  if (!selectedTask.value) return [];

  const taskKey = selectedTask.value.key;

  /**
   * 检查日志级别是否匹配
   */
  const matchesLevel = (log: AuxLogEntry) => {
    const normalizedLevel = normalizeAuxLevel(log.level);
    return selectedAuxLevels.value.includes(normalizedLevel);
  };

  /**
   * 检查调用者是否被隐藏
   */
  const matchesCaller = (log: AuxLogEntry) => {
    if (hiddenCallers.value.length === 0) return true;
    if (!log.caller) return true;
    return !hiddenCallers.value.some(hidden => log.caller?.includes(hidden));
  };

  return auxLogs.value.filter(
    log =>
      log.correlation?.status === "matched" &&
      log.correlation?.taskKey === taskKey &&
      matchesLevel(log) &&
      matchesCaller(log)
  );
});

/**
 * 调用者选项列表
 */
const callerOptions = computed(() => {
  const callers = new Set<string>();
  for (const log of auxLogs.value) {
    if (log.caller) {
      const match = log.caller.match(/([^/]+\.go)/);
      if (match) {
        callers.add(match[1]);
      }
    }
  }
  return [...callers].sort().map(c => ({ label: c, value: c }));
});

// ============================================
// 监听器
// ============================================

/**
 * 节点选择变更时，重置子选择
 */
watch(selectedNodeId, () => {
  selectedRecognitionIndex.value = null;
  selectedNestedIndex.value = null;
  selectedNestedActionIndex.value = null;
  selectedRecognitionInActionIndex.value = null;
});

/**
 * 任务选择变更时，重置子选择
 */
watch(selectedTaskKey, () => {
  selectedRecognitionIndex.value = null;
  selectedNestedIndex.value = null;
  selectedNestedActionIndex.value = null;
  selectedRecognitionInActionIndex.value = null;
});

/**
 * 过滤任务变更时，自动选择第一个任务
 */
watch(filteredTasks, () => {
  if (!selectedTaskKey.value || !filteredTasks.value.some(task => task.key === selectedTaskKey.value)) {
    selectedTaskKey.value = filteredTasks.value[0]?.key ?? null;
    selectedNodeId.value = filteredTasks.value[0]?.nodes[0]?.node_id ?? null;
  }
});

// ============================================
// 详情面板选择状态
// ============================================

/** 选中的识别尝试索引 */
const selectedRecognitionIndex = ref<number | null>(null);

/** 选中的嵌套节点索引 */
const selectedNestedIndex = ref<number | null>(null);

/** 选中的嵌套动作索引 */
const selectedNestedActionIndex = ref<number | null>(null);

/** 选中的动作中识别索引 */
const selectedRecognitionInActionIndex = ref<number | null>(null);

// ============================================
// 方法
// ============================================

/**
 * 复制 JSON 数据到剪贴板
 *
 * @param {unknown} data - 要复制的数据
 */
async function copyJson(data: unknown) {
  if (data === undefined || data === null) return;
  const text = JSON.stringify(data, null, 2);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // 后备方案：使用 textarea 元素
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    copyMessage.value = "已复制到剪贴板";
  } catch {
    copyMessage.value = "复制失败";
  }
  window.setTimeout(() => {
    copyMessage.value = "";
  }, 1500);
}

/**
 * 执行搜索
 */
function doPerformSearch() {
  searcherPerformSearch(rawLines.value);
}

/**
 * 打开开发者工具（仅 Tauri 环境）
 */
async function openDevtools() {
  if (!isTauriEnv()) return;
  try {
    await invoke("open_devtools");
  } catch (error) {
    logger.warn("打开开发者工具失败", { error: String(error) });
  }
}

// ============================================
// Tauri 拖拽事件监听器
// ============================================

/** 拖拽事件取消监听函数 */
let unlistenDragDrop: (() => void) | null = null;

/**
 * 解析日志路径
 * 优先使用应用日志目录，失败时使用应用数据目录
 */
async function resolveLogPath() {
  try {
    return await appLogDir();
  } catch {
    return await appDataDir();
  }
}

// ============================================
// 生命周期钩子
// ============================================

/**
 * 组件挂载时初始化
 */
onMounted(() => {
  if (isTauriEnv()) {
    const setup = async () => {
      // 初始化日志系统
      try {
        const logPath = await resolveLogPath();
        await init({
          logLevel: "INFO",
          logPath,
          rotationSize: 10 * 1024 * 1024,
          rotationCount: 5
        });
        logger.info("日志系统已初始化", { logPath });
      } catch (error) {
        logger.error("日志系统初始化失败", { error: String(error) });
      }

      // 监听 Tauri 拖拽事件
      unlistenDragDrop = await getCurrentWindow().onDragDropEvent(event => {
        const payload = event.payload as { type: string; paths?: string[] };
        if (payload.type === "over") {
          isDragging.value = true;
          return;
        }
        if (payload.type === "drop") {
          isDragging.value = false;
          const paths = Array.isArray(payload.paths) ? payload.paths : [];
          if (paths.length === 0) return;
          void handleTauriDrop(paths);
          return;
        }
        isDragging.value = false;
      });

      // 检查更新
      try {
        const update = await check();
        if (update) {
          logger.info("发现新版本", { version: update.version });
          $message.info(`发现新版本 v${update.version}，正在下载...`);
          await update.downloadAndInstall();
          $message.success("更新完成，正在重启...");
          await relaunch();
        }
      } catch (error) {
        logger.error("检查更新失败", { error: String(error) });
      }
    };
    void setup();
  }
});

/**
 * 组件卸载前清理
 */
onBeforeUnmount(() => {
  unlistenDragDrop?.();
  void flushLogs();
});
</script>

<template>
  <n-config-provider>
    <n-message-provider>
      <div
        class="app"
        @dragover.prevent
        @drop.prevent="handleDrop"
      >
        <!-- 顶部导航栏 -->
        <AppTopBar
          :view-mode="viewMode"
          :is-tauri="isTauriEnv()"
          @change-view="viewMode = $event"
          @open-devtools="openDevtools"
        />

        <!-- 拖拽遮罩层 -->
        <div
          v-if="isDragging"
          class="drop-mask"
          @drop="handleDrop"
          @dragover="handleDragOver"
        >
          松手导入日志/配置文件
        </div>

        <!-- 复制提示 -->
        <div
          v-if="copyMessage"
          class="copy-toast"
        >
          {{ copyMessage }}
        </div>

        <!-- 欢迎面板：文件选择和解析控制 -->
        <HeroPanel
          :selected-files="selectedFiles"
          :total-size="totalSize"
          :parse-state="parseState"
          :parse-progress="parseProgress"
          :status-message="statusMessage"
          :is-dragging="isDragging"
          :format-size="formatSize"
          :parser-options="parserOptions"
          :selected-parser-id="selectedParserId"
          @file-change="handleFileChange"
          @parse="handleParse"
          @drag-over="handleDragOver"
          @drag-enter="handleDragOver"
          @drag-leave="handleDragLeave"
          @drop="handleDrop"
          @update:selected-parser-id="selectedParserId = $event"
        />

        <div class="main-content">
          <!-- 文件列表面板 -->
          <FileListPanel
            :selected-files="selectedFiles"
            :format-size="formatSize"
            @remove="handleRemoveSelectedFile"
            @clear="handleClearSelectedFiles"
          />

          <!-- 分析面板 -->
          <AnalysisPanel
            v-if="viewMode === 'analysis'"
            :tasks="tasks"
            :filtered-tasks="filteredTasks"
            :selected-task-key="selectedTaskKey"
            :selected-node-id="selectedNodeId"
            :selected-task="selectedTask"
            :selected-task-nodes="selectedTaskNodes"
            :selected-node="selectedNode"
            :process-options="processOptions"
            :thread-options="threadOptions"
            :selected-process-id="selectedProcessId"
            :selected-thread-id="selectedThreadId"
            :task-item-height="taskItemHeight"
            :node-item-height="nodeItemHeight"
            :format-task-status="formatTaskStatus"
            :format-task-time-parts="formatTaskTimeParts"
            :format-duration="formatDuration"
            :format-result-status="formatResultStatus"
            :format-next-name="formatNextName"
            :format-box="formatBox"
            :summarize-base="summarizeBase"
            :summarize-recognition="summarizeRecognition"
            :summarize-nested-actions="summarizeNestedActions"
            :summarize-next-list="summarizeNextList"
            :summarize-node-detail="summarizeNodeDetail"
            :summarize-focus="summarizeFocus"
            :copy-json="copyJson"
            :selected-node-custom-actions="selectedNodeCustomActions"
            :selected-task-aux-logs="selectedTaskAuxLogs"
            :format-aux-level="formatAuxLevel"
            :selected-aux-levels="selectedAuxLevels"
            :hidden-callers="hiddenCallers"
            :caller-options="callerOptions"
            @select-task="
              ({ taskKey, nodeId }) => {
                selectedTaskKey = taskKey;
                selectedNodeId = nodeId;
              }
            "
            @select-node="selectedNodeId = $event"
            @update:process-id="selectedProcessId = $event"
            @update:thread-id="selectedThreadId = $event"
            @update:selected-aux-levels="selectedAuxLevels = $event"
            @update:hidden-callers="hiddenCallers = $event"
          />
        </div>

        <!-- 搜索面板 -->
        <SearchPanel
          v-if="viewMode === 'search'"
          :search-text="searchText"
          :search-case-sensitive="searchCaseSensitive"
          :search-use-regex="searchUseRegex"
          :hide-debug-info="hideDebugInfo"
          :search-max-results="searchMaxResults"
          :search-results="searchResults"
          :search-message="searchMessage"
          :quick-search-options="quickSearchOptions"
          :has-raw-lines="rawLines.length > 0"
          :search-item-height="searchItemHeight"
          :split-match="splitMatch"
          @update:search-text="searchText = $event"
          @update:search-case-sensitive="searchCaseSensitive = $event"
          @update:search-use-regex="searchUseRegex = $event"
          @update:hide-debug-info="hideDebugInfo = $event"
          @update:search-max-results="searchMaxResults = $event"
          @perform-search="doPerformSearch"
        />

        <!-- 统计面板 -->
        <StatisticsPanel
          v-if="viewMode === 'statistics'"
          :node-statistics="nodeStatistics"
          :node-summary="nodeSummary"
          :stat-keyword="statKeyword"
          :stat-sort="statSort"
          :format-duration="formatDuration"
          @update:stat-keyword="statKeyword = $event"
          @update:stat-sort="statSort = $event"
        />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
/**
 * 应用主容器样式
 */
.app {
  height: 100vh;
  background: #f6f7fb;
  color: #1f2937;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 20px 16px;
  box-sizing: border-box;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
  overflow: hidden;
}

/**
 * 顶部栏样式
 */
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/**
 * 品牌区域样式
 */
.brand {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name {
  font-size: 22px;
  font-weight: 600;
}

.subtitle {
  font-size: 12px;
  color: #6b7280;
}

.badge {
  padding: 6px 12px;
  border-radius: 999px;
  background: #ecfeff;
  color: #0f766e;
  font-size: 12px;
  font-weight: 600;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/**
 * 复制提示样式
 */
.copy-toast {
  position: fixed;
  top: 16px;
  right: 24px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #f8fafc;
  font-size: 12px;
  z-index: 20;
}

.view-tabs {
  display: flex;
  gap: 6px;
}

/**
 * 欢迎面板样式
 */
.hero {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 12px;
  position: relative;
  flex-shrink: 0;
}

/**
 * 主内容区域样式
 */
.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.main-content > .panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.main-content > .panel:first-child {
  flex: none;
}

.hero.drop-active {
  outline: 2px dashed #60a5fa;
  outline-offset: 6px;
  border-radius: 16px;
}

/**
 * 拖拽遮罩样式
 */
.drop-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: 600;
  font-size: 16px;
  z-index: 2;
  pointer-events: all;
}

.hero-text h1 {
  font-size: 22px;
  margin: 0 0 6px;
}

.hero-text p {
  color: #6b7280;
  margin-bottom: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.drag-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
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
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-title {
  font-size: 14px;
  color: #6b7280;
}

.card-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.card-stat-divider {
  color: #9ca3af;
  font-size: 12px;
  margin: 0 8px;
}

.card-stat strong {
  color: #111827;
}

.card-hint {
  font-size: 12px;
  color: #9ca3af;
}

/**
 * 面板通用样式
 */
.panel {
  border-radius: 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel :deep(.n-card-header) {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.panel :deep(.n-card-header__main) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.empty {
  color: #9ca3af;
  padding: 12px 0;
}

/**
 * 文件列表样式
 */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-list-wrapper {
  max-height: 100px;
  overflow: auto;
  padding-right: 4px;
}

.file-row {
  display: grid;
  grid-template-columns: 1fr 120px 180px auto;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  font-size: 13px;
}

.file-name {
  color: #111827;
  word-break: break-all;
}

.file-meta {
  color: #6b7280;
  text-align: right;
}

.file-action {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

/**
 * 任务布局样式
 */
.task-layout {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1.4fr;
  gap: 16px;
  --panel-content-height: 520px;
  --panel-top-gap: 8px;
}

.task-list,
.node-list,
.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-top {
  display: flex;
  flex-direction: column;
  gap: var(--panel-top-gap);
}

.panel-tools {
  display: flex;
  align-items: center;
}

.panel-filters {
  gap: 8px;
  flex-wrap: wrap;
}

.filter-select {
  width: 160px;
}

.task-list-content {
  height: var(--panel-content-height);
  display: block;
}

.task-list-scroll {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 6px;
  box-sizing: border-box;
}

.node-list-content {
  height: var(--panel-content-height);
  display: block;
}

.detail-panel .detail-content {
  height: var(--panel-content-height);
  overflow-y: auto;
  padding-right: 6px;
}

/**
 * 任务行样式
 */
.task-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  cursor: pointer;
  font-size: 13px;
  align-items: flex-start;
  min-height: 120px;
  box-sizing: border-box;
}

.task-row.active {
  border-color: #93c5fd;
  background: #eff6ff;
}

.task-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.task-title {
  color: #111827;
  font-weight: 600;
}

.task-sub {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #6b7280;
  font-size: 12px;
  min-width: 0;
}

.task-side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #6b7280;
  font-size: 12px;
  text-align: right;
  align-items: flex-end;
  min-width: 0;
}

.task-side-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
}

.task-side-row-inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.task-side-row-inline .task-side-value {
  flex-direction: row;
}

.task-side-label {
  font-size: 11px;
  color: #9ca3af;
}

.task-side-value {
  color: #111827;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.task-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/**
 * 节点样式
 */
.node-header {
  font-size: 13px;
  color: #6b7280;
}

.node-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  font-size: 13px;
  cursor: pointer;
  align-items: stretch;
  min-height: 72px;
  box-sizing: border-box;
}

.node-row.active {
  border-color: #a7f3d0;
  background: #ecfdf3;
}

.node-name {
  color: #111827;
  font-weight: 600;
}

.node-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-sub {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #6b7280;
  font-size: 12px;
  min-width: 0;
}

.node-badges {
  display: grid;
  grid-template-rows: 1fr 1fr;
  align-content: center;
  justify-items: end;
  justify-self: end;
  width: max-content;
  min-width: 0;
}

.virtual-scroller {
  height: 100%;
}

.node-badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  font-weight: 600;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-meta {
  color: #6b7280;
}

/**
 * 搜索面板样式
 */
.search-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.search-message {
  color: #6b7280;
  font-size: 12px;
  margin-bottom: 8px;
}

.search-results {
  height: 520px;
  display: block;
}

.search-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.search-row {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  min-height: 64px;
  box-sizing: border-box;
}

.search-meta {
  color: #6b7280;
}

.search-line {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  color: #111827;
  word-break: break-all;
}

.search-hit {
  background: #fef08a;
  padding: 0 4px;
  border-radius: 4px;
  font-weight: 600;
}

/**
 * 统计面板样式
 */
.stat-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.stat-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  margin-bottom: 16px;
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.stat-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-row {
  display: grid;
  grid-template-columns: 2fr repeat(5, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  font-size: 12px;
}

.stat-row.header {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}

.stat-name {
  color: #111827;
  font-weight: 600;
  word-break: break-all;
}

/**
 * 详情面板样式
 */
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.aux-log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aux-log-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aux-log-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.aux-log-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  padding-top: 4px;
}

.aux-log-item {
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.aux-log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 12px;
}

.aux-log-time {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
}

.aux-log-message {
  font-weight: 600;
  color: #111827;
  word-break: break-word;
}

.aux-log-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #6b7280;
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
}

.collapse-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.collapse-summary {
  margin-left: auto;
  color: #6b7280;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
  text-align: right;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  color: #4b5563;
}

.detail-section-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #ffffff;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-section-label {
  color: #6b7280;
  font-size: 12px;
  white-space: nowrap;
}

.detail-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.detail-section-title {
  font-weight: 600;
  color: #111827;
}

.detail-section-sub {
  color: #6b7280;
  font-size: 12px;
  margin-left: auto;
  white-space: nowrap;
}

.detail-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}

.detail-section-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-right: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}

.detail-section-cell:nth-child(odd) {
  background: #fafafa;
}

.detail-section-cell:nth-child(even) {
  border-right: none;
}

.detail-section-cell:last-child,
.detail-section-cell:nth-last-child(2) {
  border-bottom: none;
}

.detail-section-value {
  color: #111827;
  font-weight: 600;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-section-box {
  font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
  font-weight: 500;
  font-size: 12px;
  color: #111827;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 6px;
}

.detail-section-collapse {
  background: #f9fafb;
  border-radius: 10px;
  padding: 4px 8px;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
}

.detail-item.nested {
  background: #f8fafc;
}

.detail-item-title {
  font-weight: 600;
  color: #111827;
  margin-bottom: 6px;
}

.detail-code {
  margin-top: 6px;
}

.nested-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.next-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/**
 * 响应式布局
 */
@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
  }

  .file-row {
    grid-template-columns: 1fr;
    text-align: left;
  }

  .task-layout {
    grid-template-columns: 1fr;
  }

  .task-row,
  .node-row,
  .detail-grid,
  .stat-row {
    grid-template-columns: 1fr;
    text-align: left;
  }

  .file-meta {
    text-align: left;
  }
}
</style>
