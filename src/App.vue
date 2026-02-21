<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import {
  NConfigProvider,
  NButton,
  NCard,
  NInput,
  NCheckbox,
  NSelect,
  NProgress,
  NTag,
  NCollapse,
  NCollapseItem,
  NCode,
  NDivider
} from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

type SelectedFile = {
  name: string;
  size: number;
  type: string;
  file: File;
};

type LogLine = {
  timestamp: string;
  level: "DBG" | "INF" | "TRC" | "WRN" | "ERR";
  processId: string;
  threadId: string;
  sourceFile?: string;
  lineNumber?: string;
  functionName?: string;
  message: string;
  params: Record<string, any>;
  status?: "enter" | "leave";
  duration?: number;
  _lineNumber?: number;
};

type EventNotification = {
  timestamp: string;
  level: string;
  message: string;
  details: Record<string, any>;
  fileName: string;
  processId: string;
  threadId: string;
  _lineNumber?: number;
};

type NextListItem = {
  name: string;
  anchor: boolean;
  jump_back: boolean;
};

type RecognitionAttempt = {
  reco_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  reco_details?: RecognitionDetail;
  nested_nodes?: RecognitionAttempt[];
};

type ActionAttempt = {
  action_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  action_details?: ActionDetail;
  nested_actions?: ActionAttempt[];
};

type NodeInfo = {
  node_id: number;
  name: string;
  timestamp: string;
  status: "success" | "failed";
  task_id: number;
  reco_details?: RecognitionDetail;
  action_details?: ActionDetail;
  focus?: any;
  next_list: NextListItem[];
  recognition_attempts: RecognitionAttempt[];
  nested_action_nodes?: ActionAttempt[];
  nested_recognition_in_action?: RecognitionAttempt[];
  node_details?: {
    action_id: number;
    completed: boolean;
    name: string;
    node_id: number;
    reco_id: number;
  };
};

type RecognitionDetail = {
  reco_id: number;
  algorithm: string;
  box: [number, number, number, number] | null;
  detail: any;
  name: string;
};

type ActionDetail = {
  action_id: number;
  action: string;
  box: [number, number, number, number];
  detail: any;
  name: string;
  success: boolean;
};

type RawLine = {
  fileName: string;
  lineNumber: number;
  line: string;
};

type SearchResult = {
  fileName: string;
  lineNumber: number;
  line: string;
  rawLine: string;
  matchStart: number;
  matchEnd: number;
  key: string;
};

type NodeStat = {
  name: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successCount: number;
  failCount: number;
  successRate: number;
};

type TaskInfo = {
  key: string;
  fileName: string;
  task_id: number;
  entry: string;
  hash: string;
  uuid: string;
  start_time: string;
  end_time?: string;
  status: "running" | "succeeded" | "failed";
  nodes: NodeInfo[];
  processId: string;
  threadId: string;
  duration?: number;
  _startEventIndex?: number;
  _endEventIndex?: number;
};

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
const taskItemHeight = 84;
const nodeItemHeight = 72;
const searchItemHeight = 64;
const parseProgress = ref(0);
const selectedProcessId = ref("all");
const selectedThreadId = ref("all");

const filteredTasks = computed(() => {
  return tasks.value.filter(task => {
    const matchesProcess =
      selectedProcessId.value === "all" || task.processId === selectedProcessId.value;
    const matchesThread =
      selectedThreadId.value === "all" || task.threadId === selectedThreadId.value;
    return matchesProcess && matchesThread;
  });
});

const selectedTask = computed(() => {
  if (!selectedTaskKey.value) return null;
  return filteredTasks.value.find(task => task.key === selectedTaskKey.value) || null;
});

const selectedNode = computed(() => {
  if (!selectedTask.value || selectedNodeId.value === null) return null;
  return selectedTask.value.nodes.find(node => node.node_id === selectedNodeId.value) || null;
});

const selectedTaskNodes = computed(() => selectedTask.value?.nodes || []);

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

function formatSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getFileType(file: File) {
  if (file.type) return file.type;
  const parts = file.name.split(".");
  if (parts.length < 2) return "unknown";
  const extension = parts.pop();
  return extension ? extension.toLowerCase() : "unknown";
}

function formatNextName(item: NextListItem) {
  let prefix = "";
  if (item.jump_back) prefix += "[JumpBack] ";
  if (item.anchor) prefix += "[Anchor] ";
  return prefix + item.name;
}

function formatDuration(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest.toFixed(1)}s`;
}

function formatTaskStatus(status: TaskInfo["status"]) {
  if (status === "succeeded") return "成功";
  if (status === "failed") return "失败";
  return "运行中";
}

function formatTaskTimeParts(value: string) {
  if (!value) return { date: "", time: "" };
  const match = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (match) {
    return { date: match[1], time: match[2] };
  }
  return { date: value, time: "" };
}

function formatResultStatus(status: "success" | "failed") {
  return status === "success" ? "成功" : "失败";
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

const quickSearchOptions = [
  "reco hit",
  "Version",
  "[ERR]",
  "display_width_="
];

const debugInfoPattern = /\[P[xX]\d+\]|\[T[xX]\d+\]|\[L\d+\]|\[[^\]]+\.(cpp|h|hpp|c)\]/gi;

function normalizeSearchLine(line: string) {
  if (!hideDebugInfo.value) return line;
  return line.replace(debugInfoPattern, "").replace(/\s{2,}/g, " ").trim();
}

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

function buildTasks(events: EventNotification[], stringPool: StringPool) {
  const tasks: TaskInfo[] = [];
  const taskProcessMap = new Map<number, { processId: string; threadId: string }>();
  const taskUuidMap = new Map<string, { processId: string; threadId: string }>();
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const { message, details, fileName } = event;
    const processThread = { processId: event.processId, threadId: event.threadId };
    if (details?.task_id) {
      taskProcessMap.set(details.task_id, processThread);
    }
    if (details?.uuid) {
      taskUuidMap.set(details.uuid, processThread);
    }
    if (message === "Tasker.Task.Starting") {
      const taskId = details.task_id;
      const uuid = details.uuid || "";
      const isDuplicate = tasks.some(
        t => t.uuid === uuid && t.task_id === taskId && !t.end_time
      );
      if (taskId && !isDuplicate) {
        const processInfo =
          (uuid && taskUuidMap.get(uuid)) || taskProcessMap.get(taskId) || processThread;
        tasks.push({
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
        });
      }
    } else if (message === "Tasker.Task.Succeeded" || message === "Tasker.Task.Failed") {
      const taskId = details.task_id;
      const uuid = details.uuid || "";
      let matchedTask = null;
      if (uuid && uuid.trim() !== "") {
        matchedTask = tasks.find(t => t.uuid === uuid && !t.end_time);
      } else {
        matchedTask = tasks.find(t => t.task_id === taskId && !t.end_time);
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

function buildTaskNodes(task: TaskInfo, events: EventNotification[], stringPool: StringPool) {
  const nodes: NodeInfo[] = [];
  const nodeIdSet = new Set<number>();
  const startIndex = task._startEventIndex ?? 0;
  const endIndex = task._endEventIndex ?? events.length - 1;
  const taskEvents = events.slice(startIndex, endIndex + 1);
  const recognitionAttempts: RecognitionAttempt[] = [];
  const nestedNodes: RecognitionAttempt[] = [];
  const nestedActionNodes: ActionAttempt[] = [];
  let currentNextList: NextListItem[] = [];
  const recognitionsByTaskId = new Map<number, RecognitionAttempt[]>();
  const actionsByTaskId = new Map<number, ActionAttempt[]>();
  for (const event of taskEvents) {
    const { message, details } = event;
    if (
      (message === "Node.NextList.Starting" || message === "Node.NextList.Succeeded") &&
      details.task_id === task.task_id
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
      const taskId = details.task_id;
      if (taskId !== task.task_id) {
        const nestedRecognitions = recognitionsByTaskId.get(taskId) || [];
        nestedNodes.push({
          reco_id: details.reco_details?.reco_id || details.node_id,
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
      const taskId = details.task_id;
      if (taskId !== task.task_id) {
        const nestedActions = actionsByTaskId.get(taskId) || [];
        nestedActionNodes.push({
          action_id: details.action_details?.action_id || details.node_id,
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
      details.task_id === task.task_id
    ) {
      recognitionAttempts.push({
        reco_id: details.reco_id,
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
      const taskId = details.task_id;
      const attempt: RecognitionAttempt = {
        reco_id: details.reco_id,
        name: stringPool.intern(details.name || details.node_name || ""),
        timestamp: stringPool.intern(event.timestamp),
        status: message === "Node.Recognition.Succeeded" ? "success" : "failed",
        reco_details: details.reco_details
      };
      if (!recognitionsByTaskId.has(taskId)) {
        recognitionsByTaskId.set(taskId, []);
      }
      recognitionsByTaskId.get(taskId)!.push(attempt);
    }

    if (message === "Node.Action.Succeeded" || message === "Node.Action.Failed") {
      const taskId = details.task_id;
      if (taskId !== task.task_id) {
        const actionAttempt: ActionAttempt = {
          action_id: details.action_id,
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
      details.task_id === task.task_id
    ) {
      const nodeId = details.node_id ?? details.nodeId;
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

function performSearch() {
  if (!searchText.value.trim()) {
    searchResults.value = [];
    searchMessage.value = "请输入搜索内容";
    return;
  }
  if (rawLines.value.length === 0) {
    searchResults.value = [];
    searchMessage.value = "请先解析日志";
    return;
  }
  let regex: RegExp | null = null;
  if (searchUseRegex.value) {
    try {
      regex = new RegExp(searchText.value, searchCaseSensitive.value ? "g" : "gi");
    } catch {
      searchResults.value = [];
      searchMessage.value = "正则表达式无效";
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
}

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
  } else {
    parseState.value = "idle";
    statusMessage.value = "请先选择日志文件";
  }
}

function isTauriEnv() {
  const win = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return !!win.__TAURI__ || !!win.__TAURI_INTERNALS__;
}

function getFileNameFromPath(path: string) {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

async function applySelectedPaths(paths: string[]) {
  const logPaths = paths.filter(path => path.toLowerCase().endsWith(".log"));
  if (logPaths.length === 0) {
    statusMessage.value = "仅支持 .log 文件";
    return;
  }
  const files: File[] = [];
  for (const path of logPaths) {
    const url = convertFileSrc(path);
    const response = await fetch(url);
    const blob = await response.blob();
    const name = getFileNameFromPath(path);
    files.push(new File([blob], name, { type: "text/plain" }));
  }
  applySelectedFiles(files);
}

function filterLogFiles(fileList: File[]) {
  return fileList.filter(file => file.name.toLowerCase().endsWith(".log"));
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const logFiles = filterLogFiles(Array.from(input.files));
  if (logFiles.length === 0) {
    statusMessage.value = "仅支持 .log 文件";
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

function handleDrop(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  isDragging.value = false;
  const files = filterLogFiles(Array.from(event.dataTransfer?.files || []));
  if (files.length === 0) {
    statusMessage.value = "仅支持 .log 文件";
    return;
  }
  applySelectedFiles(files);
}

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

function handleDragLeave(event: DragEvent) {
  event.stopPropagation();
  if (event.currentTarget !== event.target) return;
  isDragging.value = false;
}

let unlistenDragDrop: (() => void) | null = null;

onMounted(() => {
  if (isTauriEnv()) {
    const setup = async () => {
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
});

async function handleParse() {
  if (selectedFiles.value.length === 0) return;
  parseState.value = "parsing";
  statusMessage.value = "解析中…";
  parseProgress.value = 0;
  try {
    const events: EventNotification[] = [];
    const allLines: RawLine[] = [];
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
      for (let startIdx = 0; startIdx < lines.length; startIdx += chunkSize) {
        const endIdx = Math.min(startIdx + chunkSize, lines.length);
        for (let i = startIdx; i < endIdx; i++) {
          const originalLine = lines[i];
          const lineNumber = i + 1;
          allLines.push({ fileName: file.name, lineNumber, line: originalLine });
          const rawLine = originalLine.trim();
          if (!rawLine) continue;
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
    selectedTaskKey.value = filteredTasks.value.length > 0 ? filteredTasks.value[0].key : null;
    selectedNodeId.value =
      filteredTasks.value.length > 0 && filteredTasks.value[0].nodes.length > 0
        ? filteredTasks.value[0].nodes[0].node_id
        : null;
    parseState.value = "done";
    statusMessage.value =
      tasks.value.length > 0 ? `解析完成，共 ${tasks.value.length} 个任务` : "解析完成，未识别到任务";
  } catch {
    parseState.value = "ready";
    statusMessage.value = "解析失败，请检查日志内容";
    parseProgress.value = 0;
  }
}
</script>

<template>
  <n-config-provider>
    <div class="app" @dragover.prevent @drop.prevent="handleDrop">
      <header class="topbar">
        <div class="brand">
          <div class="subtitle">日志解析 · 任务与节点可视化</div>
        </div>
        <div class="top-actions">
          <div class="view-tabs">
            <n-button
              size="small"
              :type="viewMode === 'analysis' ? 'primary' : 'default'"
              @click="viewMode = 'analysis'"
            >
              日志分析
            </n-button>
            <n-button
              size="small"
              :type="viewMode === 'search' ? 'primary' : 'default'"
              @click="viewMode = 'search'"
            >
              文本搜索
            </n-button>
            <n-button
              size="small"
              :type="viewMode === 'statistics' ? 'primary' : 'default'"
              @click="viewMode = 'statistics'"
            >
              节点统计
            </n-button>
          </div>
        </div>
      </header>
      <div v-if="isDragging" class="drop-mask" @drop="handleDrop" @dragover="handleDragOver">
        松手导入日志文件
      </div>
      <div v-if="copyMessage" class="copy-toast">{{ copyMessage }}</div>

      <section
        class="hero"
        :class="{ 'drop-active': isDragging }"
        @dragover="handleDragOver"
        @dragenter="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div class="hero-text">
          <h1>快速定位任务节点与异常</h1>
          <div class="actions">
            <label class="upload">
              <n-button size="small">选择日志文件</n-button>
              <input type="file" multiple accept=".log" @change="handleFileChange" />
            </label>
            <n-button
              type="primary"
              size="small"
              :disabled="parseState === 'parsing' || selectedFiles.length === 0"
              @click="handleParse"
            >
              {{ parseState === "parsing" ? "解析中…" : "开始解析" }}
            </n-button>
          </div>
          <div class="drag-hint">导入 maa.log，支持拖拽导入 .log</div>
        </div>
        <n-card class="hero-card" size="small">
          <template #header>当前选择</template>
          <div class="card-stat">
            <span>文件数量</span>
            <strong>{{ selectedFiles.length }}</strong>
          </div>
          <div class="card-stat">
            <span>总大小</span>
            <strong>{{ formatSize(totalSize) }}</strong>
          </div>
          <n-progress v-if="parseState === 'parsing'" :percentage="parseProgress" processing />
          <div class="card-hint">{{ statusMessage }}</div>
        </n-card>
      </section>

      <n-card class="panel" size="small">
        <template #header>文件列表</template>
        <div v-if="selectedFiles.length === 0" class="empty">请先选择日志文件</div>
        <div v-else class="file-list">
          <div v-for="file in selectedFiles" :key="file.name" class="file-row">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">{{ formatSize(file.size) }}</div>
            <div class="file-meta">{{ file.type }}</div>
          </div>
        </div>
      </n-card>

      <n-card class="panel" size="small" v-if="viewMode === 'analysis'">
        <template #header>任务与节点</template>
        <div v-if="tasks.length === 0" class="empty">解析后将在此显示任务与节点</div>
        <div v-else class="task-layout">
          <div class="task-list">
            <div class="node-header">任务列表</div>
            <div class="task-filters">
              <n-select
                size="small"
                :options="processOptions"
                v-model:value="selectedProcessId"
                placeholder="进程"
              />
              <n-select
                size="small"
                :options="threadOptions"
                v-model:value="selectedThreadId"
                placeholder="线程"
              />
            </div>
            <div class="task-list-content">
              <DynamicScroller
                class="virtual-scroller"
                :items="filteredTasks"
                key-field="key"
                :min-item-size="taskItemHeight"
              >
                <template #default="{ item, active }">
                  <DynamicScrollerItem
                    :item="item"
                    :active="active"
                    :size-dependencies="[item.nodes.length, item.status, item.entry]"
                  >
                    <div
                      class="task-row"
                      :class="{ active: item.key === selectedTaskKey }"
                      @click="
                        selectedTaskKey = item.key;
                        selectedNodeId = item.nodes[0]?.node_id ?? null;
                      "
                    >
                      <div class="task-main">
                        <div class="task-title">{{ item.entry || "未命名任务" }}</div>
                        <div class="task-tags">
                          <n-tag size="small" type="info">进程ID：{{ item.processId || "P?" }}</n-tag>
                          <n-tag size="small">线程ID：{{ item.threadId || "T?" }}</n-tag>
                        </div>
                      </div>
                      <div class="task-sub">
                        <div>文件： {{ item.fileName }}</div>
                        <div>节点： {{ item.nodes.length }}个</div>
                      </div>
                      <div class="task-side">
                        <div>状态： {{ formatTaskStatus(item.status) }}</div>
                        <div class="task-side-row">
                          <div class="task-side-label">开始时间：</div>
                          <div class="task-side-value">
                            <span>{{ formatTaskTimeParts(item.start_time).date }}</span>
                            <span v-if="formatTaskTimeParts(item.start_time).time">
                              {{ formatTaskTimeParts(item.start_time).time }}
                            </span>
                          </div>
                        </div>
                        <div class="task-side-row">
                          <div class="task-side-label">耗时：</div>
                          <div class="task-side-value">
                            {{ item.duration ? formatDuration(item.duration) : "-" }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </DynamicScrollerItem>
                </template>
              </DynamicScroller>
            </div>
          </div>
          <div class="node-list">
            <div class="node-header">节点列表</div>
            <div v-if="!selectedTaskKey" class="empty">请选择左侧任务</div>
            <div v-else class="node-list-content">
              <DynamicScroller
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
                  >
                    <div
                      class="node-row"
                      :class="{ active: item.node_id === selectedNodeId }"
                      @click="selectedNodeId = item.node_id"
                    >
                      <div class="node-main">
                        <div class="node-name">{{ item.name || item.node_id }}</div>
                        <div class="node-sub">
                          <div>时间： {{ item.timestamp }}</div>
                          <div>状态： {{ formatResultStatus(item.status) }}</div>
                        </div>
                      </div>
                      <div class="node-badges">
                        <div class="node-badge">进行识别： {{ item.recognition_attempts?.length || 0 }}次</div>
                        <div class="node-badge">Next列表： {{ item.next_list?.length || 0 }}个</div>
                      </div>
                    </div>
                  </DynamicScrollerItem>
                </template>
              </DynamicScroller>
              <div v-if="(selectedTask?.nodes || []).length === 0" class="empty">
                未发现节点事件
              </div>
            </div>
          </div>
          <div class="detail-panel">
            <div class="node-header">节点详情</div>
            <div v-if="!selectedNode" class="empty">请选择节点</div>
            <div v-else class="detail-content">
              <div class="detail-section-card" v-if="selectedNode.reco_details">
                <div class="detail-section-header">
                  <div class="detail-section-title">识别详情</div>
                  <n-button size="tiny" @click="copyJson(selectedNode.reco_details)">复制</n-button>
                </div>
                <div class="detail-section-grid">
                  <div class="detail-section-cell">
                    <div class="detail-section-label">识别 ID</div>
                    <div class="detail-section-value">{{ selectedNode.reco_details.reco_id }}</div>
                  </div>
                  <div class="detail-section-cell">
                    <div class="detail-section-label">识别算法</div>
                    <div class="detail-section-value">
                      <n-tag size="small" type="info">{{ selectedNode.reco_details.algorithm }}</n-tag>
                    </div>
                  </div>
                  <div class="detail-section-cell">
                    <div class="detail-section-label">节点名称</div>
                    <div class="detail-section-value">{{ selectedNode.reco_details.name }}</div>
                  </div>
                  <div class="detail-section-cell">
                    <div class="detail-section-label">识别位置</div>
                    <div class="detail-section-value detail-section-box">
                      {{ formatBox(selectedNode.reco_details.box) }}
                    </div>
                  </div>
                </div>
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
              <div v-else class="detail-section-card">
                <div class="detail-section-header">
                  <div class="detail-section-title">识别详情</div>
                </div>
                <div class="empty">无 Recognition 详情</div>
              </div>
              <div class="detail-section-card" v-if="selectedNode.action_details">
                <div class="detail-section-header">
                  <div class="detail-section-title">动作详情</div>
                  <n-button size="tiny" @click="copyJson(selectedNode.action_details)">复制</n-button>
                </div>
                <div class="detail-section-grid">
                  <div class="detail-section-cell">
                    <div class="detail-section-label">动作 ID</div>
                    <div class="detail-section-value">{{ selectedNode.action_details.action_id }}</div>
                  </div>
                  <div class="detail-section-cell">
                    <div class="detail-section-label">动作类型</div>
                    <div class="detail-section-value">
                      <n-tag size="small" type="success">{{ selectedNode.action_details.action }}</n-tag>
                    </div>
                  </div>
                  <div class="detail-section-cell">
                    <div class="detail-section-label">节点名称</div>
                    <div class="detail-section-value">{{ selectedNode.action_details.name }}</div>
                  </div>
                  <div class="detail-section-cell">
                    <div class="detail-section-label">执行结果</div>
                    <div class="detail-section-value">
                      <n-tag size="small" :type="selectedNode.action_details.success ? 'success' : 'error'">
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
              <div v-else class="detail-section-card">
                <div class="detail-section-header">
                  <div class="detail-section-title">动作详情</div>
                </div>
                <div class="empty">无 Action 详情</div>
              </div>
              <n-collapse :default-expanded-names="[]">
                <n-collapse-item name="base">
                  <template #header>
                    <div class="collapse-header">
                      <span>基础信息</span>
                      <span class="collapse-summary">{{ summarizeBase(selectedNode) }}</span>
                    </div>
                  </template>
                  <div class="detail-grid">
                    <div>名称: {{ selectedNode.name }}</div>
                    <div>时间: {{ selectedNode.timestamp }}</div>
                    <div>
                      状态:
                      <n-tag size="small" :type="selectedNode.status === 'success' ? 'success' : 'error'">
                        {{ formatResultStatus(selectedNode.status) }}
                      </n-tag>
                    </div>
                    <div>任务: {{ selectedNode.task_id }}</div>
                    <div>节点ID: {{ selectedNode.node_id }}</div>
                  </div>
                </n-collapse-item>
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
                  <div v-else class="detail-list">
                    <div
                      v-for="(attempt, index) in selectedNode.recognition_attempts"
                      :key="`${selectedNode.node_id}-${index}`"
                      class="detail-item"
                    >
                      <div class="detail-item-title">
                        {{ attempt.name || "Recognition" }} · {{ formatResultStatus(attempt.status) }} · {{ attempt.timestamp }}
                      </div>
                      <div v-if="attempt.reco_details" class="detail-actions">
                        <n-button size="tiny" @click="copyJson(attempt.reco_details)">复制</n-button>
                      </div>
                      <n-code
                        v-if="attempt.reco_details"
                        :code="JSON.stringify(attempt.reco_details, null, 2)"
                        language="json"
                        word-wrap
                        class="detail-code"
                      />
                      <div v-if="(attempt.nested_nodes || []).length > 0" class="nested-list">
                        <div
                          v-for="(nested, nestedIndex) in attempt.nested_nodes"
                          :key="`${selectedNode.node_id}-${index}-nested-${nestedIndex}`"
                          class="detail-item nested"
                        >
                          <div class="detail-item-title">
                            {{ nested.name || "Nested" }} · {{ formatResultStatus(nested.status) }} · {{ nested.timestamp }}
                          </div>
                          <div v-if="nested.reco_details" class="detail-actions">
                            <n-button size="tiny" @click="copyJson(nested.reco_details)">复制</n-button>
                          </div>
                          <n-code
                            v-if="nested.reco_details"
                            :code="JSON.stringify(nested.reco_details, null, 2)"
                            language="json"
                            word-wrap
                            class="detail-code"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </n-collapse-item>
                <n-collapse-item name="action-nested">
                  <template #header>
                    <div class="collapse-header">
                      <span>嵌套动作节点</span>
                      <span class="collapse-summary">{{ summarizeNestedActions(selectedNode) }}</span>
                    </div>
                  </template>
                  <div v-if="(selectedNode.nested_action_nodes || []).length === 0" class="empty">
                    无嵌套动作节点
                  </div>
                  <div v-else class="detail-list">
                    <div
                      v-for="(actionNode, actionIndex) in selectedNode.nested_action_nodes"
                      :key="`${selectedNode.node_id}-action-${actionIndex}`"
                      class="detail-item"
                    >
                      <div class="detail-item-title">
                        {{ actionNode.name || "Action" }} · {{ formatResultStatus(actionNode.status) }} · {{ actionNode.timestamp }}
                      </div>
                      <div v-if="actionNode.action_details" class="detail-actions">
                        <n-button size="tiny" @click="copyJson(actionNode.action_details)">复制</n-button>
                      </div>
                      <n-code
                        v-if="actionNode.action_details"
                        :code="JSON.stringify(actionNode.action_details, null, 2)"
                        language="json"
                        word-wrap
                        class="detail-code"
                      />
                    </div>
                  </div>
                </n-collapse-item>
                <n-collapse-item name="next">
                  <template #header>
                    <div class="collapse-header">
                      <span>Next List</span>
                      <span class="collapse-summary">{{ summarizeNextList(selectedNode) }}</span>
                    </div>
                  </template>
                  <div v-if="(selectedNode.next_list || []).length === 0" class="empty">无 Next List</div>
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
                </n-collapse-item>
                <n-collapse-item name="node-detail">
                  <template #header>
                    <div class="collapse-header">
                      <span>节点配置</span>
                      <span class="collapse-summary">{{ summarizeNodeDetail(selectedNode) }}</span>
                    </div>
                  </template>
                  <div v-if="selectedNode.node_details" class="detail-actions">
                    <n-button size="tiny" @click="copyJson(selectedNode.node_details)">复制</n-button>
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
                <n-collapse-item name="focus">
                  <template #header>
                    <div class="collapse-header">
                      <span>Focus</span>
                      <span class="collapse-summary">{{ summarizeFocus(selectedNode) }}</span>
                    </div>
                  </template>
                  <div v-if="selectedNode.focus" class="detail-actions">
                    <n-button size="tiny" @click="copyJson(selectedNode.focus)">复制</n-button>
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
              </n-collapse>
            </div>
          </div>
        </div>
      </n-card>

      <n-card class="panel" size="small" v-if="viewMode === 'search'">
        <template #header>文本搜索</template>
        <div class="search-controls">
          <n-input
            v-model:value="searchText"
            placeholder="输入搜索内容"
            :disabled="rawLines.length === 0"
          />
          <n-checkbox v-model:checked="searchCaseSensitive">区分大小写</n-checkbox>
          <n-checkbox v-model:checked="searchUseRegex">正则表达式</n-checkbox>
          <n-checkbox v-model:checked="hideDebugInfo">隐藏调试信息</n-checkbox>
          <n-select
            size="small"
            :options="[
              { label: '200条', value: 200 },
              { label: '500条', value: 500 },
              { label: '1000条', value: 1000 }
            ]"
            v-model:value="searchMaxResults"
          />
          <n-button type="primary" size="small" @click="performSearch" :disabled="rawLines.length === 0">
            搜索
          </n-button>
        </div>
        <div class="search-quick">
          <n-button
            v-for="item in quickSearchOptions"
            :key="item"
            size="tiny"
            @click="
              searchText = item;
              performSearch();
            "
          >
            {{ item }}
          </n-button>
        </div>
        <div class="search-message">{{ searchMessage || '输入关键字后点击搜索' }}</div>
        <div v-if="searchResults.length === 0" class="empty">暂无搜索结果</div>
        <div v-else class="search-results">
          <DynamicScroller
            class="virtual-scroller"
            :items="searchResults"
            key-field="key"
            :min-item-size="searchItemHeight"
          >
            <template #default="{ item, active }">
              <DynamicScrollerItem
                :item="item"
                :active="active"
                :size-dependencies="[item.line, item.matchStart, item.matchEnd]"
              >
                <div class="search-row">
                  <div class="search-meta">
                    {{ item.fileName }} · L{{ item.lineNumber }}
                  </div>
                  <div class="search-line">
                    <span>{{ splitMatch(item.line, item.matchStart, item.matchEnd).before }}</span>
                    <span class="search-hit">{{ splitMatch(item.line, item.matchStart, item.matchEnd).match }}</span>
                    <span>{{ splitMatch(item.line, item.matchStart, item.matchEnd).after }}</span>
                  </div>
                </div>
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>
        </div>
      </n-card>

      <n-card class="panel" size="small" v-if="viewMode === 'statistics'">
        <template #header>节点统计</template>
        <div v-if="nodeStatistics.length === 0" class="empty">解析后将在此显示统计数据</div>
        <div v-else>
          <div class="stat-controls">
            <n-input v-model:value="statKeyword" placeholder="按节点名过滤" />
            <n-select
              size="small"
              :options="[
                { label: '按平均耗时', value: 'avgDuration' },
                { label: '按执行次数', value: 'count' },
                { label: '按失败率', value: 'failRate' }
              ]"
              v-model:value="statSort"
            />
          </div>
          <div v-if="nodeSummary" class="stat-summary">
            <div>
              <div class="stat-label">节点类型</div>
              <div class="stat-value">{{ nodeSummary.uniqueNodes }}</div>
            </div>
            <div>
              <div class="stat-label">总执行次数</div>
              <div class="stat-value">{{ nodeSummary.totalNodes }}</div>
            </div>
            <div>
              <div class="stat-label">平均耗时</div>
              <div class="stat-value">{{ formatDuration(nodeSummary.avgDuration) }}</div>
            </div>
            <div>
              <div class="stat-label">总耗时</div>
              <div class="stat-value">{{ formatDuration(nodeSummary.totalDuration) }}</div>
            </div>
            <div>
              <div class="stat-label">最慢节点</div>
              <div class="stat-value">{{ nodeSummary.slowestNode.name }}</div>
            </div>
          </div>
          <n-divider />
          <div class="stat-table">
            <div class="stat-row header">
              <div>节点名称</div>
              <div>次数</div>
              <div>成功/失败</div>
              <div>平均耗时</div>
              <div>最大耗时</div>
              <div>成功率</div>
            </div>
            <div v-for="stat in nodeStatistics" :key="stat.name" class="stat-row">
              <div class="stat-name">{{ stat.name }}</div>
              <div>{{ stat.count }}</div>
              <div>{{ stat.successCount }}/{{ stat.failCount }}</div>
              <div>{{ formatDuration(stat.avgDuration) }}</div>
              <div>{{ formatDuration(stat.maxDuration) }}</div>
              <div>{{ stat.successRate.toFixed(1) }}%</div>
            </div>
          </div>
        </div>
      </n-card>
    </div>
  </n-config-provider>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: #f6f7fb;
  color: #1f2937;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 28px 40px;
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
  gap: 6px;
}

.name {
  font-size: 22px;
  font-weight: 600;
}

.subtitle {
  font-size: 13px;
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
  gap: 16px;
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
  gap: 8px;
}

.hero {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 24px;
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
  font-size: 28px;
  margin: 0 0 8px;
}

.hero-text p {
  color: #6b7280;
  margin-bottom: 18px;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.drag-hint {
  margin-top: 8px;
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
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-title {
  font-size: 14px;
  color: #6b7280;
}

.card-stat {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
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

.empty {
  color: #9ca3af;
  padding: 12px 0;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.file-row {
  display: grid;
  grid-template-columns: 1fr 120px 180px;
  gap: 12px;
  padding: 10px 12px;
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

.task-layout {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1.4fr;
  gap: 16px;
}

.task-list,
.node-list,
.detail-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-list-content {
  height: 520px;
  display: block;
}

.node-list-content {
  height: 520px;
  display: block;
}

.detail-panel .detail-content {
  max-height: 520px;
  overflow-y: auto;
  padding-right: 6px;
}

.task-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  cursor: pointer;
  font-size: 13px;
  align-items: center;
  min-height: 84px;
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
}

.task-side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #6b7280;
  font-size: 12px;
  text-align: right;
  align-items: flex-end;
}

.task-side-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
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
