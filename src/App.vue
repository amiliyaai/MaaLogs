<!--
  @fileoverview MaaLogs 应用主组件

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
import { ref, computed, watch } from "vue";
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  darkTheme,
  lightTheme,
} from "naive-ui";

/**
 * Tauri API 导入
 */

/**
 * 虚拟滚动样式
 */
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

/**
 * 子组件导入
 */
import AppTopBar from "@/components/AppTopBar.vue";
import HeroPanel from "@/components/HeroPanel.vue";
import FileListPanel from "@/components/FileListPanel.vue";
import AnalysisPanel from "@/components/AnalysisPanel.vue";
import SearchPanel from "@/components/SearchPanel.vue";
import StatisticsPanel from "@/components/StatisticsPanel.vue";
import SettingsModal from "@/components/SettingsModal.vue";
import ComparePanel from "@/components/ComparePanel.vue";

/**
 * Composables 导入
 */
import {
  useLogParser,
  setSelectedFiles,
  useSearch,
  useStatistics,
  useFileSelection,
  useRunComparison,
  useCompareSlots,
  useTauriIntegration,
  useStorage,
} from "@/composables";
import { getPlatform } from "@/platform";

/**
 * 工具函数导入
 */
import {
  formatSize,
  formatDuration,
  formatTaskStatus,
  formatTaskTimeParts,
  formatResultStatus,
  formatCount,
  formatNextName,
  formatBox,
  formatAuxLevel,
  normalizeAuxLevel,
  summarizeBase,
  summarizeRecognition,
  summarizeNextList,
  summarizeNodeDetail,
  summarizeFocus,
  summarizeNestedActionNodes,
  splitMatch,
} from "@/utils/format";
import { extractCustomActionFromActionDetails } from "@/utils/parse";
import { isTauriEnv } from "@/utils/env";
import { createLogger } from "@/utils/logger";
import { setImportMaaBakLogGetter } from "@/config/file";
import { getAIConfig, saveAIConfig, type AIConfig } from "@/utils/aiAnalyzer";
import { DEFAULT_HIDDEN_CALLERS } from "@/config/constants";
import type { AuxLogEntry } from "@/types/logTypes";

// ============================================
// 日志记录器
// ============================================

/** 应用日志记录器 */
const logger = createLogger("App");

// ============================================
// 视图状态
// ============================================

/** 当前视图模式：分析、搜索、统计 */
const viewMode = ref<"analysis" | "search" | "statistics" | "compare">("analysis");

/** 主题模式：light, dark, auto */
const themeMode = useStorage<"light" | "dark" | "auto">("themeMode", "auto");

/** 是否导入 maa.bak.log */
const importMaaBakLog = useStorage<boolean>("importMaaBakLog", true);

/** JSON 展开层级 */
const jsonExpandDepth = useStorage<number>("jsonExpandDepth", 5);

/** 当前是否为暗色主题 */
const isDark = computed(() => {
  if (themeMode.value === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return themeMode.value === "dark";
});

/** 当前主题对象 */
const currentTheme = computed(() => (isDark.value ? darkTheme : lightTheme));

/** 更新滚动条 CSS 变量 */
const updateScrollbarVars = () => {
  const root = document.documentElement;
  if (isDark.value) {
    root.style.setProperty("--scrollbar-track", "rgba(255, 255, 255, 0.08)");
    root.style.setProperty("--scrollbar-thumb", "rgba(255, 255, 255, 0.2)");
    root.style.setProperty("--scrollbar-thumb-hover", "rgba(255, 255, 255, 0.35)");
    root.style.setProperty("--app-bg", "#1a1a1a");
    root.style.setProperty("--app-text", "#ffffff");
  } else {
    root.style.setProperty("--scrollbar-track", "rgba(0, 0, 0, 0.05)");
    root.style.setProperty("--scrollbar-thumb", "rgba(0, 0, 0, 0.15)");
    root.style.setProperty("--scrollbar-thumb-hover", "rgba(0, 0, 0, 0.25)");
    root.style.setProperty("--app-bg", "#ffffff");
    root.style.setProperty("--app-text", "#333333");
  }
};

watch(isDark, updateScrollbarVars, { immediate: true });

/** 设置弹窗显示状态 */
const showSettings = ref(false);

/** AI 配置 */
const aiConfig = ref<AIConfig | null>(null);

/** 当前选中的任务键 */
const selectedTaskKey = ref<string | null>(null);

/** 当前选中的节点 ID */
const selectedNodeId = ref<number | null>(null);

/** 选中的Custom日志级别 */
const selectedAuxLevels = ref<string[]>(["error", "warn", "info", "debug", "other"]);

/** 隐藏的调用者列表 */
const hiddenCallers = useStorage<string[]>("hiddenCallers", [...DEFAULT_HIDDEN_CALLERS]);
const searchHistoryStorage = useStorage<string[]>("searchHistory", []);

/** 复制提示消息 */
const copyMessage = ref("");

// ============================================
// 虚拟滚动配置
// ============================================

/** 任务列表项高度 */
const taskItemHeight = 130;

/** 节点列表项高度 */
const nodeItemHeight = 80;

/** 搜索结果项高度 */
const searchItemHeight = 64;

// ============================================
// Composables 初始化
// ============================================

/**
 * 文件选择器
 * 提供文件选择、拖拽等功能
 */
const fileSelector = useFileSelection((files) => {
  setSelectedFiles(files);
  resetParseState();
  searcherResetSearch();
});

/**
 * 日志解析器
 * 提供日志解析、任务构建等功能
 */
const logParser = useLogParser({ baseDir: () => fileSelector.baseDir.value });
const {
  parseState,
  parseProgress,
  statusMessage,
  tasks,
  rawLines,
  auxLogs,
  detectedProject,
  selectedProcessId,
  selectedThreadId,
  processOptions,
  threadOptions,
  filteredTasks,
  expectedParams,
  handleParse,
  resetParseState,
} = logParser;

if (import.meta.env.DEV) {
  // @ts-expect-error Debug only
  window.__tasks__ = tasks;
  // @ts-expect-error Debug only
  window.__tasksValue__ = () => tasks.value;
}

const {
  selectedFiles,
  totalSize,
  isDragging,
  handleSelectDirectory,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleRemoveSelectedFile,
  handleClearSelectedFiles,
  handleTauriDrop,
} = fileSelector;

const visionDir = computed(() => {
  const dir = fileSelector.baseDir.value;
  if (!dir) return undefined;
  return `${dir}/vision`;
});

/**
 * 搜索器
 * 提供文本搜索功能
 */
const searcher = useSearch({ searchHistoryRef: searchHistoryStorage });
const {
  searchText,
  searchCaseSensitive,
  searchUseRegex,
  searchMaxResults,
  searchResults,
  searchMessage,
  searchHistory,
  performSearch: searcherPerformSearch,
  resetSearch: searcherResetSearch,
  clearHistory,
} = searcher;
setImportMaaBakLogGetter(() => importMaaBakLog.value);

/**
 * 统计器
 * 提供节点统计分析功能
 */
const statistics = useStatistics(() => tasks.value);
const { statSort, statKeyword, nodeStatistics, nodeSummary } = statistics;

const runComparison = useRunComparison();
const {
  baselineSnapshot,
  candidateSnapshot,
  selectedTaskA,
  selectedTaskB,
  compareResult,
  baselineTasks,
  candidateTasks,
  setBaselineSnapshot,
  setCandidateSnapshot,
  selectTaskA,
  selectTaskB,
  clearBaselineSnapshot,
  clearCandidateSnapshot,
  useBaselineAsCandidate,
} = runComparison;
const {
  handleSelectBaselineDir,
  handleSelectBaselineZip,
  handleSelectCandidateDir,
  handleSelectCandidateZip,
} = useCompareSlots({
  selectedFiles,
  parseState,
  parseProgress,
  statusMessage,
  tasks,
  rawLines,
  auxLogs,
  detectedProject,
  selectedProcessId,
  selectedThreadId,
  nodeStatistics,
  nodeSummary,
  handleParse,
  resetParseState,
  setBaselineSnapshot,
  setCandidateSnapshot,
});

// ============================================
// 计算属性
// ============================================

/**
 * 当前选中的任务
 */
const selectedTask = computed(() => {
  if (!selectedTaskKey.value) return null;
  return filteredTasks.value.find((task) => task.key === selectedTaskKey.value) || null;
});

/**
 * 当前选中的节点
 */
const selectedNode = computed(() => {
  if (!selectedTask.value || selectedNodeId.value === null) return null;
  return selectedTask.value.nodes.find((node) => node.node_id === selectedNodeId.value) || null;
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
  const fromLog = extractCustomActionFromActionDetails(selectedNode.value.action_details);
  if (fromLog) {
    return [{ name: fromLog, fileName: "日志" }];
  }
  return [];
});

/**
 * 当前选中节点的 Focus 消息
 */
const selectedNodeFocusLogs = computed(() => {
  if (!selectedNode.value || !selectedTask.value) {
    return { recognition: [], action: [] };
  }

  const nodeName = selectedNode.value.name;
  const taskKey = selectedTask.value.key;

  const recognitionAttemptNames = new Set<string>();
  recognitionAttemptNames.add(nodeName);
  for (const attempt of selectedNode.value.recognition_attempts ?? []) {
    if (attempt.name) {
      recognitionAttemptNames.add(attempt.name);
    }
  }

  const focusLogs = auxLogs.value.filter((log) => {
    if (log.source !== "focus") return false;
    if (log.correlation?.status !== "matched") return false;
    if (log.correlation?.taskKey !== taskKey) return false;
    const logNodeName = log.details?.nodeName;
    return typeof logNodeName === "string" && recognitionAttemptNames.has(logNodeName);
  });

  const recognition = focusLogs.filter((log) => {
    const event = log.details?.event;
    return typeof event === "string" && event.startsWith("Node.Recognition");
  });

  const action = focusLogs.filter((log) => {
    const event = log.details?.event;
    return typeof event === "string" && event.startsWith("Node.Action");
  });

  return { recognition, action };
});

/**
 * 当前选中任务的Custom日志
 */
const matchesSelectedAuxLevel = (log: AuxLogEntry) => {
  const normalizedLevel = normalizeAuxLevel(log.level);
  return selectedAuxLevels.value.includes(normalizedLevel);
};

const matchesVisibleCaller = (log: AuxLogEntry) => {
  if (hiddenCallers.value.length === 0) return true;
  if (!log.caller) return true;
  return !hiddenCallers.value.some((hidden) => log.caller?.includes(hidden));
};

const selectedTaskAuxLogs = computed(() => {
  if (!selectedTask.value) return [];

  const taskKey = selectedTask.value.key;

  return auxLogs.value.filter(
    (log) =>
      log.source !== "focus" &&
      log.correlation?.status === "matched" &&
      log.correlation?.taskKey === taskKey &&
      matchesSelectedAuxLevel(log) &&
      matchesVisibleCaller(log)
  );
});

/**
 * 分析页页面内搜索可用的 Custom 日志映射
 */
const searchableAuxLogs = computed(() => {
  const logsByTask = new Map<string, AuxLogEntry[]>();

  for (const log of auxLogs.value) {
    if (log.source === "focus") continue;
    if (log.correlation?.status !== "matched" || !log.correlation.taskKey) continue;
    if (!matchesSelectedAuxLevel(log) || !matchesVisibleCaller(log)) continue;

    const taskKey = log.correlation.taskKey;
    const existingLogs = logsByTask.get(taskKey);
    if (existingLogs) {
      existingLogs.push(log);
    } else {
      logsByTask.set(taskKey, [log]);
    }
  }

  return logsByTask;
});

/**
 * 调用者选项列表
 */
const callerOptions = computed(() => {
  const callers = new Set<string>();
  for (const log of auxLogs.value) {
    if (log.caller) {
      // 提取文件名部分，支持 Unix 路径和 Windows 路径
      const lastSlash = log.caller.lastIndexOf("/");
      const lastBackslash = log.caller.lastIndexOf("\\");
      const lastSeparator = Math.max(lastSlash, lastBackslash);
      const fileName = lastSeparator >= 0 ? log.caller.slice(lastSeparator + 1) : log.caller;
      // 提取冒号前的部分（Go日志格式：file.go:123）
      const colonIndex = fileName.indexOf(":");
      const cleanFileName = colonIndex >= 0 ? fileName.slice(0, colonIndex) : fileName;
      if (cleanFileName) {
        callers.add(cleanFileName);
      }
    }
  }
  return [...callers].sort().map((c) => ({ label: c, value: c }));
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
 * 视图模式变更时，重置任务和节点选择
 */
watch(viewMode, () => {
  selectedTaskKey.value = null;
  selectedNodeId.value = null;
  selectedRecognitionIndex.value = null;
  selectedNestedIndex.value = null;
  selectedNestedActionIndex.value = null;
  selectedRecognitionInActionIndex.value = null;
});

/**
 * 过滤任务变更时，自动选择第一个任务
 */
watch(filteredTasks, () => {
  if (
    !selectedTaskKey.value ||
    !filteredTasks.value.some((task) => task.key === selectedTaskKey.value)
  ) {
    selectedTaskKey.value = filteredTasks.value[0]?.key ?? null;
    selectedNodeId.value = filteredTasks.value[0]?.nodes[0]?.node_id ?? null;
  }
});

/**
 * 文件选择后自动开始解析
 */
watch(
  selectedFiles,
  (files) => {
    if (files.length > 0 && parseState.value !== "parsing" && parseState.value !== "done") {
      void handleParse();
    }
  },
  { deep: true }
);

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

function isDropInCompareSlot(event: DragEvent): boolean {
  const path = event.composedPath();
  return path.some(
    (node) =>
      node instanceof HTMLElement &&
      (node.dataset.dropScope === "compare-slot" || node.dataset.dropScope === "compare-panel")
  );
}

function handleGlobalDrop(event: DragEvent): void {
  if (viewMode.value === "compare" && isDropInCompareSlot(event)) {
    return;
  }
  void handleDrop(event);
}

/**
 * 打开开发者工具（仅 Tauri 环境）
 */
async function openDevtools() {
  if (!isTauriEnv()) return;
  try {
    const platform = await getPlatform();
    await platform.updater.openDevtools();
  } catch (error) {
    logger.warn("打开开发者工具失败", { error: String(error) });
  }
}

/**
 * 打开设置弹窗
 */
function openSettings() {
  showSettings.value = true;
}

/**
 * 加载 AI 配置
 */
async function loadAIConfig() {
  aiConfig.value = await getAIConfig();
}

/**
 * 保存 AI 配置
 */
async function handleSaveAIConfig(config: AIConfig) {
  console.log("Saving AI config in App:", config);
  await saveAIConfig(config);
  aiConfig.value = config;
}
useTauriIntegration({
  isDragging,
  viewMode,
  themeMode,
  handleTauriDrop,
  onLoadAIConfig: loadAIConfig,
});
</script>

<template>
  <n-config-provider :theme="currentTheme">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app" @dragover.prevent @drop.prevent="handleGlobalDrop" @dragleave="handleDragLeave">
          <!-- 顶部导航栏 -->
          <AppTopBar
            :view-mode="viewMode"
            :is-tauri="isTauriEnv()"
            :theme-mode="themeMode"
            @change-view="viewMode = $event"
            @open-devtools="openDevtools"
            @change-theme="themeMode = $event"
            @open-settings="openSettings"
          />

          <!-- 拖拽遮罩层：监听 dragover / drop / dragleave，确保拖拽取消时遮罩也能及时关闭 -->
          <div
            v-if="isDragging && viewMode !== 'compare'"
            class="drop-mask"
            @drop="handleGlobalDrop"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
          >
            松手导入日志
          </div>

          <!-- 复制提示 -->
          <div v-if="copyMessage" class="copy-toast">
            {{ copyMessage }}
          </div>

          <!-- 欢迎面板：文件选择和解析控制 -->
          <HeroPanel
            v-if="viewMode !== 'compare'"
            :selected-files="selectedFiles"
            :total-size="totalSize"
            :parse-state="parseState"
            :parse-progress="parseProgress"
            :status-message="statusMessage"
            :is-dragging="isDragging"
            :format-size="formatSize"
            @select-directory="handleSelectDirectory"
            @drag-over="handleDragOver"
            @drag-enter="handleDragOver"
            @drag-leave="handleDragLeave"
            @drop="handleDrop"
          />

          <div class="main-content">
            <!-- 文件列表面板 -->
            <FileListPanel
              v-if="viewMode !== 'compare'"
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
              :format-count="formatCount"
              :format-next-name="formatNextName"
              :format-box="formatBox"
              :summarize-base="summarizeBase"
              :summarize-recognition="summarizeRecognition"
              :summarize-next-list="summarizeNextList"
              :summarize-node-detail="summarizeNodeDetail"
              :summarize-focus="summarizeFocus"
              :summarize-nested-action-nodes="summarizeNestedActionNodes"
              :copy-json="copyJson"
              :selected-node-custom-actions="selectedNodeCustomActions"
              :selected-node-focus-logs="selectedNodeFocusLogs"
              :selected-task-aux-logs="selectedTaskAuxLogs"
              :searchable-aux-logs="searchableAuxLogs"
              :expected-params="expectedParams"
              :format-aux-level="formatAuxLevel"
              :selected-aux-levels="selectedAuxLevels"
              :hidden-callers="hiddenCallers"
              :caller-options="callerOptions"
              :vision-dir="visionDir"
              :json-expand-depth="jsonExpandDepth"
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

            <!-- 搜索面板 -->
            <SearchPanel
              v-if="viewMode === 'search'"
              :search-text="searchText"
              :search-case-sensitive="searchCaseSensitive"
              :search-use-regex="searchUseRegex"
              :search-max-results="searchMaxResults"
              :search-results="searchResults"
              :search-message="searchMessage"
              :search-history="searchHistory"
              :has-raw-lines="rawLines.length > 0"
              :search-item-height="searchItemHeight"
              :split-match="splitMatch"
              @update:search-text="searchText = $event"
              @update:search-case-sensitive="searchCaseSensitive = $event"
              @update:search-use-regex="searchUseRegex = $event"
              @update:search-max-results="searchMaxResults = $event"
              @perform-search="doPerformSearch"
              @clear-history="clearHistory"
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

            <ComparePanel
              v-if="viewMode === 'compare'"
              :baseline-snapshot="baselineSnapshot"
              :candidate-snapshot="candidateSnapshot"
              :selected-task-a="selectedTaskA"
              :selected-task-b="selectedTaskB"
              :compare-result="compareResult"
              :baseline-tasks="baselineTasks"
              :candidate-tasks="candidateTasks"
              :format-duration="formatDuration"
              @select-task-a="selectTaskA"
              @select-task-b="selectTaskB"
              @clear-baseline="clearBaselineSnapshot"
              @clear-candidate="clearCandidateSnapshot"
              @use-baseline-as-candidate="useBaselineAsCandidate"
              @select-baseline-dir="handleSelectBaselineDir"
              @select-baseline-zip="handleSelectBaselineZip"
              @select-candidate-dir="handleSelectCandidateDir"
              @select-candidate-zip="handleSelectCandidateZip"
            />
          </div>
        </div>

        <!-- 设置弹窗 -->
        <SettingsModal
          v-model:show="showSettings"
          :theme-mode="themeMode"
          :ai-config="aiConfig"
          :import-maa-bak-log="importMaaBakLog"
          :json-expand-depth="jsonExpandDepth"
          @update:theme-mode="themeMode = $event"
          @update:ai-config="aiConfig = $event"
          @save-ai-config="handleSaveAIConfig"
          @update:import-maa-bak-log="importMaaBakLog = $event"
          @update:json-expand-depth="jsonExpandDepth = $event"
        />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
/**
 * 全局滚动条样式 - 暗色模式适配
 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/**
 * 全局样式
 */
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  background: var(--app-bg);
  color: var(--app-text);
}

/**
 * 应用主容器样式
 */
.app {
  height: 100vh;
  background: var(--n-color);
  color: var(--n-text-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 20px 16px;
  box-sizing: border-box;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
  overflow: hidden;
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
  background: var(--n-color-modal);
  color: var(--n-text-color);
  font-size: 12px;
  z-index: 20;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.view-tabs {
  display: flex;
  gap: 6px;
}

/**
 * 主内容区域样式
 */
.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.main-content > .panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.main-content > .file-list-panel {
  flex: none;
}

.main-content > .compare-panel {
  flex: 1;
  min-height: 0;
}

/**
 * 拖拽遮罩样式
 */
.drop-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--n-text-color);
  font-weight: 600;
  font-size: 16px;
  z-index: 2;
  pointer-events: all;
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
  max-height: 120px;
  overflow: auto;
  padding-right: 4px;
}

.file-row {
  display: grid;
  grid-template-columns: 1fr 120px 180px auto;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--n-color-modal);
  border: 1px solid var(--n-border-color);
  font-size: 13px;
}

.file-name {
  color: var(--n-text-color);
  word-break: break-all;
}

.file-meta {
  color: var(--n-text-color-2);
  text-align: right;
}

.file-action {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

/**
 * 任务行样式
 */
.task-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
  cursor: pointer;
  font-size: 13px;
  min-height: auto;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.task-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.task-row-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: var(--n-text-color-2);
  font-size: 12px;
}

.task-row.active {
  border-color: #1890ff;
  background: rgba(24, 144, 255, 0.1);
}

.task-row.failed {
  border-color: #f5222d;
  background: rgba(245, 34, 45, 0.1);
}

.task-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.task-title {
  color: var(--n-text-color);
  font-weight: 600;
}

.task-sub {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--n-text-color-2);
  font-size: 12px;
  min-width: 0;
}

.task-side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--n-text-color-2);
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
  color: var(--n-text-color-3);
}

.task-side-value {
  color: var(--n-text-color);
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
  color: var(--n-text-color-2);
}

.node-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
  font-size: 13px;
  cursor: pointer;
  align-items: stretch;
  min-height: 72px;
  margin-bottom: 16px;
  box-sizing: border-box;
}

.node-row.active {
  border-color: var(--n-success-color);
  background: var(--n-success-color-supply);
}

.node-row.failed {
  border-color: #f5222d;
  background: rgba(245, 34, 45, 0.1);
}

.node-name {
  color: var(--n-text-color);
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
  color: var(--n-text-color-2);
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

.node-badge {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(24, 144, 255, 0.1);
  color: #1890ff;
  font-size: 12px;
  font-weight: 600;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-meta {
  color: var(--n-text-color-2);
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
  color: var(--n-text-color-2);
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
  border: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  min-height: 64px;
  box-sizing: border-box;
}

.search-meta {
  color: var(--n-text-color-2);
}

.search-line {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  color: var(--n-text-color);
  word-break: break-all;
}

.search-hit {
  background: var(--n-warning-color-supply);
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
  border: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
  margin-bottom: 16px;
}

.stat-label {
  font-size: 12px;
  color: var(--n-text-color-2);
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--n-text-color);
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
  border: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
  font-size: 12px;
}

.stat-row.header {
  background: rgba(24, 144, 255, 0.1);
  color: #1890ff;
  font-weight: 600;
}

.stat-name {
  color: var(--n-text-color);
  font-weight: 600;
  word-break: break-all;
}

/**
 * 详情面板样式
 */

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
  color: var(--n-text-color);
  padding-top: 4px;
}

.aux-log-item {
  border-radius: 10px;
  border: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
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
  color: var(--n-text-color-2);
  font-size: 12px;
}

.aux-log-time {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
}

.aux-log-message {
  font-weight: 600;
  color: var(--n-text-color);
  word-break: break-word;
}

.aux-log-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--n-text-color-2);
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
  color: var(--n-text-color-2);
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
  color: var(--n-text-color-2);
}

.detail-section-card {
  border: 1px solid var(--n-border-color);
  border-radius: 12px;
  background: var(--n-color-modal);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-section-label {
  color: var(--n-text-color-2);
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
  color: var(--n-text-color);
}

.detail-section-sub {
  color: var(--n-text-color-2);
  font-size: 12px;
  margin-left: auto;
  white-space: nowrap;
}

.detail-section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  overflow: hidden;
}

.detail-section-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-right: 1px solid var(--n-border-color);
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
}

.detail-section-cell:nth-child(odd) {
  background: var(--n-color);
}

.detail-section-cell:nth-child(even) {
  border-right: none;
}

.detail-section-cell:last-child,
.detail-section-cell:nth-last-child(2) {
  border-bottom: none;
}

.detail-section-value {
  color: var(--n-text-color);
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
  color: var(--n-text-color);
  background: var(--n-color);
  padding: 2px 6px;
  border-radius: 6px;
}

.detail-section-collapse {
  background: var(--n-color);
  border-radius: 10px;
  padding: 4px 8px;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  background: var(--n-color-modal);
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 8px 10px;
}

.detail-item.nested {
  background: var(--n-color);
}

.detail-item-title {
  font-weight: 600;
  color: var(--n-text-color);
  margin-bottom: 6px;
}

.detail-code {
  margin-top: 6px;
}

.error-screenshot-content {
  margin-top: 8px;
}

.error-screenshot-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--n-color-hover);
  border-radius: 6px;
  margin-bottom: 12px;
}

.error-screenshot-panel {
  padding: 12px;
  background: var(--n-color-hover);
  border-radius: 6px;
  margin-bottom: 12px;
}

.error-screenshot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.error-screenshot-label {
  font-weight: 500;
  color: var(--n-text-color);
}

.screenshot-label {
  font-weight: 500;
  color: var(--n-text-color);
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
