<!--
@component AnalysisPanel
@description 日志分析主面板组件，提供任务列表、节点列表和详情展示功能
@author MaaLogs Team
@license MIT

@summary
该组件是日志分析视图的核心组件，采用三栏布局
- 左栏：任务列表，使用虚拟滚动优化性能
- 中栏：节点列表，显示选中任务的所有节点
- 右栏：节点详情，显示识别详情、动作详情、Custom日志

@features
- 进程/线程过滤
- 虚拟滚动（vue-virtual-scroller
- JSON 数据复制
- Custom日志级别过滤
- Custom日志来源过滤

@emits select-task - 选择任务事件
@emits select-node - 选择节点事件
@emits update:processId - 进程 ID 更新事件
@emits update:threadId - 线程 ID 更新事件
@emits update:selectedAuxLevels - Custom日志级别过滤更新事件
@emits update:hiddenCallers - 隐藏的日志来源更新事件

@example
<AnalysisPanel
  :tasks="taskList"
  :filtered-tasks="filteredTasks"
  :selected-task-key="selectedKey"
  :selected-node-id="selectedNodeId"
  :selected-task="currentTask"
  :selected-task-nodes="nodes"
  :selected-node="node"
  :process-options="processOptions"
  :thread-options="threadOptions"
  :selected-process-id="processId"
  :selected-thread-id="threadId"
  :task-item-height="taskItemHeight"
  :node-item-height="nodeItemHeight"
  :format-task-status="formatStatus"
  :format-task-time-parts="formatTime"
  :format-duration="formatDuration"
  :format-result-status="formatResult"
  :format-next-name="formatNext"
  :format-box="formatBox"
  :summarize-base="summarizeBase"
  :summarize-recognition="summarizeReco"
  :summarize-nested-actions="summarizeNested"
  :summarize-next-list="summarizeNext"
  :summarize-node-detail="summarizeDetail"
  :summarize-focus="summarizeFocus"
  :copy-json="copyJson"
  :selected-node-custom-actions="customActions"
  :selected-task-aux-logs="auxLogs"
  :format-aux-level="formatLevel"
  :selected-aux-levels="['error', 'warn']"
  :hidden-callers="[]"
  :caller-options="callerOptions"
  @select-task="handleTaskSelect"
  @select-node="handleNodeSelect"
/>
-->

<script setup lang="ts">
/**
 * 导入依赖
 * - Naive UI 组件：按钮、卡片、折叠面板、代码显示、选择器、标签、复选框
 * - vue-virtual-scroller：虚拟滚动组件，用于优化大列表性能
 */
import {
  NButton,
  NCard,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NCode,
  NImage,
  NInput,
  NModal,
  NSelect,
  NTag,
  NSpin,
  NIcon,
} from "naive-ui";
import { PictureFilled, SearchOutlined } from "@vicons/antd";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { ref, watch, onMounted, onUnmounted, computed } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useStorage, useInPageSearch } from "@/composables";
import type {
  NodeInfo,
  NextListItem,
  TaskInfo,
  PipelineCustomActionInfo,
  AuxLogEntry,
} from "@/types/logTypes";
import type { InPageSearchResult } from "@/composables/useInPageSearch";
import {
  analyzeWithAI,
  getAIConfig,
  type AIConfig,
  type FailureAnalysis,
  type AIAnalysisStats,
} from "@/utils/aiAnalyzer";
import AIResultCard from "./AIResultCard.vue";
import ControllerInfoCard from "./ControllerInfoCard.vue";
import CustomLogPanel from "./CustomLogPanel.vue";
import RecognitionTree from "./RecognitionTree.vue";
import JsonViewer from "vue-json-viewer";
import WaitFreezesImages from "./WaitFreezesImages.vue";

/**
 * AI 分析状态
 */
const aiConfig = ref<AIConfig | null>(null);
const aiAnalyzing = ref(false);
const aiResults = ref<FailureAnalysis[]>([]);
const aiStats = ref<AIAnalysisStats>();
const showScreenshot = ref(false);
const screenshotSrc = ref("");
const skipAIConfirm = useStorage("skipAIConfirm", false);
const showAIConfirm = ref(false);
const aiError = ref("");

/**
 * 页面内搜索状态
 */
const { searchText, searchScope, searchResults, showResults, performSearch, closeResults } =
  useInPageSearch();

const searchScopeOptions = [
  { label: "全部", value: "all" },
  { label: "任务", value: "task" },
  { label: "节点", value: "node" },
  { label: "识别", value: "recognition" },
  { label: "动作", value: "action" },
  { label: "日志", value: "auxlog" },
];

const nodeScrollerRef = ref<InstanceType<typeof DynamicScroller> | null>(null);
const taskScrollerRef = ref<InstanceType<typeof DynamicScroller> | null>(null);
const searchContainerRef = ref<HTMLElement | null>(null);
const detailContentRef = ref<HTMLElement | null>(null);
const highlightNodeId = ref<number | null>(null);
const highlightTaskKey = ref<string | null>(null);
const detailPanelHighlight = ref<boolean>(false);
const detailExpandedNames = ref<string[]>(["reco"]);
const highlightRecoId = ref<number | null>(null);
const highlightActionId = ref<number | null>(null);
const highlightAuxLogKey = ref<string | null>(null);

function getSearchableAuxLogs(): Map<string, AuxLogEntry[]> | undefined {
  if (props.searchableAuxLogs && props.searchableAuxLogs.size > 0) {
    return props.searchableAuxLogs;
  }

  if (!props.selectedTaskKey || props.selectedTaskAuxLogs.length === 0) {
    return undefined;
  }

  return new Map([[props.selectedTaskKey, props.selectedTaskAuxLogs]]);
}

function handleSearchInput() {
  performSearch(props.tasks, getSearchableAuxLogs());
}

function handleSearchFocus() {
  if (searchText.value.trim()) {
    performSearch(props.tasks, getSearchableAuxLogs());
  }
}

function handleClickOutside(event: MouseEvent) {
  if (searchContainerRef.value && !searchContainerRef.value.contains(event.target as Node)) {
    closeResults();
  }
}

function scrollHighlightedItemToCenter() {
  if (!detailContentRef.value) return;

  const highlightedItem = detailContentRef.value.querySelector(
    ".recognition-attempt-item.highlight, .action-attempt-item.highlight"
  ) as HTMLElement | null;

  if (highlightedItem) {
    const containerRect = detailContentRef.value.getBoundingClientRect();
    const itemRect = highlightedItem.getBoundingClientRect();
    const scrollOffset =
      itemRect.top - containerRect.top - containerRect.height / 2 + itemRect.height / 2;
    detailContentRef.value.scrollTop += scrollOffset;
  }
}

function scrollDetailElementToCenter(selector: string) {
  if (!detailContentRef.value) return;

  const targetElement = detailContentRef.value.querySelector(selector) as HTMLElement | null;
  if (!targetElement) return;

  const containerRect = detailContentRef.value.getBoundingClientRect();
  const elementRect = targetElement.getBoundingClientRect();
  const scrollOffset =
    elementRect.top - containerRect.top - containerRect.height / 2 + elementRect.height / 2;
  detailContentRef.value.scrollTop += scrollOffset;
}

onMounted(async () => {
  aiConfig.value = await getAIConfig();
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

function handleSearchResultClick(result: InPageSearchResult) {
  const task = result.taskKey
    ? props.tasks.find((t) => t.key === result.taskKey)
    : props.tasks.find((t) => t.task_id === result.taskId);
  if (!task) return;

  let targetNodeId = result.nodeId;
  if (!targetNodeId && task.nodes.length > 0) {
    targetNodeId = task.nodes[0].node_id;
  }

  emit("select-task", { taskKey: task.key, nodeId: targetNodeId || null });

  highlightRecoId.value = null;
  highlightActionId.value = null;
  highlightAuxLogKey.value = null;

  if (result.type === "recognition") {
    detailExpandedNames.value = ["reco"];
    if (result.recoId) {
      highlightRecoId.value = result.recoId;
      setTimeout(() => {
        scrollHighlightedItemToCenter();
      }, 200);
      setTimeout(() => {
        highlightRecoId.value = null;
      }, 1500);
    }
  } else if (result.type === "action") {
    detailExpandedNames.value = ["base"];
    if (result.actionId) {
      highlightActionId.value = result.actionId;
      setTimeout(() => {
        scrollHighlightedItemToCenter();
      }, 200);
      setTimeout(() => {
        highlightActionId.value = null;
      }, 1500);
    }
  } else if (result.type === "auxlog" && result.auxLogKey) {
    highlightAuxLogKey.value = result.auxLogKey;
    setTimeout(() => {
      scrollDetailElementToCenter(".aux-log-section");
    }, 180);
    setTimeout(() => {
      highlightAuxLogKey.value = null;
    }, 1500);
  }

  setTimeout(() => {
    const taskIndex = props.filteredTasks.findIndex((t) => t.key === task.key);
    if (taskScrollerRef.value && taskIndex >= 0) {
      (taskScrollerRef.value as unknown as { scrollToItem: (index: number) => void }).scrollToItem(
        taskIndex
      );
      setTimeout(() => {
        const scrollerEl = (taskScrollerRef.value as unknown as { $el: HTMLElement }).$el;
        if (scrollerEl) {
          const wrapper = scrollerEl.querySelector(".vue-recycle-scroller");
          if (wrapper) {
            const items = wrapper.querySelectorAll(".scroller-item");
            if (items[taskIndex]) {
              const itemEl = items[taskIndex] as HTMLElement;
              const wrapperRect = wrapper.getBoundingClientRect();
              const itemRect = itemEl.getBoundingClientRect();
              const scrollOffset =
                itemRect.top - wrapperRect.top - wrapperRect.height / 2 + itemRect.height / 2;
              wrapper.scrollTop += scrollOffset;
            }
          }
        }
      }, 50);
    }
    highlightTaskKey.value = task.key;
    setTimeout(() => {
      highlightTaskKey.value = null;
    }, 1500);

    const nodeIdToScroll = targetNodeId;
    if (nodeIdToScroll) {
      setTimeout(() => {
        const nodeIndex = props.selectedTaskNodes.findIndex((n) => n.node_id === nodeIdToScroll);
        if (nodeScrollerRef.value && nodeIndex >= 0) {
          (
            nodeScrollerRef.value as unknown as { scrollToItem: (index: number) => void }
          ).scrollToItem(nodeIndex);
          setTimeout(() => {
            const scrollerEl = (nodeScrollerRef.value as unknown as { $el: HTMLElement }).$el;
            if (scrollerEl) {
              const wrapper = scrollerEl.querySelector(".vue-recycle-scroller");
              if (wrapper) {
                const items = wrapper.querySelectorAll(".scroller-item");
                if (items[nodeIndex]) {
                  const itemEl = items[nodeIndex] as HTMLElement;
                  const wrapperRect = wrapper.getBoundingClientRect();
                  const itemRect = itemEl.getBoundingClientRect();
                  const scrollOffset =
                    itemRect.top - wrapperRect.top - wrapperRect.height / 2 + itemRect.height / 2;
                  wrapper.scrollTop += scrollOffset;
                }
              }
            }
          }, 50);
        }
        highlightNodeId.value = nodeIdToScroll;
        setTimeout(() => {
          highlightNodeId.value = null;
        }, 1500);
      }, 100);
    }
  }, 100);

  closeResults();
}

function getSearchResultIcon(type: string): string {
  switch (type) {
    case "task":
      return "📋";
    case "node":
      return "📦";
    case "recognition":
      return "🔍";
    case "action":
      return "⚙️";
    case "auxlog":
      return "📝";
    default:
      return "📄";
  }
}

function getSearchResultLabel(result: InPageSearchResult): string {
  switch (result.type) {
    case "task":
      return result.field === "task_id" ? `任务 ID: ${result.value}` : `任务: ${result.taskName}`;
    case "node":
      return result.field === "node_id" ? `节点 ID: ${result.value}` : `节点: ${result.nodeName}`;
    case "recognition": {
      const recoName = result.extra?.recoName;
      if (recoName && result.field === "reco_id") {
        return `识别 ID: ${result.value}`;
      }
      if (result.field === "algorithm") {
        return `识别算法: ${result.value}`;
      }
      if (result.field === "name") {
        return `识别: ${result.value}`;
      }
      return `识别[${result.field}]: ${result.value}`;
    }
    case "action":
      if (result.field === "action") {
        return `动作类型: ${result.value}`;
      }
      if (result.field === "name") {
        return `动作: ${result.value}`;
      }
      if (result.field === "action_id") {
        return `动作 ID: ${result.value}`;
      }
      return `动作[${result.field}]: ${result.value}`;
    case "auxlog":
      return result.field === "level" ? `日志级别: ${result.value}` : `日志: ${result.value}`;
    default:
      return result.value;
  }
}

function getAuxLogSourceLabel(result: InPageSearchResult): string | null {
  const caller = typeof result.extra?.caller === "string" ? result.extra.caller : null;
  const fileName = typeof result.extra?.fileName === "string" ? result.extra.fileName : null;
  const source = typeof result.extra?.source === "string" ? result.extra.source : null;

  const rawSource = caller || fileName || source;
  if (!rawSource) return null;

  const lastSlash = rawSource.lastIndexOf("/");
  const lastBackslash = rawSource.lastIndexOf("\\");
  const lastSeparator = Math.max(lastSlash, lastBackslash);
  return lastSeparator >= 0 ? rawSource.slice(lastSeparator + 1) : rawSource;
}

function getSearchResultMetaParts(result: InPageSearchResult): string[] {
  const parts: string[] = [];

  if (result.type === "auxlog") {
    if (result.taskName) {
      parts.push(`任务：${result.taskName}`);
    }

    const level = typeof result.extra?.level === "string" ? result.extra.level.toUpperCase() : null;
    const sourceLabel = getAuxLogSourceLabel(result);
    if (level) {
      parts.push(level);
    }
    if (sourceLabel) {
      parts.push(sourceLabel);
    }
    if (typeof result.logLineNumber === "number") {
      parts.push(`第 ${result.logLineNumber} 行`);
    }
    return parts;
  }

  if (result.type === "task") {
    parts.push(`任务 ID：${result.taskId}`);
    if (result.extra?.status) {
      parts.push(`状态：${String(result.extra.status)}`);
    }
    if (result.extra?.processId) {
      parts.push(`进程：${String(result.extra.processId)}`);
    }
    if (result.extra?.threadId) {
      parts.push(`线程：${String(result.extra.threadId)}`);
    }
    return parts;
  }

  if (result.taskName) {
    parts.push(`任务：${result.taskName}`);
  }

  if (result.type === "node") {
    if (typeof result.nodeId === "number") {
      parts.push(`节点 ID：${result.nodeId}`);
    }
    if (result.extra?.status) {
      parts.push(`状态：${String(result.extra.status)}`);
    }
    return parts;
  }

  if (result.nodeName) {
    parts.push(`节点：${result.nodeName}`);
  }

  if (result.type === "recognition") {
    const recoName = typeof result.extra?.recoName === "string" ? result.extra.recoName : null;
    const algorithm = typeof result.extra?.algorithm === "string" ? result.extra.algorithm : null;
    if (recoName && result.field !== "name") {
      parts.push(`识别：${recoName}`);
    }
    if (typeof result.recoId === "number") {
      parts.push(`识别 ID：${result.recoId}`);
    }
    if (algorithm) {
      parts.push(`算法：${algorithm}`);
    }
    if (result.extra?.status) {
      parts.push(`状态：${String(result.extra.status)}`);
    }
    return parts;
  }

  if (result.type === "action") {
    const actionType =
      typeof result.extra?.actionType === "string" ? result.extra.actionType : null;
    if (typeof result.actionId === "number") {
      parts.push(`动作 ID：${result.actionId}`);
    }
    if (actionType) {
      parts.push(`类型：${actionType}`);
    }
    if (result.extra?.status) {
      parts.push(`状态：${String(result.extra.status)}`);
    }
    return parts;
  }

  if (result.extra?.status) {
    parts.push(`状态：${String(result.extra.status)}`);
  }

  return parts;
}

const hasErrorScreenshot = computed(() => !!props.selectedNode?.error_screenshot);

const screenshotExpanded = ref<string[]>([]);

/**
 * 执行 AI 分析
 */
async function handleAIAnalyze() {
  if (!props.selectedTask) return;

  if (!skipAIConfirm.value) {
    showAIConfirm.value = true;
    return;
  }

  doAIAnalyze();
}

async function doAIAnalyze() {
  showAIConfirm.value = false;
  if (!props.selectedTask) return;
  if (!aiConfig.value) return;

  if (!aiConfig.value.apiKeys[aiConfig.value.provider]) {
    aiError.value = "请先在设置中配置 API Key";
    return;
  }

  aiAnalyzing.value = true;
  aiError.value = "";
  aiResults.value = [];
  aiStats.value = undefined;

  try {
    const { results: rawResults, stats } = await analyzeWithAI(
      aiConfig.value,
      [props.selectedTask],
      props.selectedTaskAuxLogs,
      props.expectedParams
    );
    aiStats.value = stats;

    const dedupedMap = new Map<string, FailureAnalysis>();
    for (const result of rawResults) {
      const existing = dedupedMap.get(result.nodeName);
      if (!existing || result.confidence > existing.confidence) {
        dedupedMap.set(result.nodeName, result);
      }
    }
    const dedupedResults = Array.from(dedupedMap.values());
    aiResults.value = dedupedResults;
    if (props.selectedTask) {
      aiResultsCache.set(props.selectedTask.key, dedupedResults);
    }
  } catch (e) {
    aiError.value = e instanceof Error ? e.message : "未知错误";
  } finally {
    aiAnalyzing.value = false;
  }
}

function hasNestedRecognition(detail: unknown): boolean {
  if (Array.isArray(detail) && detail.length > 0) return true;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    if (Array.isArray(d.detail) && d.detail.length > 0) return true;
  }
  return false;
}

function getRecognitionScores(detail: unknown): number[] {
  if (!detail || typeof detail !== "object") return [];
  const d = detail as Record<string, unknown>;

  if (d.best && typeof d.best === "object") {
    const best = d.best as Record<string, unknown>;
    if (typeof best.score === "number") {
      return [best.score];
    }
  }

  if (typeof d.score === "number") {
    return [d.score];
  }

  if (typeof d.best_score === "number") {
    return [d.best_score];
  }

  if (Array.isArray(d.filtered) && d.filtered.length > 0) {
    const filteredScores = d.filtered
      .map((item) => (item as Record<string, unknown>)?.score)
      .filter((s): s is number => typeof s === "number");
    if (filteredScores.length > 0) {
      return filteredScores;
    }
  }

  if (Array.isArray(d.all) && d.all.length > 0) {
    const allScores = d.all
      .map((item) => (item as Record<string, unknown>)?.score)
      .filter((s): s is number => typeof s === "number");
    if (allScores.length > 0) {
      return allScores;
    }
  }

  return [];
}

function formatRecognitionScores(detail: unknown): string | null {
  const scores = getRecognitionScores(detail);
  if (scores.length === 0) return null;
  if (scores.length === 1) {
    return scores[0].toFixed(3);
  }
  return scores.map((s) => s.toFixed(3)).join(", ");
}

/**
 * 组件属性定个
 * @property {TaskInfo[]} tasks - 所有任务列个
 * @property {TaskInfo[]} filteredTasks - 过滤后的任务列表
 * @property {string | null} selectedTaskKey - 当前选中的任个key
 * @property {number | null} selectedNodeId - 当前选中的节个ID
 * @property {TaskInfo | null} selectedTask - 当前选中的任务对个
 * @property {NodeInfo[]} selectedTaskNodes - 选中任务的所有节个
 * @property {NodeInfo | null} selectedNode - 当前选中的节点对个
 * @property {Object[]} processOptions - 进程选择器选项
 * @property {Object[]} threadOptions - 线程选择器选项
 * @property {string} selectedProcessId - 当前选中的进个ID
 * @property {string} selectedThreadId - 当前选中的线个ID
 * @property {number} taskItemHeight - 任务列表项高度（用于虚拟滚动个
 * @property {number} nodeItemHeight - 节点列表项高度（用于虚拟滚动个
 * @property {Function} formatTaskStatus - 任务状态格式化函数
 * @property {Function} formatTaskTimeParts - 任务时间格式化函个
 * @property {Function} formatDuration - 耗时格式化函个
 * @property {Function} formatResultStatus - 结果状态格式化函数
 * @property {Function} formatNextName - Next 名称格式化函个
 * @property {Function} formatBox - 识别框格式化函数
 * @property {Function} summarizeBase - 基础信息摘要函数
 * @property {Function} summarizeRecognition - 识别尝试摘要函数
 * @property {Function} summarizeNextList - Next 列表摘要函数
 * @property {Function} summarizeNodeDetail - 节点配置摘要函数
 * @property {Function} summarizeFocus - Focus 信息摘要函数
 * @property {Function} summarizeNestedActionNodes - 嵌套动作节点摘要函数
 * @property {Function} copyJson - JSON 复制函数
 * @property {PipelineCustomActionInfo[]} selectedNodeCustomActions - 选中节点的自定义动作
 * @property {AuxLogEntry[]} selectedTaskAuxLogs - 选中任务的Custom日志
 * @property {Function} formatAuxLevel - Custom日志级别格式化函个
 * @property {string[]} selectedAuxLevels - 选中的Custom日志级别
 * @property {string[]} hiddenCallers - 隐藏的日志来个
 * @property {Object[]} callerOptions - 日志来源选择器选项
 */
const props = withDefaults(
  defineProps<{
    tasks: TaskInfo[];
    filteredTasks: TaskInfo[];
    selectedTaskKey: string | null;
    selectedNodeId: number | null;
    selectedTask: TaskInfo | null;
    selectedTaskNodes: NodeInfo[];
    selectedNode: NodeInfo | null;
    processOptions: { label: string; value: string }[];
    threadOptions: { label: string; value: string }[];
    selectedProcessId: string;
    selectedThreadId: string;
    taskItemHeight: number;
    nodeItemHeight: number;
    formatTaskStatus: (status: TaskInfo["status"]) => string;
    formatTaskTimeParts: (value: string) => { date: string; time?: string };
    formatDuration: (value: number) => string;
    formatResultStatus: (value: "success" | "failed" | "disabled") => string;
    formatCount: (count: number) => string;
    formatNextName: (value: NextListItem) => string;
    formatBox: (value: [number, number, number, number] | null | undefined) => string;
    summarizeBase: (node: NodeInfo) => string;
    summarizeRecognition: (node: NodeInfo) => string;
    summarizeNextList: (node: NodeInfo) => string;
    summarizeNodeDetail: (node: NodeInfo) => string;
    summarizeFocus: (node: NodeInfo) => string;
    summarizeNestedActionNodes: (node: NodeInfo) => string;
    copyJson: (data: unknown) => void;
    selectedNodeCustomActions: PipelineCustomActionInfo[];
    selectedNodeFocusLogs?: { recognition: AuxLogEntry[]; action: AuxLogEntry[] };
    selectedTaskAuxLogs: AuxLogEntry[];
    searchableAuxLogs?: Map<string, AuxLogEntry[]>;
    expectedParams: Map<string, string[]>;
    formatAuxLevel: (
      value: string
    ) => "default" | "primary" | "info" | "success" | "warning" | "error";
    selectedAuxLevels?: string[];
    hiddenCallers?: string[];
    callerOptions: { label: string; value: string }[];
    visionDir?: string;
    jsonExpandDepth?: number;
  }>(),
  {
    selectedAuxLevels: () => ["error", "warn", "info", "debug", "other"],
    hiddenCallers: () => [],
    selectedNodeFocusLogs: () => ({ recognition: [], action: [] }),
    visionDir: undefined,
    jsonExpandDepth: 5,
  }
);

/**
 * AI 分析结果缓存（按任务 key 存储个
 */
const aiResultsCache = new Map<string, FailureAnalysis[]>();

/**
 * 监听任务切换，恢复已分析任务的结构
 */
watch(
  () => props.selectedTaskKey,
  (newKey) => {
    if (newKey && aiResultsCache.has(newKey)) {
      aiResults.value = aiResultsCache.get(newKey)!;
    } else {
      aiResults.value = [];
    }
    aiError.value = "";
  }
);

watch(
  () => props.selectedNodeId,
  () => {
    screenshotExpanded.value = hasErrorScreenshot.value ? ["screenshot"] : [];
  },
  { immediate: true }
);

/**
 * 组件事件定义
 * @event select-task - 选择任务，参数包个taskKey 和可选的 nodeId
 * @event select-node - 选择节点，参数为节点 ID
 * @event update:processId - 更新进程 ID 过滤
 * @event update:threadId - 更新线程 ID 过滤
 * @event update:selectedAuxLevels - 更新Custom日志级别过滤
 * @event update:hiddenCallers - 更新隐藏的日志来个
 */
const emit = defineEmits<{
  (e: "select-task", value: { taskKey: string; nodeId: number | null }): void;
  (e: "select-node", value: number): void;
  (e: "update:processId", value: string): void;
  (e: "update:threadId", value: string): void;
  (e: "update:selectedAuxLevels", value: string[]): void;
  (e: "update:hiddenCallers", value: string[]): void;
}>();

/**
 * 处理任务选择
 * 点击任务时，选中该任务并默认选中第一个节点?
 * @param payload - 任务选择信息
 */
const handleTaskSelect = (payload: { taskKey: string; nodeId: number | null }) => {
  if (payload.nodeId === null) {
    const task = props.filteredTasks.find((t) => t.key === payload.taskKey);
    if (task && task.nodes && task.nodes.length > 0) {
      payload.nodeId = task.nodes[0].node_id;
    }
  }
  emit("select-task", payload);
};

/**
 * 处理节点选择
 * 点击节点时，选中该节点以显示详情
 * @param {number} nodeId - 被选中的节点ID
 */
const handleNodeSelect = (nodeId: number) => {
  emit("select-node", nodeId);
};

function openScreenshot(filePath: string): void {
  screenshotSrc.value = convertFileSrc(filePath);
  showScreenshot.value = true;
}
</script>

<!--
  模板部分
  三栏布局个
  - 左栏：任务列表（虚拟滚动）
  - 中栏：节点列表（虚拟滚动）
  - 右栏：节点详情（识别详情、动作详情、Custom日志等）
-->
<template>
  <n-card class="panel" size="small">
    <template #header>
      <div class="panel-header">
        <div class="panel-title">任务与节点</div>
        <div class="panel-filters">
          <!-- 页面内搜索 -->
          <div ref="searchContainerRef" class="search-container">
            <n-input
              v-model:value="searchText"
              size="small"
              placeholder="搜索节点、识别、算法..."
              clearable
              class="search-input"
              @update:value="handleSearchInput"
              @focus="handleSearchFocus"
            >
              <template #prefix>
                <n-icon :component="SearchOutlined" />
              </template>
            </n-input>
            <n-select
              v-model:value="searchScope"
              size="small"
              :options="searchScopeOptions"
              class="search-scope-select"
              @update:value="handleSearchInput"
            />
            <!-- 搜索结果下拉 -->
            <div v-if="showResults && searchResults.length > 0" class="search-results">
              <div class="search-results-header">找到 {{ searchResults.length }} 个结果</div>
              <div class="search-results-list">
                <div
                  v-for="(result, index) in searchResults"
                  :key="index"
                  class="search-result-item"
                  @click="handleSearchResultClick(result)"
                >
                  <span class="result-icon">{{ getSearchResultIcon(result.type) }}</span>
                  <div class="result-content">
                    <div class="result-label">{{ getSearchResultLabel(result) }}</div>
                    <div v-if="getSearchResultMetaParts(result).length > 0" class="result-meta">
                      <span
                        v-for="(part, metaIndex) in getSearchResultMetaParts(result)"
                        :key="`${index}-meta-${metaIndex}`"
                        class="result-meta-part"
                      >
                        <template v-if="metaIndex > 0"> · </template>
                        {{ part }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 进程过滤 -->
          <n-select
            size="small"
            :options="processOptions"
            :value="selectedProcessId"
            placeholder="进程"
            class="filter-select"
            @update:value="emit('update:processId', $event)"
          />
          <!-- 线程过滤 -->
          <n-select
            size="small"
            :options="threadOptions"
            :value="selectedThreadId"
            placeholder="线程"
            class="filter-select"
            @update:value="emit('update:threadId', $event)"
          />
        </div>
      </div>
    </template>
    <!-- 主内容区域 -->
    <div class="task-layout">
      <!-- 左栏：任务列表 -->
      <div class="task-list">
        <div class="panel-top">
          <div class="node-header">
            <span>任务列表</span>
            <div class="ai-controls">
              <n-spin :show="aiAnalyzing" size="small">
                <n-button size="small" :disabled="!selectedTask" @click="handleAIAnalyze">
                  AI 分析
                </n-button>
              </n-spin>
            </div>
          </div>
        </div>
        <div class="task-list-content">
          <!-- 虚拟滚动任务列表 -->
          <DynamicScroller
            ref="taskScrollerRef"
            class="virtual-scroller"
            :items="filteredTasks"
            key-field="key"
            :min-item-size="taskItemHeight"
          >
            <template #default="{ item, active }">
              <DynamicScrollerItem
                :item="item"
                :active="active"
                class="scroller-item"
                :style="{ paddingBottom: '0.325px' }"
              >
                <!-- 任务行 -->
                <div
                  class="task-row"
                  :class="{
                    active: item.key === selectedTaskKey,
                    failed: item.status === 'failed',
                    highlight: item.key === highlightTaskKey,
                  }"
                  @click="handleTaskSelect({ taskKey: item.key, nodeId: null })"
                >
                  <!-- 任务行顶部：任务名 + 状态 -->
                  <div class="task-row-top">
                    <div class="task-main">
                      <div class="task-title">
                        {{ item.entry || "未命名任务" }}
                      </div>
                      <div class="task-tags">
                        <n-tag size="small" type="info">
                          进程ID：{{ item.processId || "P?" }}
                        </n-tag>
                        <n-tag size="small"> 线程ID：{{ item.threadId || "T?" }} </n-tag>
                      </div>
                    </div>
                    <div class="task-side">
                      <n-tag :type="item.status === 'failed' ? 'error' : 'success'" size="small">
                        状态：{{ formatTaskStatus(item.status) }}
                      </n-tag>
                    </div>
                  </div>
                  <!-- 任务行底部：节点 + 时间 -->
                  <div class="task-row-bottom">
                    <div class="task-sub">
                      <n-tag type="info" size="small">节点：{{ item.nodes.length }}</n-tag>
                    </div>
                    <div class="task-side">
                      <span
                        >开始时间：
                        {{ formatTaskTimeParts(item.start_time).date }}
                        {{ formatTaskTimeParts(item.start_time).time }}</span
                      >
                      <span>耗时：{{ item.duration ? formatDuration(item.duration) : "-" }}</span>
                    </div>
                  </div>
                </div>
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
        </div>
      </div>
      <!-- 中栏：节点列表 -->
      <div class="node-list">
        <div class="panel-top">
          <div class="node-header">
            <span>节点列表</span>
          </div>
        </div>
        <!-- 空状态：未选择任务 -->
        <div v-if="!selectedTaskKey" class="empty">请选择左侧任务</div>
        <div v-else class="node-list-content">
          <!-- 虚拟滚动节点列表 -->
          <DynamicScroller
            ref="nodeScrollerRef"
            class="virtual-scroller"
            :items="selectedTaskNodes"
            key-field="node_id"
            :min-item-size="nodeItemHeight"
          >
            <template #default="{ item, active }">
              <DynamicScrollerItem
                :item="item"
                :active="active"
                :size-dependencies="[item.name, item.status, item.recognition_attempts?.length]"
                class="scroller-item"
                :style="{ paddingBottom: '0.325px' }"
              >
                <!-- 节点行 -->
                <div
                  class="node-row"
                  :class="{
                    active: item.node_id === selectedNodeId,
                    failed: item.status === 'failed',
                    highlight: item.node_id === highlightNodeId,
                  }"
                  @click="handleNodeSelect(item.node_id)"
                >
                  <!-- 节点主要信息 -->
                  <div class="node-main">
                    <div class="node-name">
                      <span>{{ item.name || item.node_id }}</span>
                      <n-icon
                        v-if="item.error_screenshot"
                        class="error-screenshot-badge"
                        color="#d03050"
                        size="18"
                        title="有错误截图"
                      >
                        <PictureFilled />
                      </n-icon>
                    </div>
                    <div class="node-sub">
                      <div v-if="item.start_time">开始时间：{{ item.start_time }}</div>
                      <div>完成时间：{{ item.end_time || item.timestamp }}</div>
                      <span :style="{ color: item.status === 'failed' ? '#d03050' : '#18a058' }">
                        状态：{{ formatResultStatus(item.status) }}
                      </span>
                    </div>
                  </div>
                  <!-- 节点徽章 -->
                  <div class="node-badges">
                    <n-tag type="warning" size="small"
                      >进行识别：{{ item.recognition_attempts?.length || 0 }}</n-tag
                    >
                    <n-tag type="info" size="small"
                      >Next列表：{{
                        item.next_list_attempts?.[0]?.list?.length || item.next_list?.length || 0
                      }}</n-tag
                    >
                  </div>
                </div>
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
          <!-- 空状态：无节点 -->
          <div v-if="(selectedTask?.nodes || []).length === 0" class="empty">未发现节点事件</div>
        </div>
      </div>
      <!-- 右栏：节点详情 -->
      <div class="detail-panel">
        <div class="panel-top">
          <div class="node-header">节点详情</div>
        </div>
        <!-- 空状态：未选择任务 -->
        <div v-if="!selectedTask" class="empty">请选择左侧任务</div>
        <div
          v-else
          ref="detailContentRef"
          class="detail-content"
          :class="{ highlight: detailPanelHighlight }"
        >
          <!-- 错误截图 -->
          <n-collapse v-model:expanded-names="screenshotExpanded" class="error-screenshot-collapse">
            <n-collapse-item name="screenshot">
              <template #header>
                <span class="error-screenshot-label">错误截图</span>
              </template>
              <template #header-extra>
                <span v-if="!hasErrorScreenshot" class="no-screenshot-hint">无截图</span>
              </template>
              <n-image
                v-if="hasErrorScreenshot"
                :src="convertFileSrc(selectedNode!.error_screenshot!)"
                object-fit="contain"
                class="error-screenshot-image"
                preview-disabled
                @click="openScreenshot(selectedNode!.error_screenshot!)"
              />
              <div v-else class="error-screenshot-empty">无截图</div>
            </n-collapse-item>
          </n-collapse>
          <!-- 控制器信息卡片 -->
          <ControllerInfoCard
            v-if="selectedTask.controllerInfo"
            :controller-info="selectedTask.controllerInfo"
          />
          <!-- AI 分析结果卡片 -->
          <AIResultCard :results="aiResults" :error="aiError" :stats="aiStats" />
          <!-- 空状态：未选择节点 -->
          <div v-if="!selectedNode" class="empty">请选择节点</div>
          <template v-else>
            <!-- 识别详情卡片 -->
            <div v-if="selectedNode.reco_details" class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情</div>
                <n-button size="tiny" @click="copyJson(selectedNode.reco_details)"> 复制 </n-button>
              </div>
              <div class="detail-section-grid">
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别 ID</div>
                  <div class="detail-section-value">
                    {{ selectedNode.reco_details.reco_id }}
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别算法</div>
                  <div class="detail-section-value">
                    <n-tag size="small" type="info">
                      {{ selectedNode.reco_details.algorithm }}
                    </n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">节点名称</div>
                  <div class="detail-section-value">
                    {{ selectedNode.reco_details.name }}
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别位置</div>
                  <div class="detail-section-value detail-section-box">
                    {{ formatBox(selectedNode.reco_details.box) }}
                  </div>
                </div>
              </div>
              <!-- 原始识别数据折叠面板 -->
              <n-collapse class="detail-section-collapse" :default-expanded-names="[]">
                <n-collapse-item title="原始识别数据" name="reco-raw">
                  <n-code
                    :code="JSON.stringify(selectedNode.reco_details, null, 2)"
                    language="json"
                    word-wrap
                    class="detail-code"
                  />
                </n-collapse-item>
              </n-collapse>
            </div>
            <!-- 无识别详情，但有识别尝试 -->
            <div
              v-else-if="(selectedNode.recognition_attempts || []).length > 0"
              class="detail-section-card"
            >
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情（识别失败）</div>
              </div>
              <div class="detail-section-grid">
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别算法</div>
                  <div class="detail-section-value">
                    <n-tag
                      v-if="selectedNode.recognition_attempts[0]?.reco_details?.algorithm"
                      size="small"
                      type="error"
                    >
                      {{ selectedNode.recognition_attempts[0].reco_details.algorithm }}
                    </n-tag>
                    <div v-else>零个</div>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">识别次数</div>
                  <div class="detail-section-value">
                    <n-tag type="warning" size="small">{{
                      selectedNode.recognition_attempts.length
                    }}</n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">成功次数</div>
                  <div class="detail-section-value">
                    <n-tag type="success" size="small">{{
                      formatCount(
                        selectedNode.recognition_attempts.filter((a) => a.status === "success")
                          .length
                      )
                    }}</n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">失败次数</div>
                  <div class="detail-section-value">
                    <n-tag type="error" size="small">{{
                      formatCount(
                        selectedNode.recognition_attempts.filter((a) => a.status === "failed")
                          .length
                      )
                    }}</n-tag>
                  </div>
                </div>
              </div>
            </div>
            <!-- 无识别详情 -->
            <div v-else class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">识别详情</div>
              </div>
              <div class="empty">Recognition 详情</div>
            </div>
            <!-- 动作详情卡片 -->
            <div v-if="selectedNode.action_details" class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">动作详情</div>
                <n-button size="tiny" @click="copyJson(selectedNode.action_details)">
                  复制
                </n-button>
              </div>
              <div class="detail-section-grid">
                <div class="detail-section-cell">
                  <div class="detail-section-label">动作 ID</div>
                  <div class="detail-section-value">
                    {{ selectedNode.action_details.action_id }}
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">动作类型</div>
                  <div class="detail-section-value">
                    <n-tag size="small" type="success">
                      {{ selectedNode.action_details.action }}
                    </n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">节点名称</div>
                  <div class="detail-section-value">
                    {{ selectedNode.action_details.name }}
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">执行结果</div>
                  <div class="detail-section-value">
                    <n-tag
                      size="small"
                      :type="selectedNode.action_details.success ? 'success' : 'error'"
                    >
                      {{ selectedNode.action_details.success ? "成功" : "失败" }}
                    </n-tag>
                  </div>
                </div>
                <div class="detail-section-cell">
                  <div class="detail-section-label">目标位置</div>
                  <div class="detail-section-value detail-section-box">
                    {{ formatBox(selectedNode.action_details.box) }}
                  </div>
                </div>
              </div>
              <!-- Wait Freezes 图片 -->
              <WaitFreezesImages
                v-if="visionDir"
                :vision-dir="visionDir"
                :node-name="selectedNode.action_details.name"
                :start-time="selectedNode.start_time"
                :end-time="selectedNode.end_time"
              />
              <!-- 原始动作数据折叠面板 -->
              <n-collapse class="detail-section-collapse" :default-expanded-names="[]">
                <n-collapse-item title="原始动作数据" name="action-raw">
                  <n-code
                    :code="JSON.stringify(selectedNode.action_details, null, 2)"
                    language="json"
                    word-wrap
                    class="detail-code"
                  />
                </n-collapse-item>
              </n-collapse>
            </div>
            <!-- 无动作详情 -->
            <div v-else class="detail-section-card">
              <div class="detail-section-header">
                <div class="detail-section-title">动作详情</div>
              </div>
              <div class="empty">无动作详情</div>
            </div>
            <!-- 详细信息折叠面板 -->
            <n-collapse v-model:expanded-names="detailExpandedNames">
              <!-- 基础信息 -->
              <n-collapse-item name="base">
                <template #header>
                  <div class="collapse-header">
                    <span>基础信息</span>
                    <span class="collapse-summary">{{ summarizeBase(selectedNode) }}</span>
                  </div>
                </template>
                <div class="detail-grid">
                  <div>名称: {{ selectedNode.name }}</div>
                  <div v-if="selectedNode.start_time">开始时间: {{ selectedNode.start_time }}</div>
                  <div>完成时间: {{ selectedNode.end_time || selectedNode.timestamp }}</div>
                  <div>
                    状态：
                    <n-tag
                      size="small"
                      :type="selectedNode.status === 'success' ? 'success' : 'error'"
                    >
                      {{ formatResultStatus(selectedNode.status) }}
                    </n-tag>
                  </div>
                  <div>任务ID: {{ selectedNode.task_id }}</div>
                  <div>节点ID: {{ selectedNode.node_id }}</div>
                </div>
              </n-collapse-item>
              <!-- 识别尝试 -->
              <n-collapse-item name="reco">
                <template #header>
                  <div class="collapse-header">
                    <span>识别尝试</span>
                    <span class="collapse-summary">{{ summarizeRecognition(selectedNode) }}</span>
                  </div>
                </template>
                <div v-if="(selectedNode.recognition_attempts || []).length === 0" class="empty">
                  无识别尝试记录
                </div>
                <div v-else class="recognition-attempts-list">
                  <n-collapse
                    v-for="(attempt, index) in selectedNode.recognition_attempts"
                    :key="`${selectedNode.node_id}-${index}`"
                    :default-expanded-names="[]"
                  >
                    <n-collapse-item
                      :title="`${attempt.name || 'Recognition'}`"
                      :name="`attempt-${index}`"
                      class="recognition-attempt-item"
                      :class="{ highlight: attempt.reco_id === highlightRecoId }"
                    >
                      <template #header-extra>
                        <n-tag
                          :type="
                            attempt.status === 'success'
                              ? 'success'
                              : attempt.status === 'disabled'
                                ? 'warning'
                                : 'error'
                          "
                          size="tiny"
                        >
                          {{ formatResultStatus(attempt.status) }}
                        </n-tag>
                      </template>
                      <div v-if="attempt.reco_details" class="attempt-details">
                        <div v-if="attempt.reco_details.algorithm" class="attempt-detail-row">
                          <span class="attempt-label">算法：</span>
                          <n-tag size="small" type="info">
                            {{ attempt.reco_details.algorithm }}
                          </n-tag>
                        </div>
                        <div v-if="attempt.reco_details.name" class="attempt-detail-row">
                          <span class="attempt-label">名称：</span>
                          <span>{{ attempt.reco_details.name }}</span>
                        </div>
                        <div v-if="attempt.reco_details.reco_id" class="attempt-detail-row">
                          <span class="attempt-label">ID：</span>
                          <span>{{ attempt.reco_details.reco_id }}</span>
                        </div>
                        <div v-if="attempt.reco_details.box" class="attempt-detail-row">
                          <span class="attempt-label">位置：</span>
                          <span>{{ formatBox(attempt.reco_details.box) }}</span>
                        </div>
                        <div
                          v-if="formatRecognitionScores(attempt.reco_details.detail)"
                          class="attempt-detail-row"
                        >
                          <span class="attempt-label">分数：</span>
                          <span>{{ formatRecognitionScores(attempt.reco_details.detail) }}</span>
                        </div>
                        <div
                          v-if="
                            hasNestedRecognition(attempt.reco_details.detail) ||
                            (attempt.nested_nodes && attempt.nested_nodes.length > 0)
                          "
                          class="attempt-detail-row"
                        >
                          <span class="attempt-label">嵌套识别：</span>
                          <div class="nested-recognition-list">
                            <RecognitionTree
                              v-if="hasNestedRecognition(attempt.reco_details.detail)"
                              :node="attempt.reco_details"
                              :depth="0"
                              :vision-dir="visionDir"
                              is-root
                            />
                            <RecognitionTree
                              v-for="(nested, idx) in attempt.nested_nodes"
                              :key="`nested-${idx}`"
                              :node="nested.reco_details!"
                              :depth="0"
                              :vision-dir="visionDir"
                            />
                          </div>
                        </div>
                        <n-collapse class="raw-data-collapse">
                          <n-collapse-item name="raw-data" title="原始数据">
                            <json-viewer
                              :value="attempt.reco_details"
                              :expand-depth="props.jsonExpandDepth"
                              copyable
                            />
                          </n-collapse-item>
                        </n-collapse>
                        <div
                          v-if="!hasNestedRecognition(attempt.reco_details.detail)"
                          class="attempt-detail-row vision-row"
                        >
                          <span class="attempt-label">Vision：</span>
                          <RecognitionTree
                            :node="attempt.reco_details"
                            :depth="0"
                            :vision-dir="visionDir"
                            vision-only
                          />
                        </div>
                      </div>
                      <div v-else class="empty">无识别详情</div>
                    </n-collapse-item>
                  </n-collapse>
                </div>
              </n-collapse-item>
              <!-- Next List -->
              <n-collapse-item name="next">
                <template #header>
                  <div class="collapse-header">
                    <span>Next List</span>
                    <span class="collapse-summary">{{ summarizeNextList(selectedNode) }}</span>
                  </div>
                </template>
                <div
                  v-if="(selectedNode.next_list_attempts || []).length === 0"
                  class="next-list-simple"
                >
                  <div v-if="(selectedNode.next_list || []).length === 0" class="empty">
                    无 Next List
                  </div>
                  <div v-else class="next-list">
                    <n-tag
                      v-for="(item, idx) in selectedNode.next_list"
                      :key="`${selectedNode.node_id}-next-${idx}`"
                      size="small"
                      type="info"
                    >
                      {{ formatNextName(item) }}
                    </n-tag>
                  </div>
                </div>
                <div v-else class="next-list-attempts-list">
                  <div
                    v-if="(selectedNode.next_list_attempts || []).length === 1"
                    class="next-list-simple"
                  >
                    <div v-if="selectedNode.next_list_attempts[0].list.length === 0" class="empty">
                      无 Next List
                    </div>
                    <div v-else class="next-list">
                      <n-tag
                        v-for="(item, idx) in selectedNode.next_list_attempts[0].list"
                        :key="`${selectedNode.node_id}-next-${idx}`"
                        size="small"
                        type="info"
                      >
                        {{ formatNextName(item) }}
                      </n-tag>
                    </div>
                  </div>
                  <template v-else>
                    <n-collapse
                      v-for="(attempt, index) in selectedNode.next_list_attempts"
                      :key="`${selectedNode.node_id}-next-attempt-${index}`"
                      :default-expanded-names="[]"
                    >
                      <n-collapse-item
                        :title="`尝试 ${index + 1}`"
                        :name="`next-attempt-${index}`"
                        class="next-list-attempt-item"
                      >
                        <template #header-extra>
                          <n-tag
                            :type="attempt.status === 'success' ? 'success' : 'error'"
                            size="tiny"
                          >
                            {{ attempt.status === "success" ? "成功" : "失败" }}
                          </n-tag>
                        </template>
                        <div class="attempt-details">
                          <div class="attempt-detail-row">
                            <span class="attempt-label">时间：</span>
                            <span>{{ attempt.timestamp }}</span>
                          </div>
                          <div v-if="attempt.list.length === 0" class="empty">无 Next List</div>
                          <div v-else class="next-list">
                            <n-tag
                              v-for="(item, idx) in attempt.list"
                              :key="`${selectedNode.node_id}-next-attempt-${index}-${idx}`"
                              size="small"
                              type="info"
                            >
                              {{ formatNextName(item) }}
                            </n-tag>
                          </div>
                        </div>
                      </n-collapse-item>
                    </n-collapse>
                  </template>
                </div>
              </n-collapse-item>
              <!-- 嵌套动作节点 -->
              <n-collapse-item name="nested-action-nodes">
                <template #header>
                  <div class="collapse-header">
                    <span>嵌套动作节点</span>
                    <span class="collapse-summary">{{
                      summarizeNestedActionNodes(selectedNode)
                    }}</span>
                  </div>
                </template>
                <div v-if="(selectedNode.nested_action_nodes || []).length === 0" class="empty">
                  无嵌套动作节点
                </div>
                <div v-else class="nested-action-nodes">
                  <n-collapse>
                    <n-collapse-item
                      v-for="(nested, nestedIdx) in selectedNode.nested_action_nodes"
                      :key="`${selectedNode.node_id}-nested-action-${nestedIdx}`"
                      :name="`nested-action-${nestedIdx}`"
                    >
                      <template #header>
                        <span>{{ nested.name || "NestedAction" }}</span>
                      </template>
                      <template #header-extra>
                        <n-tag
                          :type="nested.status === 'success' ? 'success' : 'error'"
                          size="tiny"
                        >
                          {{ formatResultStatus(nested.status) }}
                        </n-tag>
                      </template>
                      <div v-if="nested.action_details" class="attempt-details">
                        <div v-if="nested.action_details.action" class="attempt-detail-row">
                          <span class="attempt-label">动作：</span>
                          <n-tag size="small" type="info">
                            {{ nested.action_details.action }}
                          </n-tag>
                        </div>
                        <div v-if="nested.action_details.box" class="attempt-detail-row">
                          <span class="attempt-label">区域:</span>
                          <span>{{ formatBox(nested.action_details.box) }}</span>
                        </div>
                      </div>
                      <div v-if="(nested.actions || []).length > 1" class="nested-attempts">
                        <div class="nested-title">
                          <n-tag type="info" size="small"
                            >子动作 ({{ nested.actions?.length }})</n-tag
                          >
                        </div>
                        <n-collapse>
                          <n-collapse-item
                            v-for="(action, actionIdx) in nested.actions"
                            :key="`nested-action-${nestedIdx}-action-${actionIdx}`"
                            :title="action.name || 'Action'"
                            :name="`action-${actionIdx}`"
                          >
                            <template #header-extra>
                              <n-tag
                                :type="action.status === 'success' ? 'success' : 'error'"
                                size="tiny"
                              >
                                {{ formatResultStatus(action.status) }}
                              </n-tag>
                            </template>
                            <div v-if="action.action_details" class="attempt-details">
                              <div v-if="action.action_details.action" class="attempt-detail-row">
                                <span class="attempt-label">动作:</span>
                                <n-tag size="small" type="info">
                                  {{ action.action_details.action }}
                                </n-tag>
                              </div>
                              <div v-if="action.action_details.box" class="attempt-detail-row">
                                <span class="attempt-label">区域:</span>
                                <span>{{ formatBox(action.action_details.box) }}</span>
                              </div>
                            </div>
                            <div v-else class="empty">无动作详情</div>
                          </n-collapse-item>
                        </n-collapse>
                      </div>
                    </n-collapse-item>
                  </n-collapse>
                </div>
              </n-collapse-item>
              <!-- 节点配置 -->
              <n-collapse-item name="node-detail">
                <template #header>
                  <div class="collapse-header">
                    <span>节点配置</span>
                    <span class="collapse-summary">{{ summarizeNodeDetail(selectedNode) }}</span>
                  </div>
                </template>
                <div v-if="selectedNode.node_details" class="detail-actions">
                  <n-button size="tiny" @click="copyJson(selectedNode.node_details)">
                    复制
                  </n-button>
                </div>
                <n-code
                  v-if="selectedNode.node_details"
                  :code="JSON.stringify(selectedNode.node_details, null, 2)"
                  language="json"
                  word-wrap
                  class="detail-code"
                />
                <div v-else class="empty">无节点配置</div>
              </n-collapse-item>
              <!-- Focus 信息 -->
              <n-collapse-item name="focus">
                <template #header>
                  <div class="collapse-header">
                    <span>Focus</span>
                    <span class="collapse-summary">{{ summarizeFocus(selectedNode) }}</span>
                  </div>
                </template>
                <div v-if="selectedNode.focus" class="detail-actions">
                  <n-button size="tiny" @click="copyJson(selectedNode.focus)"> 复制 </n-button>
                </div>
                <n-code
                  v-if="selectedNode.focus"
                  :code="JSON.stringify(selectedNode.focus, null, 2)"
                  language="json"
                  word-wrap
                  class="detail-code"
                />
                <div v-else class="empty">无 Focus 信息</div>
              </n-collapse-item>
              <!-- Focus 消息 - 识别 -->
              <n-collapse-item name="focus-recognition">
                <template #header>
                  <div class="collapse-header">
                    <span>识别 Focus</span>
                    <span class="collapse-summary">{{
                      props.selectedNodeFocusLogs.recognition.length
                    }}</span>
                  </div>
                </template>
                <div v-if="props.selectedNodeFocusLogs.recognition.length === 0" class="empty">
                  无识别 Focus 消息
                </div>
                <div v-else class="focus-log-list">
                  <div
                    v-for="log in props.selectedNodeFocusLogs.recognition"
                    :key="log.key"
                    class="focus-log-item"
                  >
                    <div class="focus-log-header">
                      <n-tag size="small" type="info">{{ log.details?.event }}</n-tag>
                      <span class="focus-log-time">{{ log.timestamp }}</span>
                    </div>
                    <div class="focus-log-message">{{ log.message }}</div>
                  </div>
                </div>
              </n-collapse-item>
              <!-- Focus 消息 - 动作 -->
              <n-collapse-item name="focus-action">
                <template #header>
                  <div class="collapse-header">
                    <span>动作 Focus</span>
                    <span class="collapse-summary">{{
                      props.selectedNodeFocusLogs.action.length
                    }}</span>
                  </div>
                </template>
                <div v-if="props.selectedNodeFocusLogs.action.length === 0" class="empty">
                  无动作 Focus 消息
                </div>
                <div v-else class="focus-log-list">
                  <div
                    v-for="log in props.selectedNodeFocusLogs.action"
                    :key="log.key"
                    class="focus-log-item"
                  >
                    <div class="focus-log-header">
                      <n-tag size="small" type="info">{{ log.details?.event }}</n-tag>
                      <span class="focus-log-time">{{ log.timestamp }}</span>
                    </div>
                    <div class="focus-log-message">{{ log.message }}</div>
                  </div>
                </div>
              </n-collapse-item>
            </n-collapse>
          </template>
          <!-- Custom 日志区域 -->
          <CustomLogPanel
            :aux-logs="selectedTaskAuxLogs"
            :custom-actions="selectedNodeCustomActions"
            :selected-aux-levels="props.selectedAuxLevels"
            :hidden-callers="props.hiddenCallers"
            :highlighted-aux-log-key="highlightAuxLogKey"
            :caller-options="props.callerOptions"
            :format-aux-level="formatAuxLevel"
            @update:selected-aux-levels="emit('update:selectedAuxLevels', $event)"
            @update:hidden-callers="emit('update:hiddenCallers', $event)"
          />
        </div>
      </div>
    </div>
    <!-- AI 分析确认弹窗 -->
    <n-modal
      v-model:show="showAIConfirm"
      preset="dialog"
      title="确认开始分析"
      positive-text="确认"
      negative-text="取消"
      @positive-click="doAIAnalyze"
      @update:show="
        (val: boolean) => {
          if (!val) showAIConfirm = val;
        }
      "
    >
      <n-checkbox v-model:checked="skipAIConfirm"> 不再提醒 </n-checkbox>
    </n-modal>
    <!-- 错误截图查看弹窗 -->
    <n-modal
      v-model:show="showScreenshot"
      preset="card"
      title="错误截图"
      :closable="true"
      style="width: 80vw; max-width: 900px"
    >
      <div class="screenshot-modal-content">
        <n-image :src="screenshotSrc" object-fit="contain" />
      </div>
    </n-modal>
  </n-card>
</template>

<!--
  样式部分
-->
<style scoped>
.panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel :deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ai-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.node-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-sub {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.task-row-top,
.task-row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.task-row {
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  border: 1px solid transparent;
}

.task-row.failed {
  border-left: 3px solid #d03050;
}

.task-row.highlight {
  animation: highlight-flash 1.5s ease-out;
  position: relative;
}

.task-sub,
.task-side {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.task-sub {
  align-items: center;
}

.task-side {
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.collapse-header {
  display: flex;
  gap: 8px;
}

.panel-top {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: none;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
}

.panel-tools {
  display: flex;
  align-items: center;
  gap: 16px;
}

.view-mode-tabs {
  flex-shrink: 0;
}

.panel-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-select {
  width: 160px;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--n-text-color-3);
}

.task-layout {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1.4fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.task-list,
.node-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 8px;
  background: var(--n-color);
}

.task-list-content,
.node-list-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.virtual-scroller {
  height: 100%;
  padding: 8px;
  padding-bottom: 24px;
  box-sizing: border-box;
}

.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  padding: 8px;
  background: var(--n-color);
}

.detail-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  padding-bottom: 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-content.highlight {
  animation: highlight-flash 1.5s ease-out;
}

.recognition-attempt-item.highlight,
.action-attempt-item.highlight {
  animation: highlight-flash 1.5s ease-out;
  border: 2px solid #2080f0;
  border-radius: 6px;
}

.error-screenshot-collapse {
  margin-bottom: 8px;
}

.error-screenshot-label {
  font-weight: 500;
  font-size: 14px;
}

.error-screenshot-image {
  width: 100%;
  max-height: 300px;
  cursor: pointer;
  border-radius: 4px;
}

.error-screenshot-image :deep(img) {
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.error-screenshot-badge {
  margin-left: 6px;
  font-size: 14px;
}

.error-screenshot-empty {
  color: var(--n-text-color-3);
  font-size: 14px;
  text-align: center;
  padding: 16px;
}

.no-screenshot-hint {
  color: var(--n-text-color-3);
  font-size: 12px;
}

.screenshot-modal-content {
  display: flex;
  justify-content: center;
  align-items: center;
  max-height: 70vh;
  overflow: auto;
}

.screenshot-modal-content :deep(.n-image) {
  max-width: 100%;
  max-height: 70vh;
}

.screenshot-modal-content :deep(img) {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}

.focus-log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.focus-log-item {
  padding: 8px 12px;
  background: var(--n-color-modal);
  border-radius: 6px;
  border: 1px solid var(--n-border-color);
}

.focus-log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.focus-log-time {
  font-size: 11px;
  color: var(--n-text-color-3);
}

.focus-log-message {
  font-size: 13px;
  color: var(--n-text-color);
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-input {
  width: 320px;
}

.search-input :deep(.n-input-input) {
  text-overflow: clip;
  overflow-x: auto;
}

.search-scope-select {
  width: 80px;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 500px;
  margin-top: 4px;
  background: var(--n-color-modal);
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
}

.search-results-header {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--n-text-color-3);
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-color-hover);
}

.search-results-list {
  max-height: 260px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.search-result-item:hover {
  background: var(--n-color-hover);
}

.result-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-label {
  font-size: 13px;
  color: var(--n-text-color);
  white-space: normal;
  word-break: break-word;
}

.result-meta {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--n-text-color-3);
  white-space: normal;
  word-break: break-word;
}

.result-meta-part {
  white-space: normal;
}

.node-row.highlight {
  animation: highlight-flash 1.5s ease-out;
  position: relative;
}

@keyframes highlight-flash {
  0% {
    background: rgba(250, 173, 20, 0.6);
    box-shadow: 0 0 12px rgba(250, 173, 20, 0.8);
  }
  30% {
    background: rgba(250, 173, 20, 0.5);
    box-shadow: 0 0 8px rgba(250, 173, 20, 0.6);
  }
  60% {
    background: rgba(250, 173, 20, 0.3);
    box-shadow: 0 0 4px rgba(250, 173, 20, 0.4);
  }
  100% {
    background: transparent;
    box-shadow: none;
  }
}

.attempt-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  background: var(--n-color-modal);
}

.attempt-detail-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.attempt-detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px solid var(--n-border-color);
}

.attempt-detail-row:last-child {
  border-bottom: none;
}

.attempt-label {
  color: var(--n-text-color-3);
  flex-shrink: 0;
  min-width: 60px;
}

.vision-row {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--n-border-color);
  border-bottom: none;
}

.nested-recognition-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.raw-data-collapse {
  margin-top: 8px;
  margin-left: 0;
  padding-left: 0;
}

.raw-data-collapse :deep(.n-collapse-item) {
  margin-left: 0;
  padding-left: 0;
}

.raw-data-collapse :deep(.n-collapse-item__content-inner) {
  padding: 0;
  margin: 0;
}

.raw-data-collapse :deep(.n-collapse-item__content) {
  padding: 0 !important;
  margin: 0;
}

.raw-data-collapse :deep(.jv-container) {
  margin: 0;
  padding: 8px 12px;
  background: transparent !important;
}

.raw-data-collapse :deep(.jv-code) {
  padding: 0;
  border: none;
  margin: 0;
}

.raw-data-collapse :deep(.jv-node) {
  position: relative;
}

.raw-data-collapse :deep(.jv-node .jv-node) {
  border-left: 1px dashed rgba(128, 128, 128, 0.5);
  margin-left: 5px !important;
  padding-left: 15px;
}

.raw-data-collapse :deep(.jv-more) {
  padding-left: 12px;
}

.raw-data-collapse :deep(.jv-container.jv-light) {
  background: transparent !important;
  color: var(--n-text-color);
}

.raw-data-collapse :deep(.jv-container.jv-light .jv-key) {
  color: var(--n-text-color);
}

.raw-data-collapse :deep(.jv-container.jv-light .jv-item.jv-array),
.raw-data-collapse :deep(.jv-container.jv-light .jv-item.jv-object) {
  color: var(--n-text-color);
}

.raw-data-collapse :deep(.jv-container.jv-light .jv-item.jv-string) {
  color: #98c379;
}

.raw-data-collapse :deep(.jv-container.jv-light .jv-item.jv-number) {
  color: #d19a66;
}

.raw-data-collapse :deep(.jv-container.jv-light .jv-item.jv-boolean) {
  color: #c678dd;
}

.raw-data-collapse :deep(.jv-container.jv-light .jv-ellipsis) {
  background: var(--n-color-modal);
  color: #49b3ff;
  cursor: pointer;
  font-weight: bold;
}

.raw-data-collapse :deep(.jv-container.jv-light .jv-ellipsis:hover) {
  background: #49b3ff;
  color: white;
}

.raw-data-collapse :deep(.jv-container.jv-light .jv-button) {
  color: var(--n-primary-color);
}
</style>
