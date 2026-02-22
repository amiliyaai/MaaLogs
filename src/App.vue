<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { NConfigProvider } from "naive-ui";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readDir, readTextFile, readFile } from "@tauri-apps/plugin-fs";
import { join, appDataDir, appLogDir } from "@tauri-apps/api/path";
import { unzipSync } from "fflate";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import AppTopBar from "./components/AppTopBar.vue";
import HeroPanel from "./components/HeroPanel.vue";
import FileListPanel from "./components/FileListPanel.vue";
import AnalysisPanel from "./components/AnalysisPanel.vue";
import SearchPanel from "./components/SearchPanel.vue";
import StatisticsPanel from "./components/StatisticsPanel.vue";
import type {
  ActionDetail,
  ActionAttempt,
  AuxLogEntry,
  EventNotification,
  LogLine,
  NextListItem,
  NodeInfo,
  NodeStat,
  PipelineCustomActionInfo,
  RecognitionAttempt,
  RawLine,
  SearchResult,
  SelectedFile,
  TaskInfo
} from "./types/logTypes";
import { createLogger, init, setLoggerContext, flushLogs } from "./utils/logger";

const logger = createLogger("App");

const selectedFiles = ref<SelectedFile[]>([]);
const totalSize = ref(0);
const parseState = ref<"idle" | "ready" | "parsing" | "done">("idle");
const statusMessage = ref("请先选择日志文件");
const isDragging = ref(false);
const tasks = ref<TaskInfo[]>([]);
const rawLines = ref<RawLine[]>([]);
const selectedTaskKey = ref<string | null>(null);
const selectedNodeId = ref<number | null>(null);
const selectedRecognitionIndex = ref<number | null>(null);
const selectedNestedIndex = ref<number | null>(null);
const selectedNestedActionIndex = ref<number | null>(null);
const selectedRecognitionInActionIndex = ref<number | null>(null);
const viewMode = ref<"analysis" | "search" | "statistics">("analysis");
const searchText = ref("");
const searchCaseSensitive = ref(false);
const searchUseRegex = ref(false);
const hideDebugInfo = ref(true);
const searchMaxResults = ref(500);
const searchResults = ref<SearchResult[]>([]);
const searchMessage = ref("");
const statSort = ref<"avgDuration" | "count" | "failRate">("avgDuration");
const statKeyword = ref("");
const copyMessage = ref("");
const auxLogs = ref<AuxLogEntry[]>([]);
const pipelineCustomActions = ref<Record<string, PipelineCustomActionInfo[]>>({});
const selectedAuxLevels = ref<string[]>(["error", "warn", "info", "debug", "other"]);
const taskItemHeight = 120;
const nodeItemHeight = 72;
const searchItemHeight = 64;
const parseProgress = ref(0);
const selectedProcessId = ref("all");
const selectedThreadId = ref("all");

/**
 * 根据进程/线程过滤任务列表。
 */
const filteredTasks = computed(() => {
  return tasks.value.filter(task => {
    const matchesProcess =
      selectedProcessId.value === "all" || task.processId === selectedProcessId.value;
    const matchesThread =
      selectedThreadId.value === "all" || task.threadId === selectedThreadId.value;
    return matchesProcess && matchesThread;
  });
});

/**
 * 当前选中的任务对象。
 */
const selectedTask = computed(() => {
  if (!selectedTaskKey.value) return null;
  return filteredTasks.value.find(task => task.key === selectedTaskKey.value) || null;
});

/**
 * 当前选中的节点对象。
 */
const selectedNode = computed(() => {
  if (!selectedTask.value || selectedNodeId.value === null) return null;
  return selectedTask.value.nodes.find(node => node.node_id === selectedNodeId.value) || null;
});

const selectedTaskNodes = computed(() => selectedTask.value?.nodes || []);
const selectedNodeAuxWindowLabel = computed(() => {
  if (!selectedTask.value || !selectedNode.value) return "";
  return "关联算法 · 节点区间";
});
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
const selectedNodeAuxGroups = computed(() => {
  if (!selectedTask.value) {
    return { matched: [], unmatched: [], failed: [] } as {
      matched: AuxLogEntry[];
      unmatched: AuxLogEntry[];
      failed: AuxLogEntry[];
    };
  }
  const taskKey = selectedTask.value.key;
  const matchesLevel = (log: AuxLogEntry) => {
    const normalizedLevel = normalizeAuxLevel(log.level);
    return selectedAuxLevels.value.includes(normalizedLevel);
  };
  const matched =
    selectedNode.value === null
      ? []
      : auxLogs.value.filter(
          log =>
            log.correlation?.status === "matched" &&
            log.correlation?.taskKey === taskKey &&
            log.correlation?.nodeId === selectedNode.value?.node_id &&
            matchesLevel(log)
        );
  const unmatched = auxLogs.value.filter(
    log => log.correlation?.status === "unmatched" && log.correlation?.taskKey === taskKey && matchesLevel(log)
  );
  const failed = auxLogs.value.filter(
    log => log.correlation?.status === "failed" && log.correlation?.taskKey === taskKey && matchesLevel(log)
  );
  return { matched, unmatched, failed };
});

const selectedNodeAuxLogs = computed(() => selectedNodeAuxGroups.value.matched);

const processOptions = computed(() => {
  const ids = Array.from(new Set(tasks.value.map(task => task.processId).filter(Boolean)));
  return [
    { label: "全部进程", value: "all" },
    ...ids.map(id => ({ label: id, value: id }))
  ];
});

const threadOptions = computed(() => {
  const ids = Array.from(new Set(tasks.value.map(task => task.threadId).filter(Boolean)));
  return [
    { label: "全部线程", value: "all" },
    ...ids.map(id => ({ label: id, value: id }))
  ];
});

watch(selectedNodeId, () => {
  selectedRecognitionIndex.value = null;
  selectedNestedIndex.value = null;
  selectedNestedActionIndex.value = null;
  selectedRecognitionInActionIndex.value = null;
});

watch(selectedTaskKey, () => {
  selectedRecognitionIndex.value = null;
  selectedNestedIndex.value = null;
  selectedNestedActionIndex.value = null;
  selectedRecognitionInActionIndex.value = null;
});

watch(filteredTasks, () => {
  if (!selectedTaskKey.value || !filteredTasks.value.some(task => task.key === selectedTaskKey.value)) {
    selectedTaskKey.value = filteredTasks.value[0]?.key ?? null;
    selectedNodeId.value = filteredTasks.value[0]?.nodes[0]?.node_id ?? null;
  }
});

/**
 * 将字节数转为易读的字符串。
 * @param value 字节数
 * @returns 格式化后的大小字符串
 */
function formatSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 推断文件类型，优先使用浏览器提供的 MIME。
 * @param file 目标文件
 * @returns 文件类型字符串
 */
function getFileType(file: File) {
  if (file.type) return file.type;
  const parts = file.name.split(".");
  if (parts.length < 2) return "unknown";
  const extension = parts.pop();
  return extension ? extension.toLowerCase() : "unknown";
}

/**
 * 组合 NextList 展示名称。
 * @param item NextList 条目
 * @returns 展示用字符串
 */
function formatNextName(item: NextListItem) {
  let prefix = "";
  if (item.jump_back) prefix += "[JumpBack] ";
  if (item.anchor) prefix += "[Anchor] ";
  return prefix + item.name;
}

/**
 * 将毫秒时长转换为可读文本。
 * @param value 毫秒数
 * @returns 格式化后的时长
 */
function formatDuration(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest.toFixed(1)}s`;
}

/**
 * 任务状态中文化。
 * @param status 任务状态
 * @returns 中文文案
 */
function formatTaskStatus(status: TaskInfo["status"]) {
  if (status === "succeeded") return "成功";
  if (status === "failed") return "失败";
  return "运行中";
}

/**
 * 任务时间拆分为日期和时间。
 * @param value 时间字符串
 * @returns 日期与时间片段
 */
function formatTaskTimeParts(value: string) {
  if (!value) return { date: "", time: "" };
  const match = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
  if (match) {
    const seconds = match[3] ?? "00";
    return { date: match[1], time: `${match[2]}:${seconds}` };
  }
  return { date: value, time: "" };
}

/**
 * 识别/动作状态中文化。
 * @param status 状态值
 * @returns 中文文案
 */
function formatResultStatus(status: "success" | "failed") {
  return status === "success" ? "成功" : "失败";
}

/**
 * 将辅助日志等级映射为 UI 颜色类型。
 * @param level 原始日志等级
 * @returns Naive UI Tag 类型
 */
function formatAuxLevel(level: string): "default" | "primary" | "info" | "success" | "warning" | "error" {
  const normalized = level.toLowerCase();
  if (normalized === "error") return "error";
  if (normalized === "warn" || normalized === "warning") return "warning";
  if (normalized === "info") return "info";
  if (normalized === "debug") return "default";
  return "default";
}

/**
 * 将辅助日志等级规范化为统一枚举。
 * @param level 原始日志等级
 * @returns 归一化等级
 */
function normalizeAuxLevel(level: string) {
  const normalized = level.toLowerCase();
  if (normalized === "error") return "error";
  if (normalized === "warn" || normalized === "warning") return "warn";
  if (normalized === "info") return "info";
  if (normalized === "debug") return "debug";
  return "other";
}

/**
 * 从动作详情中提取 Custom Action 名称。
 * @param details 动作详情
 * @returns Custom Action 名称或 null
 */
function extractCustomActionFromActionDetails(details?: ActionDetail) {
  if (!details || details.action !== "Custom") return null;
  const detail = details.detail as Record<string, any> | undefined;
  if (!detail || typeof detail !== "object") return null;
  const custom =
    detail.custom_action || detail.customAction || detail.param?.custom_action || detail.param?.customAction;
  return typeof custom === "string" ? custom : null;
}

/**
 * 解析日志时间戳为毫秒时间。
 * @param value 时间戳字符串
 * @returns 毫秒时间或 null
 */
function parseTimestampToMs(value?: string) {
  if (!value) return null;
  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) return direct;
  const normalized = value.replace(" ", "T").replace(",", ".");
  const fallback = Date.parse(normalized);
  if (!Number.isNaN(fallback)) return fallback;
  return null;
}

/**
 * 计算并对齐 go-service 日志与任务时间轴的偏移量。
 * @param auxLogs 辅助日志
 * @param tasks 任务列表
 * @returns 带对齐时间戳的辅助日志
 */
function alignAuxLogsToTasks(auxLogs: AuxLogEntry[], tasks: TaskInfo[]) {
  logger.debug("开始对齐辅助日志时间轴", { auxLogCount: auxLogs.length, taskCount: tasks.length });
  const tasksById = new Map<number, { task: TaskInfo; startMs: number }[]>();
  const tasksByEntry = new Map<string, { task: TaskInfo; startMs: number }[]>();
  const tasksByKey = new Map<string, { task: TaskInfo; startMs: number }>();
  for (const task of tasks) {
    const startMs = parseTimestampToMs(task.start_time);
    if (startMs === null) continue;
    const item = { task, startMs };
    tasksByKey.set(`${task.task_id}::${task.entry}`, item);
    const idList = tasksById.get(task.task_id) || [];
    idList.push(item);
    tasksById.set(task.task_id, idList);
    const entryList = tasksByEntry.get(task.entry) || [];
    entryList.push(item);
    tasksByEntry.set(task.entry, entryList);
  }
  const offsetByTaskKey = new Map<string, number>();
  let lastContext: { task_id?: number; entry?: string } | null = null;
  for (const log of auxLogs) {
    if (log.source !== "go-service") continue;
    const timestampMs = log.timestampMs;
    if (timestampMs === undefined) continue;
    // 维护最近一次出现的 task_id/entry 上下文，便于后续日志归属
    if (log.task_id !== undefined || log.entry !== undefined) {
      const prevContext: { task_id?: number; entry?: string } = lastContext ?? {};
      lastContext = {
        task_id: log.task_id ?? prevContext.task_id,
        entry: log.entry ?? prevContext.entry
      };
    }
    const contextTaskId = log.task_id ?? (lastContext ? lastContext.task_id : undefined);
    const contextEntry = log.entry ?? (lastContext ? lastContext.entry : undefined);
    if (contextTaskId === undefined || !contextEntry) continue;
    const key = `${contextTaskId}::${contextEntry}`;
    if (offsetByTaskKey.has(key)) continue;
    const direct = tasksByKey.get(key);
    if (direct) {
      offsetByTaskKey.set(key, direct.startMs - timestampMs);
      continue;
    }
    const candidates = tasksById.get(contextTaskId) || [];
    if (candidates.length === 0) continue;
    // 从相同 task_id 的候选中选择最接近的开始时间作为对齐基准
    let best = candidates[0];
    let bestDelta = best.startMs - timestampMs;
    let bestAbs = Math.abs(bestDelta);
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const delta = candidate.startMs - timestampMs;
      const abs = Math.abs(delta);
      if (abs < bestAbs) {
        best = candidate;
        bestDelta = delta;
        bestAbs = abs;
      }
    }
    offsetByTaskKey.set(`${best.task.task_id}::${best.task.entry}`, bestDelta);
    logger.debug("计算时间偏移", {
      taskId: best.task.task_id,
      entry: best.task.entry,
      offsetMs: bestDelta
    });
  }
  logger.info("辅助日志偏移计算完成", { offsetCount: offsetByTaskKey.size });
  lastContext = null;
  return auxLogs.map(log => {
    if (log.source !== "go-service") return log;
    const timestampMs = log.timestampMs;
    if (timestampMs === undefined) return log;
    if (log.task_id !== undefined || log.entry !== undefined) {
      const prevContext: { task_id?: number; entry?: string } = lastContext ?? {};
      lastContext = {
        task_id: log.task_id ?? prevContext.task_id,
        entry: log.entry ?? prevContext.entry
      };
    }
    const contextTaskId = log.task_id ?? (lastContext ? lastContext.task_id : undefined);
    const contextEntry = log.entry ?? (lastContext ? lastContext.entry : undefined);
    if (contextTaskId === undefined || !contextEntry) return log;
    const key = `${contextTaskId}::${contextEntry}`;
    const offset = offsetByTaskKey.get(key);
    if (offset === undefined) return log;
    return {
      ...log,
      task_id: log.task_id ?? contextTaskId,
      entry: log.entry ?? contextEntry,
      alignedTimestampMs: timestampMs + offset
    };
  });
}

type TaskWindow = {
  key: string;
  task: TaskInfo;
  startMs: number | null;
  endMs: number | null;
  tokens: Set<string>;
};

type NodeWindow = {
  key: string;
  taskKey: string;
  nodeId: number;
  startMs: number | null;
  endMs: number | null;
  tokens: Set<string>;
};

const tokenKeyMap = new Map<string, string>([
  ["traceid", "trace_id"],
  ["trace", "trace_id"],
  ["requestid", "request_id"],
  ["request", "request_id"],
  ["reqid", "request_id"],
  ["req", "request_id"],
  ["spanid", "span_id"],
  ["span", "span_id"],
  ["correlationid", "correlation_id"],
  ["correlation", "correlation_id"],
  ["bizid", "biz_id"],
  ["businessid", "biz_id"],
  ["biz", "biz_id"],
  ["taskid", "task_id"],
  ["nodeid", "node_id"],
  ["actionid", "action_id"],
  ["recoid", "reco_id"],
  ["uuid", "uuid"],
  ["entry", "entry"],
  ["hash", "hash"]
]);

const tokenPairRegex = /(?:^|[\s,{[(<"])([a-zA-Z][\w.-]*)\s*[:=]\s*["']?([^\s"'`,}\]>]+)/g;

function normalizeTokenKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveTokenKey(key: string) {
  const normalized = normalizeTokenKey(key);
  return tokenKeyMap.get(normalized) || null;
}

function addToken(tokens: Set<string>, type: string, value: unknown) {
  if (value === undefined || value === null) return;
  const text = String(value).trim();
  if (!text) return;
  tokens.add(`${type}:${text}`);
}

function extractTokensFromString(input: string | undefined, tokens: Set<string>) {
  if (!input) return;
  for (const match of input.matchAll(tokenPairRegex)) {
    const key = resolveTokenKey(match[1]);
    if (!key) continue;
    addToken(tokens, key, match[2]);
  }
}

function collectTokensFromObject(value: unknown, tokens: Set<string>, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) return;
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    extractTokensFromString(value, tokens);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTokensFromObject(item, tokens, depth + 1, maxDepth);
    }
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, detail] of Object.entries(value as Record<string, unknown>)) {
    const mappedKey = resolveTokenKey(key);
    if (mappedKey) {
      addToken(tokens, mappedKey, detail);
    }
    if (typeof detail === "string") {
      extractTokensFromString(detail, tokens);
    } else if (typeof detail === "object" && detail !== null) {
      collectTokensFromObject(detail, tokens, depth + 1, maxDepth);
    }
  }
}

function collectTaskTokens(task: TaskInfo) {
  const tokens = new Set<string>();
  addToken(tokens, "task_id", task.task_id);
  addToken(tokens, "entry", task.entry);
  addToken(tokens, "uuid", task.uuid);
  addToken(tokens, "hash", task.hash);
  return tokens;
}

function collectNodeTokens(node: NodeInfo) {
  const tokens = new Set<string>();
  addToken(tokens, "node_id", node.node_id);
  addToken(tokens, "reco_id", node.reco_details?.reco_id ?? node.node_details?.reco_id);
  addToken(tokens, "action_id", node.action_details?.action_id ?? node.node_details?.action_id);
  collectTokensFromObject(node.action_details?.detail, tokens);
  collectTokensFromObject(node.reco_details?.detail, tokens);
  collectTokensFromObject(node.node_details, tokens);
  collectTokensFromObject(node.focus, tokens);
  return tokens;
}

function collectAuxLogTokens(log: AuxLogEntry) {
  const tokens = new Set<string>();
  addToken(tokens, "task_id", log.task_id);
  addToken(tokens, "entry", log.entry);
  collectTokensFromObject(log.details, tokens);
  extractTokensFromString(log.message, tokens);
  extractTokensFromString(log.caller, tokens);
  return tokens;
}

function buildCorrelationIndex(tasks: TaskInfo[]) {
  const taskWindows: TaskWindow[] = [];
  const taskByKey = new Map<string, TaskWindow>();
  const tasksById = new Map<number, TaskWindow[]>();
  const tasksByEntry = new Map<string, TaskWindow[]>();
  const tokenToTasks = new Map<string, Set<string>>();
  const nodeWindowsByTask = new Map<string, NodeWindow[]>();
  for (const task of tasks) {
    const taskKey = task.key;
    const startMs = parseTimestampToMs(task.start_time);
    const lastNodeTimestamp = task.nodes[task.nodes.length - 1]?.timestamp;
    const endMs = parseTimestampToMs(task.end_time || lastNodeTimestamp || "");
    const tokens = collectTaskTokens(task);
    const taskWindow: TaskWindow = {
      key: taskKey,
      task,
      startMs,
      endMs,
      tokens
    };
    taskWindows.push(taskWindow);
    taskByKey.set(taskKey, taskWindow);
    const idList = tasksById.get(task.task_id) || [];
    idList.push(taskWindow);
    tasksById.set(task.task_id, idList);
    const entryList = tasksByEntry.get(task.entry) || [];
    entryList.push(taskWindow);
    tasksByEntry.set(task.entry, entryList);
    for (const token of tokens) {
      const set = tokenToTasks.get(token) || new Set<string>();
      set.add(taskKey);
      tokenToTasks.set(token, set);
    }
    const nodeWindows: NodeWindow[] = [];
    for (let i = 0; i < task.nodes.length; i++) {
      const node = task.nodes[i];
      const nextNode = task.nodes[i + 1];
      const start = parseTimestampToMs(node.timestamp);
      let end = nextNode ? parseTimestampToMs(nextNode.timestamp) : endMs;
      if (start !== null && end !== null && end < start) {
        end = null;
      }
      const nodeKey = `${taskKey}::${node.node_id}`;
      nodeWindows.push({
        key: nodeKey,
        taskKey,
        nodeId: node.node_id,
        startMs: start,
        endMs: end,
        tokens: collectNodeTokens(node)
      });
    }
    nodeWindowsByTask.set(taskKey, nodeWindows);
  }
  return {
    taskWindows,
    taskByKey,
    tasksById,
    tasksByEntry,
    tokenToTasks,
    nodeWindowsByTask
  };
}

/**
 * 基于时间、ID、业务标识进行辅助日志与任务/节点的关联。
 * @param auxEntries 辅助日志
 * @param tasks 任务列表
 * @returns 带关联状态的辅助日志
 */
function correlateAuxLogs(auxEntries: AuxLogEntry[], tasks: TaskInfo[]) {
  logger.debug("开始关联辅助日志", { auxLogCount: auxEntries.length, taskCount: tasks.length });
  const {
    taskWindows,
    taskByKey,
    tasksById,
    tasksByEntry,
    tokenToTasks,
    nodeWindowsByTask
  } = buildCorrelationIndex(tasks);
  const results: AuxLogEntry[] = [];
  for (const log of auxEntries) {
    const tokens = collectAuxLogTokens(log);
    const timestampMs = log.alignedTimestampMs ?? log.timestampMs;
    const candidateScores = new Map<string, number>();
    const candidateKeys = new Map<string, Set<string>>();
    const addCandidate = (taskKey: string, score: number, key?: string) => {
      candidateScores.set(taskKey, (candidateScores.get(taskKey) || 0) + score);
      if (!key) return;
      const keys = candidateKeys.get(taskKey) || new Set<string>();
      keys.add(key);
      candidateKeys.set(taskKey, keys);
    };
    if (log.task_id !== undefined) {
      const list = tasksById.get(log.task_id) || [];
      for (const item of list) {
        addCandidate(item.key, 6, `task_id:${log.task_id}`);
      }
    }
    if (log.entry) {
      const list = tasksByEntry.get(log.entry) || [];
      for (const item of list) {
        addCandidate(item.key, 4, `entry:${log.entry}`);
      }
    }
    for (const token of tokens) {
      const taskKeys = tokenToTasks.get(token);
      if (!taskKeys) continue;
      for (const taskKey of taskKeys) {
        addCandidate(taskKey, 2, token);
      }
    }
    if (timestampMs !== undefined) {
      for (const taskWindow of taskWindows) {
        if (taskWindow.startMs === null || taskWindow.endMs === null) continue;
        if (timestampMs >= taskWindow.startMs && timestampMs <= taskWindow.endMs) {
          addCandidate(taskWindow.key, 2, "time:in-window");
        }
      }
    }
    let bestTaskKey: string | null = null;
    let bestScore = 0;
    let tie = false;
    for (const [taskKey, score] of candidateScores) {
      if (score > bestScore) {
        bestScore = score;
        bestTaskKey = taskKey;
        tie = false;
      } else if (score === bestScore && bestScore > 0) {
        tie = true;
      }
    }
    if (tie && bestScore > 0 && timestampMs !== undefined) {
      let selectedKey: string | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const [taskKey, score] of candidateScores) {
        if (score !== bestScore) continue;
        const taskWindow = taskByKey.get(taskKey);
        if (!taskWindow || taskWindow.startMs === null) continue;
        const startMs = taskWindow.startMs;
        const endMs = taskWindow.endMs;
        let distance = 0;
        if (endMs === null) {
          distance = Math.abs(timestampMs - startMs);
        } else if (timestampMs < startMs) {
          distance = startMs - timestampMs;
        } else if (timestampMs > endMs) {
          distance = timestampMs - endMs;
        } else {
          distance = 0;
        }
        if (distance < bestDistance) {
          bestDistance = distance;
          selectedKey = taskKey;
        }
      }
      if (selectedKey) {
        bestTaskKey = selectedKey;
        tie = false;
      }
    }
    const minScore = 4;
    if (!bestTaskKey || bestScore < minScore) {
      let reason = "";
      if (log.task_id !== undefined || log.entry) {
        reason = "任务ID不一致";
      } else if (tokens.size > 0) {
        reason = "未匹配到任务";
      } else {
        reason = "缺少关联线索";
      }
      results.push({
        ...log,
        correlation: {
          status: log.task_id !== undefined || tokens.size > 0 ? "failed" : "unmatched",
          reason,
          score: bestScore,
          keys: Array.from(tokens)
        }
      });
      continue;
    }
    if (tie) {
      results.push({
        ...log,
        correlation: {
          status: "failed",
          reason: "匹配到多个任务",
          taskKey: bestTaskKey,
          score: bestScore,
          keys: Array.from(candidateKeys.get(bestTaskKey) || [])
        }
      });
      continue;
    }
    const taskWindow = taskByKey.get(bestTaskKey) || null;
    let driftMs: number | undefined;
    if (taskWindow && timestampMs !== undefined && taskWindow.startMs !== null && taskWindow.endMs !== null) {
      if (timestampMs < taskWindow.startMs) {
        driftMs = taskWindow.startMs - timestampMs;
      } else if (timestampMs > taskWindow.endMs) {
        driftMs = timestampMs - taskWindow.endMs;
      } else {
        driftMs = 0;
      }
    }
    if (driftMs !== undefined && driftMs > 0 && (log.task_id !== undefined || log.entry)) {
      results.push({
        ...log,
        correlation: {
          status: "failed",
          reason: "时间漂移",
          taskKey: bestTaskKey,
          score: bestScore,
          keys: Array.from(candidateKeys.get(bestTaskKey) || []),
          driftMs
        }
      });
      continue;
    }
    const nodeCandidates = nodeWindowsByTask.get(bestTaskKey) || [];
    let bestNode: NodeWindow | null = null;
    let bestNodeScore = -1;
    let bestNodeKeys: string[] = [];
    for (const nodeWindow of nodeCandidates) {
      let score = 0;
      const matchedKeys: string[] = [];
      if (timestampMs !== undefined && nodeWindow.startMs !== null) {
        const inWindow =
          nodeWindow.endMs === null
            ? timestampMs >= nodeWindow.startMs
            : timestampMs >= nodeWindow.startMs && timestampMs < nodeWindow.endMs;
        if (inWindow) {
          score += 3;
          matchedKeys.push("time:node-window");
        }
      }
      for (const token of tokens) {
        if (nodeWindow.tokens.has(token)) {
          score += 2;
          matchedKeys.push(token);
        }
      }
      if (score > bestNodeScore) {
        bestNodeScore = score;
        bestNode = nodeWindow;
        bestNodeKeys = matchedKeys;
      } else if (score === bestNodeScore && score > 0) {
        bestNode = null;
      }
    }
    const hasNodeToken = Array.from(tokens).some(token =>
      token.startsWith("node_id:") || token.startsWith("action_id:") || token.startsWith("reco_id:")
    );
    if (!bestNode || bestNodeScore <= 0) {
      const reason = hasNodeToken ? "节点ID不一致" : "未找到节点窗口";
      results.push({
        ...log,
        correlation: {
          status: hasNodeToken ? "failed" : "unmatched",
          reason,
          taskKey: bestTaskKey,
          score: bestScore,
          keys: Array.from(candidateKeys.get(bestTaskKey) || [])
        }
      });
      continue;
    }
    results.push({
      ...log,
      correlation: {
        status: "matched",
        reason: "关联成功",
        taskKey: bestTaskKey,
        nodeId: bestNode.nodeId,
        score: bestScore + bestNodeScore,
        keys: Array.from(new Set([...bestNodeKeys, ...(candidateKeys.get(bestTaskKey) || [])]))
      }
    });
  }
  return results;
}

/**
 * 从 pipeline 节点提取 Custom Action 名称。
 * @param node pipeline 节点对象
 * @returns Custom Action 名称或 null
 */
function extractCustomActionFromPipeline(node: any) {
  if (!node || typeof node !== "object") return null;
  const action = node.action;
  const actionType =
    typeof action === "string"
      ? action
      : typeof action === "object"
        ? action.type || action.action
        : null;
  if (actionType !== "Custom") return null;
  if (action && typeof action === "object") {
    const custom =
      action.custom_action || action.customAction || action.param?.custom_action || action.param?.customAction;
    if (typeof custom === "string") return custom;
  }
  const fallback = node.custom_action || node.customAction;
  return typeof fallback === "string" ? fallback : null;
}

/**
 * 解析 pipeline 配置并提取 Custom Action。
 * @param content 配置文件内容
 * @param fileName 文件名
 * @returns 节点名与 Custom Action 的映射
 */
function parsePipelineCustomActions(content: string, fileName: string) {
  try {
    const data = JSON.parse(content);
    if (!data || typeof data !== "object") return {};
    const mapping: Record<string, PipelineCustomActionInfo[]> = {};
    for (const [key, value] of Object.entries(data)) {
      const customAction = extractCustomActionFromPipeline(value);
      if (!customAction) continue;
      if (!mapping[key]) mapping[key] = [];
      mapping[key].push({ name: customAction, fileName });
    }
    return mapping;
  } catch {
    return {};
  }
}

function formatBox(box: [number, number, number, number] | null | undefined) {
  if (!box) return "-";
  return `[${box.join(", ")}]`;
}

function summarizeBase(node: NodeInfo) {
  const name = node.name || String(node.node_id);
  return `${name} · ${formatResultStatus(node.status)} · ${node.timestamp}`;
}

function summarizeRecognition(node: NodeInfo) {
  const attempts = node.recognition_attempts || [];
  if (attempts.length === 0) return "无";
  const successCount = attempts.filter(item => item.status === "success").length;
  return `${attempts.length} 次（成功 ${successCount} / 失败 ${attempts.length - successCount}）`;
}

function summarizeNestedActions(node: NodeInfo) {
  const items = node.nested_action_nodes || [];
  if (items.length === 0) return "无";
  const successCount = items.filter(item => item.status === "success").length;
  return `${items.length} 个（成功 ${successCount} / 失败 ${items.length - successCount}）`;
}

function summarizeNextList(node: NodeInfo) {
  const length = node.next_list?.length || 0;
  return length > 0 ? `${length} 个` : "无";
}

function summarizeNodeDetail(node: NodeInfo) {
  if (!node.node_details) return "无";
  return `${node.node_details.name || node.node_details.node_id}`;
}

function summarizeFocus(node: NodeInfo) {
  return node.focus ? "有" : "无";
}

function splitMatch(line: string, start: number, end: number) {
  return {
    before: line.slice(0, start),
    match: line.slice(start, end),
    after: line.slice(end)
  };
}

/**
 * 将 JSON 内容复制到剪贴板。
 * @param data 任意可序列化对象
 */
async function copyJson(data: unknown) {
  if (data === undefined || data === null) return;
  const text = JSON.stringify(data, null, 2);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
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
 * 将字符串解析为更合理的类型。
 * @param value 原始文本
 * @returns 解析后的值
 */
function parseValue(value: string) {
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return parseInt(value);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * 规范化数字 ID，支持字符串数字。
 * @param value 原始值
 * @returns 数字 ID 或 undefined
 */
function normalizeId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return undefined;
}

const quickSearchOptions = [
  "reco hit",
  "Version",
  "[ERR]",
  "display_width_="
];

const debugInfoPattern = /\[P[xX]\d+\]|\[T[xX]\d+\]|\[L\d+\]|\[[^\]]+\.(cpp|h|hpp|c)\]/gi;

/**
 * 根据调试隐藏开关规范化搜索文本。
 * @param line 原始文本
 * @returns 处理后的文本
 */
function normalizeSearchLine(line: string) {
  if (!hideDebugInfo.value) return line;
  return line.replace(debugInfoPattern, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * 解析日志行中的消息、参数、状态与耗时。
 * @param message 日志消息文本
 * @returns 解析结果
 */
function parseMessageAndParams(message: string) {
  const params: Record<string, any> = {};
  let status: "enter" | "leave" | undefined;
  let duration: number | undefined;
  const extractedParams: string[] = [];
  let i = 0;
  while (i < message.length) {
    if (message[i] === "[") {
      let depth = 1;
      let braceDepth = 0;
      let j = i + 1;
      while (j < message.length && (depth > 0 || braceDepth > 0)) {
        if (message[j] === "{") {
          braceDepth++;
        } else if (message[j] === "}") {
          braceDepth--;
        } else if (message[j] === "[" && braceDepth === 0) {
          depth++;
        } else if (message[j] === "]" && braceDepth === 0) {
          depth--;
        }
        j++;
      }
      if (depth === 0) {
        const param = message.substring(i + 1, j - 1);
        extractedParams.push(param);
        i = j;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  for (const param of extractedParams) {
    const kvMatch = param.match(/^([^=]+)=(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      params[key.trim()] = parseValue(value.trim());
    } else {
      params[param.trim()] = true;
    }
  }
  let cleanMessage = message;
  for (const param of extractedParams) {
    cleanMessage = cleanMessage.replace(`[${param}]`, "");
  }
  cleanMessage = cleanMessage.trim();
  const statusMatch = cleanMessage.match(/\|\s*(enter|leave)(?:,\s*(\d+)ms)?/);
  if (statusMatch) {
    status = statusMatch[1] as "enter" | "leave";
    if (statusMatch[2]) {
      duration = parseInt(statusMatch[2]);
    }
    cleanMessage = cleanMessage.replace(/\|\s*(enter|leave).*$/, "").trim();
  }
  return { message: cleanMessage, params, status, duration };
}

/**
 * 解析 maa.log 单行结构。
 * @param line 原始行内容
 * @param lineNum 行号
 * @returns 解析后的日志对象或 null
 */
function parseLine(line: string, lineNum: number): LogLine | null {
  const regex = /^\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?(?:\[([^\]]+)\])?(?:\[([^\]]+)\])?\s*(.*)$/;
  const match = line.match(regex);
  if (!match) return null;
  const [, timestamp, level, processId, threadId, part1, part2, part3, rest] = match;
  let sourceFile: string | undefined;
  let lineNumber: string | undefined;
  let functionName: string | undefined;
  let message = rest;
  if (part3) {
    sourceFile = part1;
    lineNumber = part2;
    functionName = part3;
  } else if (part1 && !part2) {
    if (part1.includes(".cpp") || part1.includes(".h")) {
      sourceFile = part1;
    } else {
      functionName = part1;
    }
  } else if (part1 && part2) {
    sourceFile = part1;
    lineNumber = part2;
  }
  const { message: cleanMessage, params, status, duration } = parseMessageAndParams(message);
  return {
    timestamp,
    level: level as LogLine["level"],
    processId,
    threadId,
    sourceFile,
    lineNumber,
    functionName,
    message: cleanMessage,
    params,
    status,
    duration,
    _lineNumber: lineNum
  };
}

/**
 * 解析 go-service.log 的 JSON 日志行。
 * @param line 原始行内容
 * @param lineNumber 行号
 * @param fileName 文件名
 * @returns 辅助日志或 null
 */
function parseGoServiceLogLine(
  line: string,
  lineNumber: number,
  fileName: string
): AuxLogEntry | null {
  const startIndex = line.indexOf("{");
  const endIndex = line.lastIndexOf("}");
  if (startIndex < 0 || endIndex <= startIndex) return null;
  try {
    const jsonText = line.slice(startIndex, endIndex + 1);
    const data = JSON.parse(jsonText);
    if (!data || typeof data !== "object") return null;
    const time = typeof data.time === "string" ? data.time : typeof data.timestamp === "string" ? data.timestamp : "";
    const message =
      typeof data.message === "string" ? data.message : typeof data.msg === "string" ? data.msg : "";
    const level = typeof data.level === "string" ? data.level : typeof data.lvl === "string" ? data.lvl : "";
    if (!time || !message || !level) return null;
    const knownKeys = new Set([
      "time",
      "timestamp",
      "message",
      "msg",
      "level",
      "lvl",
      "caller",
      "task_id",
      "taskId",
      "entry",
      "task_entry",
      "identifier"
    ]);
    const extra: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!knownKeys.has(key)) {
        extra[key] = value;
      }
    }
    const details = Object.keys(extra).length > 0 ? extra : undefined;
    const timestampMs = parseTimestampToMs(time);
    const rawTaskId =
      typeof data.task_id === "number"
        ? data.task_id
        : typeof data.taskId === "number"
          ? data.taskId
          : typeof data.task_id === "string" && /^\d+$/.test(data.task_id)
            ? parseInt(data.task_id, 10)
            : typeof data.taskId === "string" && /^\d+$/.test(data.taskId)
              ? parseInt(data.taskId, 10)
              : undefined;
    const entry =
      typeof data.entry === "string" ? data.entry : typeof data.task_entry === "string" ? data.task_entry : undefined;
    return {
      key: `${fileName}-${lineNumber}`,
      source: "go-service",
      timestamp: time,
      timestampMs: timestampMs ?? undefined,
      level,
      message,
      task_id: rawTaskId,
      entry,
      caller: typeof data.caller === "string" ? data.caller : undefined,
      details,
      fileName,
      lineNumber
    };
  } catch {
    return null;
  }
}

/**
 * 从日志行中提取 OnEventNotify 事件。
 * @param parsed 已解析的日志行
 * @param fileName 文件名
 * @returns 事件对象或 null
 */
function parseEventNotification(parsed: LogLine, fileName: string): EventNotification | null {
  const { message, params } = parsed;
  if (!message.includes("!!!OnEventNotify!!!")) return null;
  const msg = params["msg"];
  const details = params["details"];
  if (!msg) return null;
  return {
    timestamp: parsed.timestamp,
    level: parsed.level,
    message: msg,
    details: details || {},
    _lineNumber: parsed._lineNumber,
    fileName,
    processId: parsed.processId,
    threadId: parsed.threadId
  };
}

/**
 * 字符串池，用于减少重复字符串带来的内存占用。
 */
class StringPool {
  private pool = new Map<string, string>();

  intern(value: string | undefined | null) {
    if (value === undefined || value === null) return "";
    if (!this.pool.has(value)) {
      this.pool.set(value, value);
    }
    return this.pool.get(value)!;
  }

  clear() {
    this.pool.clear();
  }
}

/**
 * 根据事件通知构建任务列表，并补齐任务生命周期信息。
 * @param events 事件通知列表
 * @param stringPool 字符串池
 * @returns 任务列表
 */
function buildTasks(events: EventNotification[], stringPool: StringPool) {
  const tasks: TaskInfo[] = [];
  const runningTaskMap = new Map<string, TaskInfo>();
  const taskProcessMap = new Map<number, { processId: string; threadId: string }>();
  const taskUuidMap = new Map<string, { processId: string; threadId: string }>();
  const firstSeenIndexMap = new Map<number, number>();
  const buildTaskKey = (taskId: number, uuid: string, processId: string) =>
    `${processId || "proc"}:${uuid || "uuid"}:${taskId}`;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const { message, details, fileName } = event;
    const eventTaskId = normalizeId(details?.task_id ?? details?.taskId);
    const processThread = { processId: event.processId, threadId: event.threadId };
    if (eventTaskId !== undefined) {
      taskProcessMap.set(eventTaskId, processThread);
      if (!firstSeenIndexMap.has(eventTaskId)) {
        firstSeenIndexMap.set(eventTaskId, i);
      }
    }
    if (details?.uuid) {
      taskUuidMap.set(details.uuid, processThread);
    }
    if (message === "Tasker.Task.Starting") {
      const taskId = eventTaskId;
      if (taskId === undefined) {
        continue;
      }
      const uuid = details.uuid || "";
      const taskKey = buildTaskKey(taskId, uuid, event.processId);
      if (taskId && runningTaskMap.has(taskKey)) {
        const prevTask = runningTaskMap.get(taskKey);
        if (prevTask && !prevTask.end_time) {
          prevTask.status = "failed";
          prevTask.end_time = stringPool.intern(event.timestamp);
          prevTask._endEventIndex = Math.max(i - 1, prevTask._startEventIndex ?? i - 1);
          if (prevTask.start_time && prevTask.end_time) {
            const start = new Date(prevTask.start_time).getTime();
            const end = new Date(prevTask.end_time).getTime();
            prevTask.duration = end - start;
          }
        }
        runningTaskMap.delete(taskKey);
      }
      if (taskId && !runningTaskMap.has(taskKey)) {
        const processInfo =
          (uuid && taskUuidMap.get(uuid)) || taskProcessMap.get(taskId) || processThread;
        const task: TaskInfo = {
          key: `${fileName}-${taskId}-${event.timestamp}`,
          fileName,
          task_id: taskId,
          entry: stringPool.intern(details.entry || ""),
          hash: stringPool.intern(details.hash || ""),
          uuid: stringPool.intern(uuid),
          start_time: stringPool.intern(event.timestamp),
          status: "running",
          nodes: [],
          processId: stringPool.intern(processInfo.processId || ""),
          threadId: stringPool.intern(processInfo.threadId || ""),
          _startEventIndex: i
        };
        tasks.push(task);
        runningTaskMap.set(taskKey, task);
      }
    } else if (message === "Tasker.Task.Succeeded" || message === "Tasker.Task.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) {
        continue;
      }
      const uuid = details.uuid || "";
      const taskKey = buildTaskKey(taskId, uuid, event.processId);
      let matchedTask = runningTaskMap.get(taskKey) || null;
      if (!matchedTask) {
        matchedTask = tasks.find(
          t =>
            t.task_id === taskId &&
            t.processId === event.processId &&
            !t.end_time &&
            (!uuid || t.uuid === uuid)
        ) || null;
      }
      if (matchedTask) {
        matchedTask.status = message === "Tasker.Task.Succeeded" ? "succeeded" : "failed";
        matchedTask.end_time = stringPool.intern(event.timestamp);
        matchedTask._endEventIndex = i;
        if (!matchedTask.processId || !matchedTask.threadId) {
          const processInfo =
            (uuid && taskUuidMap.get(uuid)) || taskProcessMap.get(taskId) || processThread;
          matchedTask.processId = stringPool.intern(processInfo.processId || "");
          matchedTask.threadId = stringPool.intern(processInfo.threadId || "");
        }
        if (matchedTask.start_time && matchedTask.end_time) {
          const start = new Date(matchedTask.start_time).getTime();
          const end = new Date(matchedTask.end_time).getTime();
          matchedTask.duration = end - start;
        }
        runningTaskMap.delete(taskKey);
      }
    }
  }
  for (const task of tasks) {
    task.nodes = buildTaskNodes(task, events, stringPool);
    if (task.status === "running" && task.nodes.length > 0) {
      const lastNode = task.nodes[task.nodes.length - 1];
      const start = new Date(task.start_time).getTime();
      const end = new Date(lastNode.timestamp).getTime();
      task.duration = end - start;
    }
  }
  return tasks.filter(task => task.entry !== "MaaTaskerPostStop");
}

/**
 * 从事件流中构建单个任务的节点列表。
 * @param task 目标任务
 * @param events 事件通知列表
 * @param stringPool 字符串池
 * @returns 节点列表
 */
function buildTaskNodes(task: TaskInfo, events: EventNotification[], stringPool: StringPool) {
  const nodes: NodeInfo[] = [];
  const nodeIdSet = new Set<number>();
  const startIndex = task._startEventIndex ?? 0;
  const endIndex = task._endEventIndex ?? events.length - 1;
  const taskEvents = events
    .slice(startIndex, endIndex + 1)
    .filter(event => event.processId === task.processId);
  const recognitionAttempts: RecognitionAttempt[] = [];
  const nestedNodes: RecognitionAttempt[] = [];
  const nestedActionNodes: ActionAttempt[] = [];
  let currentNextList: NextListItem[] = [];
  const recognitionsByTaskId = new Map<number, RecognitionAttempt[]>();
  const actionsByTaskId = new Map<number, ActionAttempt[]>();
  for (const event of taskEvents) {
    const { message, details } = event;
    const eventTaskId = normalizeId(details?.task_id ?? details?.taskId);
    if (
      (message === "Node.NextList.Starting" || message === "Node.NextList.Succeeded") &&
      eventTaskId === task.task_id &&
      event.processId === task.processId
    ) {
      if (message === "Node.NextList.Starting") {
        const list = Array.isArray(details.list) ? details.list : [];
        currentNextList = list.map((item: any) => ({
          name: stringPool.intern(item.name || ""),
          anchor: item.anchor || false,
          jump_back: item.jump_back || false
        }));
      }
    }

    if (message === "Node.RecognitionNode.Succeeded" || message === "Node.RecognitionNode.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) {
        continue;
      }
      if (taskId !== task.task_id && event.processId === task.processId) {
        const nestedRecognitions = recognitionsByTaskId.get(taskId) || [];
        nestedNodes.push({
          reco_id:
            normalizeId(details.reco_details?.reco_id ?? details.node_id ?? details.nodeId) ??
            details.reco_details?.reco_id ??
            details.node_id,
          name: stringPool.intern(details.name || ""),
          timestamp: stringPool.intern(event.timestamp),
          status: message === "Node.RecognitionNode.Succeeded" ? "success" : "failed",
          reco_details: details.reco_details,
          nested_nodes: nestedRecognitions.length > 0 ? nestedRecognitions : undefined
        });
        recognitionsByTaskId.delete(taskId);
      }
    }

    if (message === "Node.ActionNode.Succeeded" || message === "Node.ActionNode.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) {
        continue;
      }
      if (taskId !== task.task_id && event.processId === task.processId) {
        const nestedActions = actionsByTaskId.get(taskId) || [];
        nestedActionNodes.push({
          action_id:
            normalizeId(details.action_details?.action_id ?? details.node_id ?? details.nodeId) ??
            details.action_details?.action_id ??
            details.node_id,
          name: stringPool.intern(details.name || ""),
          timestamp: stringPool.intern(event.timestamp),
          status: message === "Node.ActionNode.Succeeded" ? "success" : "failed",
          action_details: details.action_details,
          nested_actions: nestedActions.length > 0 ? nestedActions : undefined
        });
        actionsByTaskId.delete(taskId);
      }
    }

    if (
      (message === "Node.Recognition.Succeeded" || message === "Node.Recognition.Failed") &&
      eventTaskId === task.task_id &&
      event.processId === task.processId
    ) {
      recognitionAttempts.push({
        reco_id: normalizeId(details.reco_id) ?? details.reco_id,
        name: stringPool.intern(details.name || details.node_name || ""),
        timestamp: stringPool.intern(event.timestamp),
        status: message === "Node.Recognition.Succeeded" ? "success" : "failed",
        reco_details: details.reco_details,
        nested_nodes: nestedNodes.length > 0 ? nestedNodes.slice() : undefined
      });
      nestedNodes.length = 0;
    } else if (
      message === "Node.Recognition.Succeeded" ||
      message === "Node.Recognition.Failed"
    ) {
      const taskId = eventTaskId;
      if (taskId === undefined) {
        continue;
      }
      const attempt: RecognitionAttempt = {
        reco_id: normalizeId(details.reco_id) ?? details.reco_id,
        name: stringPool.intern(details.name || details.node_name || ""),
        timestamp: stringPool.intern(event.timestamp),
        status: message === "Node.Recognition.Succeeded" ? "success" : "failed",
        reco_details: details.reco_details
      };
      if (event.processId === task.processId) {
        if (!recognitionsByTaskId.has(taskId)) {
          recognitionsByTaskId.set(taskId, []);
        }
        recognitionsByTaskId.get(taskId)!.push(attempt);
      }
    }

    if (message === "Node.Action.Succeeded" || message === "Node.Action.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) {
        continue;
      }
      if (taskId !== task.task_id && event.processId === task.processId) {
        const actionAttempt: ActionAttempt = {
          action_id: normalizeId(details.action_id) ?? details.action_id,
          name: stringPool.intern(details.name || ""),
          timestamp: stringPool.intern(event.timestamp),
          status: message === "Node.Action.Succeeded" ? "success" : "failed",
          action_details: details.action_details
        };
        if (!actionsByTaskId.has(taskId)) {
          actionsByTaskId.set(taskId, []);
        }
        actionsByTaskId.get(taskId)!.push(actionAttempt);
      }
    }

    if (
      (message === "Node.PipelineNode.Succeeded" || message === "Node.PipelineNode.Failed") &&
      eventTaskId === task.task_id &&
      event.processId === task.processId
    ) {
      const nodeId = normalizeId(details.node_id ?? details.nodeId);
      if (typeof nodeId !== "number" || nodeIdSet.has(nodeId)) {
        currentNextList = [];
        recognitionAttempts.length = 0;
        nestedActionNodes.length = 0;
        nestedNodes.length = 0;
        continue;
      }
      nodes.push({
        node_id: nodeId,
        name: stringPool.intern(details.name || ""),
        timestamp: stringPool.intern(event.timestamp),
        status: message === "Node.PipelineNode.Succeeded" ? "success" : "failed",
        task_id: task.task_id,
        reco_details: details.reco_details,
        action_details: details.action_details,
        node_details: details.node_details,
        focus: details.focus,
        next_list: currentNextList.map(item => ({
          name: stringPool.intern(item.name),
          anchor: item.anchor,
          jump_back: item.jump_back
        })),
        recognition_attempts: recognitionAttempts.slice(),
        nested_action_nodes: nestedActionNodes.length > 0 ? nestedActionNodes.slice() : undefined,
        nested_recognition_in_action: nestedNodes.length > 0 ? nestedNodes.slice() : undefined
      });
      nodeIdSet.add(nodeId);
      currentNextList = [];
      recognitionAttempts.length = 0;
      nestedActionNodes.length = 0;
      nestedNodes.length = 0;
    }
  }
  return nodes;
}

/**
 * 统计节点成功率与耗时分布。
 * @param tasks 任务列表
 * @returns 节点统计数组
 */
function computeNodeStatistics(tasks: TaskInfo[]) {
  const statsMap = new Map<
    string,
    { durations: number[]; successCount: number; failCount: number }
  >();
  for (const task of tasks) {
    const nodes = task.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nextNode = nodes[i + 1];
      let duration = 0;
      if (nextNode) {
        const currentTime = new Date(node.timestamp).getTime();
        const nextTime = new Date(nextNode.timestamp).getTime();
        duration = nextTime - currentTime;
      } else if (task.end_time) {
        const currentTime = new Date(node.timestamp).getTime();
        const endTime = new Date(task.end_time).getTime();
        duration = endTime - currentTime;
      } else {
        continue;
      }
      if (!Number.isFinite(duration) || duration < 0 || duration > 3600000) {
        continue;
      }
      if (!statsMap.has(node.name)) {
        statsMap.set(node.name, { durations: [], successCount: 0, failCount: 0 });
      }
      const stats = statsMap.get(node.name)!;
      stats.durations.push(duration);
      if (node.status === "success") {
        stats.successCount++;
      } else {
        stats.failCount++;
      }
    }
  }
  const result: NodeStat[] = [];
  for (const [name, stats] of statsMap.entries()) {
    const durations = stats.durations;
    const count = durations.length;
    if (count === 0) continue;
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const avgDuration = totalDuration / count;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const successRate = (stats.successCount / (stats.successCount + stats.failCount)) * 100;
    result.push({
      name,
      count,
      totalDuration,
      avgDuration,
      minDuration,
      maxDuration,
      successCount: stats.successCount,
      failCount: stats.failCount,
      successRate
    });
  }
  return result;
}

const nodeStatistics = computed(() => {
  let stats = computeNodeStatistics(tasks.value);
  if (statKeyword.value.trim()) {
    const keyword = statKeyword.value.trim().toLowerCase();
    stats = stats.filter(item => item.name.toLowerCase().includes(keyword));
  }
  if (statSort.value === "count") {
    stats.sort((a, b) => b.count - a.count);
  } else if (statSort.value === "failRate") {
    stats.sort((a, b) => b.failCount / b.count - a.failCount / a.count);
  } else {
    stats.sort((a, b) => b.avgDuration - a.avgDuration);
  }
  return stats;
});

const nodeSummary = computed(() => {
  if (nodeStatistics.value.length === 0) return null;
  const totalNodes = nodeStatistics.value.reduce((sum, s) => sum + s.count, 0);
  const totalDuration = nodeStatistics.value.reduce((sum, s) => sum + s.totalDuration, 0);
  const avgDuration = totalDuration / totalNodes;
  const slowestNode = nodeStatistics.value[0];
  return {
    totalNodes,
    totalDuration,
    avgDuration,
    slowestNode,
    uniqueNodes: nodeStatistics.value.length
  };
});

/**
 * 执行文本搜索并更新结果列表。
 */
function performSearch() {
  if (!searchText.value.trim()) {
    searchResults.value = [];
    searchMessage.value = "请输入搜索内容";
    logger.warn("搜索关键字为空");
    return;
  }
  if (rawLines.value.length === 0) {
    searchResults.value = [];
    searchMessage.value = "请先解析日志";
    logger.warn("搜索前未解析日志");
    return;
  }
  let regex: RegExp | null = null;
  if (searchUseRegex.value) {
    try {
      regex = new RegExp(searchText.value, searchCaseSensitive.value ? "g" : "gi");
    } catch {
      searchResults.value = [];
      searchMessage.value = "正则表达式无效";
      logger.error("正则表达式无效", { pattern: searchText.value });
      return;
    }
  }
  const results: SearchResult[] = [];
  const keyword = searchCaseSensitive.value ? searchText.value : searchText.value.toLowerCase();
  for (const line of rawLines.value) {
    if (results.length >= searchMaxResults.value) break;
    const displayLine = normalizeSearchLine(line.line);
    let matchStart = -1;
    let matchEnd = -1;
    if (regex) {
      regex.lastIndex = 0;
      const match = regex.exec(displayLine);
      if (match && match.index !== undefined) {
        matchStart = match.index;
        matchEnd = matchStart + match[0].length;
      }
    } else {
      if (searchCaseSensitive.value) {
        matchStart = displayLine.indexOf(keyword);
        if (matchStart !== -1) matchEnd = matchStart + keyword.length;
      } else {
        const lowerLine = displayLine.toLowerCase();
        matchStart = lowerLine.indexOf(keyword);
        if (matchStart !== -1) matchEnd = matchStart + keyword.length;
      }
    }
    if (matchStart !== -1) {
      const key = `${line.fileName}-${line.lineNumber}-${results.length}`;
      results.push({
        fileName: line.fileName,
        lineNumber: line.lineNumber,
        line: displayLine,
        rawLine: line.line,
        matchStart,
        matchEnd,
        key
      });
    }
  }
  searchResults.value = results;
  searchMessage.value =
    results.length > 0
      ? `找到 ${results.length} 条结果${results.length >= searchMaxResults.value ? "（已达上限）" : ""}`
      : "未找到匹配结果";
  logger.info("搜索完成", { resultCount: results.length });
}

/**
 * 应用用户选择的文件并重置解析状态。
 * @param fileList 文件列表
 */
function applySelectedFiles(fileList: File[]) {
  const files = fileList.map(file => ({
    name: file.name,
    size: file.size,
    type: getFileType(file),
    file
  }));
  selectedFiles.value = files;
  totalSize.value = files.reduce((sum, file) => sum + file.size, 0);
  tasks.value = [];
  rawLines.value = [];
  auxLogs.value = [];
  pipelineCustomActions.value = {};
  selectedAuxLevels.value = ["error", "warn", "info", "debug", "other"];
  selectedTaskKey.value = null;
  selectedNodeId.value = null;
  searchResults.value = [];
  searchMessage.value = "";
  selectedProcessId.value = "all";
  selectedThreadId.value = "all";
  parseProgress.value = 0;
  if (files.length > 0) {
    parseState.value = "ready";
    statusMessage.value = `已选择 ${files.length} 个文件`;
    logger.info("已选择日志文件", { count: files.length, names: files.map(file => file.name) });
  } else {
    parseState.value = "idle";
    statusMessage.value = "请先选择日志/配置文件";
    logger.warn("未选择日志文件");
  }
}

function handleRemoveSelectedFile(index: number) {
  const next = selectedFiles.value.filter((_, i) => i !== index);
  applySelectedFiles(next.map(item => item.file));
}

/**
 * 判断是否处于 Tauri 环境。
 * @returns 是否为 Tauri 环境
 */
function isTauriEnv() {
  const win = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return !!win.__TAURI__ || !!win.__TAURI_INTERNALS__;
}

async function openDevtools() {
  if (!isTauriEnv()) return;
  try {
    await invoke("open_devtools");
  } catch (error) {
    logger.warn("打开开发者工具失败", { error: String(error) });
  }
}

/**
 * 从路径中提取文件名。
 * @param path 文件路径
 * @returns 文件名
 */
function getFileNameFromPath(path: string) {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

/**
 * 处理 Tauri 拖拽路径，支持文件夹、zip 与单文件。
 * @param paths 选中的路径列表
 */
async function applySelectedPaths(paths: string[]) {
  const allowFile = (name: string) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".log") || lower.endsWith(".json") || lower.endsWith(".jsonc");
  };
  const allowDirectoryFile = (name: string) => {
    const lower = name.toLowerCase();
    return lower === "maa.log" || lower === "go-service.log";
  };
  const decoder = new TextDecoder("utf-8");
  const outFiles: File[] = [];
  const errors: string[] = [];
  let hasDirectory = false;

  async function collectDir(dirPath: string) {
    try {
      const rootEntries = await readDir(dirPath);
      hasDirectory = true;
      async function walk(current: string) {
        const entries = await readDir(current);
        for (const entry of entries) {
          if (entry.isDirectory) {
            const next = await join(current, entry.name);
            await walk(next);
          } else if (entry.isFile && allowDirectoryFile(entry.name)) {
            const filePath = await join(current, entry.name);
            const text = await readTextFile(filePath);
            outFiles.push(new File([text], entry.name, { type: "text/plain" }));
          }
        }
      }
      await walk(dirPath);
      return rootEntries.length >= 0;
    } catch (error) {
      if (error) errors.push(String(error));
      return false;
    }
  }

  async function collectFile(filePath: string) {
    const name = getFileNameFromPath(filePath);
    if (name.toLowerCase().endsWith(".zip")) {
      try {
        const buf = await readFile(filePath);
        const zip = unzipSync(buf);
        for (const [entryName, data] of Object.entries(zip)) {
          const entryBaseName = getFileNameFromPath(entryName);
          if (!allowDirectoryFile(entryBaseName)) continue;
          const text = decoder.decode(data as Uint8Array);
          outFiles.push(new File([text], entryBaseName, { type: "text/plain" }));
        }
        return;
      } catch (error) {
        if (error) errors.push(String(error));
      }
    }
    if (allowFile(name)) {
      try {
        const text = await readTextFile(filePath);
        outFiles.push(new File([text], name, { type: "text/plain" }));
        return;
      } catch (error) {
        if (error) errors.push(String(error));
        try {
          const url = convertFileSrc(filePath);
          const response = await fetch(url);
          const blob = await response.blob();
          outFiles.push(new File([blob], name, { type: "text/plain" }));
          return;
        } catch (fallbackError) {
          if (fallbackError) errors.push(String(fallbackError));
        }
      }
    }
  }

  for (const p of paths) {
    const isDir = await collectDir(p);
    if (!isDir) {
      await collectFile(p);
    }
  }
  if (outFiles.length === 0) {
    if (errors.length > 0) {
      statusMessage.value = errors[errors.length - 1];
    } else {
      statusMessage.value = hasDirectory ? "未发现 maa.log / go-service.log" : "未发现可解析的 .log / .json 文件";
    }
    logger.error("拖拽路径未解析到文件", { errors, hasDirectory, pathCount: paths.length });
    return;
  }
  logger.info("拖拽路径解析成功", { fileCount: outFiles.length });
  applySelectedFiles(outFiles);
}

/**
 * 过滤支持的日志/配置文件。
 * @param fileList 原始文件列表
 * @returns 可解析的文件列表
 */
function filterLogFiles(fileList: File[]) {
  return fileList.filter(file => {
    const lower = file.name.toLowerCase();
    return lower.endsWith(".log") || lower.endsWith(".json") || lower.endsWith(".jsonc");
  });
}

/**
 * 展开拖拽/选择的文件，处理 zip 里的日志。
 * @param fileList 文件列表
 * @returns 展开后的文件列表
 */
async function expandSelectedFiles(fileList: File[]) {
  const allowFile = (name: string) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".log") || lower.endsWith(".json") || lower.endsWith(".jsonc");
  };
  const allowZipEntry = (name: string) => {
    const lower = name.toLowerCase();
    return lower === "maa.log" || lower === "go-service.log";
  };
  const outFiles: File[] = [];
  for (const file of fileList) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".zip")) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const zip = unzipSync(buf);
        const decoder = new TextDecoder("utf-8");
        for (const [entryName, data] of Object.entries(zip)) {
          const entryBaseName = getFileNameFromPath(entryName);
          if (!allowZipEntry(entryBaseName)) continue;
          const text = decoder.decode(data as Uint8Array);
          outFiles.push(new File([text], entryBaseName, { type: "text/plain" }));
        }
      } catch {
        continue;
      }
      continue;
    }
    if (allowFile(file.name)) {
      outFiles.push(file);
    }
  }
  return outFiles;
}

/**
 * 处理文件选择输入框变更。
 * @param event 选择事件
 */
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const logFiles = await expandSelectedFiles(Array.from(input.files));
  if (logFiles.length === 0) {
    statusMessage.value = "仅支持 .log / .json / .zip 文件";
    input.value = "";
    return;
  }
  applySelectedFiles(logFiles);
  input.value = "";
}

function isFileDrag(event: DragEvent) {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes("Files");
}

/**
 * 处理拖拽释放事件。
 * @param event 拖拽事件
 */
function handleDrop(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  isDragging.value = false;
  const files = filterLogFiles(Array.from(event.dataTransfer?.files || []));
  if (files.length === 0) {
    statusMessage.value = "仅支持 .log / .json 文件";
    return;
  }
  applySelectedFiles(files);
}

/**
 * 处理拖拽悬停事件。
 * @param event 拖拽事件
 */
function handleDragOver(event: DragEvent) {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.dropEffect = "copy";
  }
  isDragging.value = true;
}

/**
 * 处理拖拽离开事件。
 * @param event 拖拽事件
 */
function handleDragLeave(event: DragEvent) {
  event.stopPropagation();
  if (event.currentTarget !== event.target) return;
  isDragging.value = false;
}

let unlistenDragDrop: (() => void) | null = null;

async function resolveLogPath() {
  try {
    return await appLogDir();
  } catch {
    return await join(await appDataDir(), "logs");
  }
}

onMounted(() => {
  if (isTauriEnv()) {
    const setup = async () => {
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
          void applySelectedPaths(paths);
          return;
        }
        isDragging.value = false;
      });
    };
    void setup();
  }
});

onBeforeUnmount(() => {
  unlistenDragDrop?.();
  void flushLogs();
});

/**
 * 执行日志解析主流程。
 */
async function handleParse() {
  if (selectedFiles.value.length === 0) return;
  setLoggerContext({
    threadId: selectedThreadId.value === "all" ? "ui" : selectedThreadId.value
  });
  parseState.value = "parsing";
  statusMessage.value = "解析中…";
  parseProgress.value = 0;
  logger.info("开始解析日志", { fileCount: selectedFiles.value.length });
  try {
    const events: EventNotification[] = [];
    const allLines: RawLine[] = [];
    const auxEntries: AuxLogEntry[] = [];
    let pipelineActions: Record<string, PipelineCustomActionInfo[]> = {};
    let totalLines = 0;
    const fileLines: { file: SelectedFile; lines: string[] }[] = [];
    for (const file of selectedFiles.value) {
      const text = await file.file.text();
      const lines = text.split(/\r?\n/);
      fileLines.push({ file, lines });
      totalLines += lines.length;
    }
    const chunkSize = 1000;
    let processed = 0;
    for (const entry of fileLines) {
      const { file, lines } = entry;
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".json") || lowerName.endsWith(".jsonc")) {
        const content = lines.join("\n");
        const mapping = parsePipelineCustomActions(content, file.name);
        for (const [key, value] of Object.entries(mapping)) {
          if (!pipelineActions[key]) {
            pipelineActions[key] = [];
          }
          pipelineActions[key] = pipelineActions[key].concat(value);
        }
        processed += lines.length;
        const percentage = totalLines > 0 ? Math.round((processed / totalLines) * 100) : 0;
        parseProgress.value = percentage;
        statusMessage.value = `解析中… ${percentage}%`;
        await new Promise(resolve => setTimeout(resolve, 0));
        continue;
      }
      for (let startIdx = 0; startIdx < lines.length; startIdx += chunkSize) {
        const endIdx = Math.min(startIdx + chunkSize, lines.length);
        for (let i = startIdx; i < endIdx; i++) {
          const originalLine = lines[i];
          const lineNumber = i + 1;
          allLines.push({ fileName: file.name, lineNumber, line: originalLine });
          const rawLine = originalLine.trim();
          if (!rawLine) continue;
          const auxLog = parseGoServiceLogLine(rawLine, lineNumber, file.name);
          if (auxLog) {
            auxEntries.push(auxLog);
          }
          const parsed = parseLine(rawLine, lineNumber);
          if (!parsed) continue;
          if (rawLine.includes("!!!OnEventNotify!!!")) {
            const event = parseEventNotification(parsed, file.name);
            if (event) events.push(event);
          }
        }
        processed += endIdx - startIdx;
        const percentage = totalLines > 0 ? Math.round((processed / totalLines) * 100) : 0;
        parseProgress.value = percentage;
        statusMessage.value = `解析中… ${percentage}%`;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    rawLines.value = allLines;
    const stringPool = new StringPool();
    tasks.value = buildTasks(events, stringPool);
    stringPool.clear();
    const alignedAuxLogs = alignAuxLogsToTasks(auxEntries, tasks.value);
    auxLogs.value = correlateAuxLogs(alignedAuxLogs, tasks.value);
    logger.info("辅助日志关联完成", {
      total: auxLogs.value.length,
      matched: auxLogs.value.filter(item => item.correlation?.status === "matched").length
    });
    pipelineCustomActions.value = pipelineActions;
    selectedTaskKey.value = filteredTasks.value.length > 0 ? filteredTasks.value[0].key : null;
    selectedNodeId.value =
      filteredTasks.value.length > 0 && filteredTasks.value[0].nodes.length > 0
        ? filteredTasks.value[0].nodes[0].node_id
        : null;
    parseState.value = "done";
    const taskMessage =
      tasks.value.length > 0 ? `解析完成，共 ${tasks.value.length} 个任务` : "解析完成，未识别到任务";
    statusMessage.value =
      auxLogs.value.length > 0 ? `${taskMessage}，辅助日志 ${auxLogs.value.length} 条` : taskMessage;
  } catch (error) {
    parseState.value = "ready";
    statusMessage.value = "解析失败，请检查日志内容";
    parseProgress.value = 0;
    logger.error("解析失败", { error: String(error) });
  }
}
</script>

<template>
  <n-config-provider>
    <div class="app" @dragover.prevent @drop.prevent="handleDrop">
      <AppTopBar
        :view-mode="viewMode"
        :is-tauri="isTauriEnv()"
        @change-view="viewMode = $event"
        @open-devtools="openDevtools"
      />
      <div v-if="isDragging" class="drop-mask" @drop="handleDrop" @dragover="handleDragOver">
        松手导入日志/配置文件
      </div>
      <div v-if="copyMessage" class="copy-toast">{{ copyMessage }}</div>
      <HeroPanel
        :selected-files="selectedFiles"
        :total-size="totalSize"
        :parse-state="parseState"
        :parse-progress="parseProgress"
        :status-message="statusMessage"
        :is-dragging="isDragging"
        :format-size="formatSize"
        @file-change="handleFileChange"
        @parse="handleParse"
        @drag-over="handleDragOver"
        @drag-enter="handleDragOver"
        @drag-leave="handleDragLeave"
        @drop="handleDrop"
      />

      <FileListPanel
        :selected-files="selectedFiles"
        :format-size="formatSize"
        @remove="handleRemoveSelectedFile"
      />

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
        :selected-node-aux-window-label="selectedNodeAuxWindowLabel"
        :selected-node-custom-actions="selectedNodeCustomActions"
        :selected-node-aux-logs="selectedNodeAuxLogs"
        :selected-node-aux-groups="selectedNodeAuxGroups"
        :format-aux-level="formatAuxLevel"
        @select-task="
          ({ taskKey, nodeId }) => {
            selectedTaskKey = taskKey;
            selectedNodeId = nodeId;
          }
        "
        @select-node="selectedNodeId = $event"
        @update:processId="selectedProcessId = $event"
        @update:threadId="selectedThreadId = $event"
      />

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
        @update:searchText="searchText = $event"
        @update:searchCaseSensitive="searchCaseSensitive = $event"
        @update:searchUseRegex="searchUseRegex = $event"
        @update:hideDebugInfo="hideDebugInfo = $event"
        @update:searchMaxResults="searchMaxResults = $event"
        @perform-search="performSearch"
      />

      <StatisticsPanel
        v-if="viewMode === 'statistics'"
        :node-statistics="nodeStatistics"
        :node-summary="nodeSummary"
        :stat-keyword="statKeyword"
        :stat-sort="statSort"
        :format-duration="formatDuration"
        @update:statKeyword="statKeyword = $event"
        @update:statSort="statSort = $event"
      />
    </div>
  </n-config-provider>
</template>

<style>
.app {
  min-height: 100vh;
  background: #f6f7fb;
  color: #1f2937;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px 24px;
  box-sizing: border-box;
  font-family: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

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

.hero {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
  position: relative;
}

.hero.drop-active {
  outline: 2px dashed #60a5fa;
  outline-offset: 6px;
  border-radius: 16px;
}

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
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.card-stat-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.card-stat-divider {
  color: #9ca3af;
  font-size: 12px;
}

.card-stat strong {
  color: #111827;
}

.card-hint {
  font-size: 12px;
  color: #9ca3af;
}

.panel {
  border-radius: 14px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.empty {
  color: #9ca3af;
  padding: 12px 0;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-list-wrapper {
  max-height: 140px;
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

.detail-section-label {
  color: #6b7280;
  font-size: 12px;
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
