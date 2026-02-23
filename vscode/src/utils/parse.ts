import * as vscode from 'vscode';
import type { LogLine, EventNotification, TaskInfo, ControllerInfo, NodeInfo, AuxLogEntry, ParseResult, AdbScreencapMethod, AdbInputMethod, Win32ScreencapMethod, Win32InputMethod, RecognitionDetail, ActionDetail, RecognitionAttempt, NextListItem } from '../types/logTypes';

const ADB_SCREENCAP_METHOD_MAP: Record<number, AdbScreencapMethod> = {
  1: "EncodeToFileAndPull",
  2: "Encode",
  4: "RawWithGzip",
  8: "RawByNetcat",
  16: "MinicapDirect",
  32: "MinicapStream",
  64: "EmulatorExtras"
};

const ADB_INPUT_METHOD_MAP: Record<number, AdbInputMethod> = {
  1: "AdbShell",
  2: "MinitouchAndAdbKey",
  4: "Maatouch",
  8: "EmulatorExtras"
};

const WIN32_SCREENCAP_METHOD_MAP: Record<number, Win32ScreencapMethod> = {
  1: "GDI",
  2: "FramePool",
  4: "DXGI_DesktopDup",
  8: "DXGI_DesktopDup_Window",
  16: "PrintWindow",
  32: "ScreenDC"
};

const WIN32_INPUT_METHOD_MAP: Record<number, Win32InputMethod> = {
  1: "Seize",
  2: "SendMessage",
  4: "PostMessage",
  8: "LegacyEvent",
  16: "PostThreadMessage",
  32: "SendMessageWithCursorPos",
  64: "PostMessageWithCursorPos",
  128: "SendMessageWithWindowPos",
  256: "PostMessageWithWindowPos"
};

export class StringPool {
  private pool = new Map<string, string>();

  intern(value: string | undefined | null): string {
    if (value === undefined || value === null) return "";
    if (!this.pool.has(value)) {
      this.pool.set(value, value);
    }
    return this.pool.get(value)!;
  }

  clear(): void {
    this.pool.clear();
  }
}

export function parseAdbScreencapMethods(bitmask: number): AdbScreencapMethod[] {
  const methods: AdbScreencapMethod[] = [];
  for (const [bit, name] of Object.entries(ADB_SCREENCAP_METHOD_MAP)) {
    if ((bitmask & parseInt(bit)) !== 0) {
      methods.push(name);
    }
  }
  return methods.length > 0 ? methods : ["Unknown"];
}

export function parseAdbInputMethods(bitmask: number | bigint): AdbInputMethod[] {
  const methods: AdbInputMethod[] = [];
  const bigBitmask = typeof bitmask === "bigint" ? bitmask : BigInt(bitmask);
  for (const [bit, name] of Object.entries(ADB_INPUT_METHOD_MAP)) {
    if ((bigBitmask & BigInt(bit)) !== 0n) {
      methods.push(name);
    }
  }
  return methods.length > 0 ? methods : ["Unknown"];
}

export function parseWin32ScreencapMethod(value: number): Win32ScreencapMethod {
  return WIN32_SCREENCAP_METHOD_MAP[value] || "Unknown";
}

export function parseWin32InputMethod(value: number): Win32InputMethod {
  return WIN32_INPUT_METHOD_MAP[value] || "Unknown";
}

export function parseValue(value: string): unknown {
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value) && value.length > 15) {
    return BigInt(value);
  }
  if (/^-?\d+$/.test(value)) return parseInt(value);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function normalizeId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return undefined;
}

export function parseMessageAndParams(message: string): {
  message: string;
  params: Record<string, unknown>;
  status?: "enter" | "leave";
  duration?: number;
} {
  const params: Record<string, unknown> = {};
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
        if (message[j] === "{") braceDepth++;
        else if (message[j] === "}") braceDepth--;
        else if (message[j] === "[" && braceDepth === 0) depth++;
        else if (message[j] === "]" && braceDepth === 0) depth--;
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
    if (statusMatch[2]) duration = parseInt(statusMatch[2]);
    cleanMessage = cleanMessage.replace(/\|\s*(enter|leave).*$/, "").trim();
  }

  return { message: cleanMessage, params, status, duration };
}

export function parseLine(line: string, lineNum: number): LogLine | null {
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

export function parseEventNotification(parsed: LogLine, fileName: string): EventNotification | null {
  const { message, params } = parsed;
  if (!message.includes("!!!OnEventNotify!!!")) return null;

  const msg = params["msg"];
  const details = params["details"];
  if (!msg) return null;

  return {
    timestamp: parsed.timestamp,
    level: parsed.level,
    message: msg as string,
    details: (details as Record<string, unknown>) || {},
    _lineNumber: parsed._lineNumber,
    fileName,
    processId: parsed.processId,
    threadId: parsed.threadId
  };
}

export function parseControllerInfo(parsed: LogLine, fileName: string): ControllerInfo | null {
  const { functionName, params, timestamp, status, processId } = parsed;

  if (functionName !== "MaaAdbControllerCreate" && functionName !== "MaaWin32ControllerCreate") {
    return null;
  }

  if (status !== "enter") return null;

  if (functionName === "MaaAdbControllerCreate") {
    const adbPath = params["adb_path"] as string | undefined;
    const address = params["address"] as string | undefined;
    const screencapMethodsBitmask = typeof params["screencap_methods"] === "number" ? params["screencap_methods"] : parseInt(String(params["screencap_methods"] || "0"));
    const inputMethodsValue = params["input_methods"];
    const inputMethodsBitmask = typeof inputMethodsValue === "bigint" ? inputMethodsValue : (typeof inputMethodsValue === "number" ? BigInt(inputMethodsValue) : 0n);
    const config = params["config"] as Record<string, unknown> | undefined;
    const agentPath = params["agent_path"] as string | undefined;

    return {
      type: "adb",
      processId,
      adbPath,
      address,
      screencapMethods: parseAdbScreencapMethods(screencapMethodsBitmask),
      inputMethods: parseAdbInputMethods(inputMethodsBitmask),
      config,
      agentPath,
      timestamp,
      fileName,
      lineNumber: parsed._lineNumber || 0
    };
  }

  if (functionName === "MaaWin32ControllerCreate") {
    const screencapMethodValue = typeof params["screencap_method"] === "number" ? params["screencap_method"] : parseInt(String(params["screencap_method"] || "0"));
    const mouseMethodValue = typeof params["mouse_method"] === "number" ? params["mouse_method"] : parseInt(String(params["mouse_method"] || "0"));
    const keyboardMethodValue = typeof params["keyboard_method"] === "number" ? params["keyboard_method"] : parseInt(String(params["keyboard_method"] || "0"));

    return {
      type: "win32",
      processId,
      screencapMethod: parseWin32ScreencapMethod(screencapMethodValue),
      mouseMethod: parseWin32InputMethod(mouseMethodValue),
      keyboardMethod: parseWin32InputMethod(keyboardMethodValue),
      timestamp,
      fileName,
      lineNumber: parsed._lineNumber || 0
    };
  }

  return null;
}

export function extractIdentifierFromLine(line: string): string | null {
  const match = line.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  return match ? match[1] : null;
}

export function buildIdentifierRanges(
  eventIdentifierMap: Map<number, string>,
  totalEvents: number
): { identifier: string; startIndex: number; endIndex: number }[] {
  const ranges: { identifier: string; startIndex: number; endIndex: number }[] = [];
  const sortedEntries = [...eventIdentifierMap.entries()].sort((a, b) => a[0] - b[0]);
  if (sortedEntries.length === 0) return ranges;

  let currentIdentifier = sortedEntries[0][1];
  let currentStart = sortedEntries[0][0];

  for (let i = 1; i < sortedEntries.length; i++) {
    const [eventIndex, identifier] = sortedEntries[i];
    if (identifier !== currentIdentifier) {
      ranges.push({ identifier: currentIdentifier, startIndex: currentStart, endIndex: eventIndex - 1 });
      currentIdentifier = identifier;
      currentStart = eventIndex;
    }
  }

  ranges.push({ identifier: currentIdentifier, startIndex: currentStart, endIndex: totalEvents - 1 });
  return ranges;
}

export function buildTasks(
  events: EventNotification[],
  stringPool: StringPool,
  identifierRanges: { identifier: string; startIndex: number; endIndex: number }[] = []
): TaskInfo[] {
  const tasks: TaskInfo[] = [];
  const runningTaskMap = new Map<string, TaskInfo>();
  const taskProcessMap = new Map<number, { processId: string; threadId: string }>();
  const taskUuidMap = new Map<string, { processId: string; threadId: string }>();
  let taskKeyCounter = 0;

  const buildTaskKey = (taskId: number, uuid: string, processId: string) =>
    `${processId || "proc"}:${uuid || "uuid"}:${taskId}`;

  const getIdentifierForEventIndex = (index: number): string | undefined => {
    for (const range of identifierRanges) {
      if (index >= range.startIndex && index <= range.endIndex) {
        return range.identifier;
      }
    }
    return undefined;
  };

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const { message, details, fileName } = event;
    const eventTaskId = normalizeId(details?.task_id ?? details?.taskId);
    const processThread = { processId: event.processId, threadId: event.threadId };

    if (eventTaskId !== undefined) {
      taskProcessMap.set(eventTaskId, processThread);
    }

    if (details?.uuid) {
      taskUuidMap.set(details.uuid as string, processThread);
    }

    if (message === "Tasker.Task.Starting") {
      const taskId = eventTaskId;
      if (taskId === undefined) continue;

      const uuid = (details.uuid as string) || "";
      const taskKey = buildTaskKey(taskId, uuid, event.processId);
      const entry = (details.entry as string) || "";

      if (taskId && runningTaskMap.has(taskKey)) {
        const prevTask = runningTaskMap.get(taskKey);
        if (prevTask && !prevTask.end_time) {
          prevTask.status = "failed";
          prevTask.end_time = stringPool.intern(event.timestamp);
          if (prevTask.start_time && prevTask.end_time) {
            prevTask.duration = new Date(prevTask.end_time).getTime() - new Date(prevTask.start_time).getTime();
          }
        }
        runningTaskMap.delete(taskKey);
      }

      if (taskId && !runningTaskMap.has(taskKey)) {
        const processInfo = (uuid && taskUuidMap.get(uuid)) || taskProcessMap.get(taskId) || processThread;
        const identifier = getIdentifierForEventIndex(i);

        const task: TaskInfo = {
          key: `task-${taskKeyCounter++}`,
          fileName,
          task_id: taskId,
          entry: stringPool.intern(entry),
          hash: stringPool.intern((details.hash as string) || ""),
          uuid: stringPool.intern(uuid),
          start_time: stringPool.intern(event.timestamp),
          status: "running",
          nodes: [],
          processId: stringPool.intern(processInfo.processId || ""),
          threadId: stringPool.intern(processInfo.threadId || ""),
          identifier,
          _startEventIndex: i
        };
        tasks.push(task);
        runningTaskMap.set(taskKey, task);
      }
    } else if (message === "Tasker.Task.Succeeded" || message === "Tasker.Task.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) continue;

      const uuid = (details.uuid as string) || "";
      const taskKey = buildTaskKey(taskId, uuid, event.processId);
      let matchedTask = runningTaskMap.get(taskKey) || null;

      if (!matchedTask) {
        matchedTask = tasks.find(
          t => t.task_id === taskId && t.processId === event.processId && !t.end_time && (!uuid || t.uuid === uuid)
        ) || null;
      }

      if (matchedTask) {
        matchedTask.status = message === "Tasker.Task.Succeeded" ? "succeeded" : "failed";
        matchedTask.end_time = stringPool.intern(event.timestamp);
        matchedTask._endEventIndex = i;

        if (matchedTask.start_time && matchedTask.end_time) {
          matchedTask.duration = new Date(matchedTask.end_time).getTime() - new Date(matchedTask.start_time).getTime();
        }
        runningTaskMap.delete(taskKey);
      }
    }
  }

  // 为每个任务构建节点列表
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

function buildTaskNodes(
  task: TaskInfo,
  events: EventNotification[],
  stringPool: StringPool
): NodeInfo[] {
  const nodes: NodeInfo[] = [];
  const nodeIdSet = new Set<number>();
  const startIndex = task._startEventIndex ?? 0;
  const endIndex = task._endEventIndex ?? events.length - 1;
  const taskEvents = events
    .slice(startIndex, endIndex + 1)
    .filter(event => event.processId === task.processId);

  const recognitionAttempts: RecognitionAttempt[] = [];
  let currentNextList: NextListItem[] = [];

  for (const event of taskEvents) {
    const { message, details } = event;
    const eventTaskId = normalizeId(details?.task_id ?? details?.taskId);

    // 处理 NextList 事件
    if (
      (message === "Node.NextList.Starting" || message === "Node.NextList.Succeeded") &&
      eventTaskId === task.task_id &&
      event.processId === task.processId
    ) {
      if (message === "Node.NextList.Starting") {
        const list = Array.isArray(details.list) ? details.list : [];
        currentNextList = list.map((item: Record<string, unknown>) => ({
          name: stringPool.intern((item.name as string) || ""),
          anchor: item.anchor as boolean || false,
          jump_back: item.jump_back as boolean || false
        }));
      }
    }

    // 处理识别事件
    if (
      (message === "Node.Recognition.Succeeded" || message === "Node.Recognition.Failed") &&
      eventTaskId === task.task_id &&
      event.processId === task.processId
    ) {
      recognitionAttempts.push({
        reco_id: normalizeId(details.reco_id) ?? (details.reco_id as number) ?? 0,
        name: stringPool.intern((details.name as string) || (details.node_name as string) || ""),
        timestamp: stringPool.intern(event.timestamp),
        status: message === "Node.Recognition.Succeeded" ? "success" : "failed",
        reco_details: details.reco_details as RecognitionDetail | undefined
      });
    }

    // 处理 Pipeline 节点完成事件
    if (
      (message === "Node.PipelineNode.Succeeded" || message === "Node.PipelineNode.Failed") &&
      eventTaskId === task.task_id &&
      event.processId === task.processId
    ) {
      const nodeId = normalizeId(details.node_id ?? details.nodeId);
      if (typeof nodeId !== "number" || nodeIdSet.has(nodeId)) {
        currentNextList = [];
        recognitionAttempts.length = 0;
        continue;
      }

      nodes.push({
        node_id: nodeId,
        name: stringPool.intern((details.name as string) || ""),
        timestamp: stringPool.intern(event.timestamp),
        status: message === "Node.PipelineNode.Succeeded" ? "success" : "failed",
        task_id: task.task_id,
        reco_details: details.reco_details as RecognitionDetail | undefined,
        action_details: details.action_details as ActionDetail | undefined,
        next_list: currentNextList.map(item => ({
          name: stringPool.intern(item.name),
          anchor: item.anchor,
          jump_back: item.jump_back
        })),
        recognition_attempts: recognitionAttempts.slice()
      });

      nodeIdSet.add(nodeId);
      currentNextList = [];
      recognitionAttempts.length = 0;
    }
  }

  return nodes;
}

export function associateControllersToTasks(tasks: TaskInfo[], controllers: ControllerInfo[]): void {
  if (controllers.length === 0 || tasks.length === 0) return;

  const controllerMap = new Map<string, ControllerInfo>();
  for (const controller of controllers) {
    controllerMap.set(controller.processId, controller);
  }

  for (const task of tasks) {
    const controller = controllerMap.get(task.processId);
    if (controller) {
      task.controllerInfo = controller;
    }
  }
}

export async function parseLogFile(content: string, fileName: string): Promise<ParseResult> {
  const lines = content.split(/\r?\n/);
  const events: EventNotification[] = [];
  const rawLines: { fileName: string; lineNumber: number; line: string }[] = [];
  const controllerInfos: ControllerInfo[] = [];
  const eventIdentifierMap = new Map<number, string>();
  let lastIdentifierForEvent: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    rawLines.push({ fileName, lineNumber, line });

    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const parsed = parseLine(trimmedLine, lineNumber);
    if (!parsed) continue;

    if (trimmedLine.includes("!!!OnEventNotify!!!")) {
      const event = parseEventNotification(parsed, fileName);
      if (event) {
        events.push(event);
        const identifier = extractIdentifierFromLine(trimmedLine);
        if (identifier) lastIdentifierForEvent = identifier;
        if (lastIdentifierForEvent) {
          eventIdentifierMap.set(events.length - 1, lastIdentifierForEvent);
        }
      }
    } else {
      const identifier = extractIdentifierFromLine(trimmedLine);
      if (identifier) lastIdentifierForEvent = identifier;

      const controllerInfo = parseControllerInfo(parsed, fileName);
      if (controllerInfo) {
        controllerInfos.push(controllerInfo);
      }
    }
  }

  const stringPool = new StringPool();
  const identifierRanges = buildIdentifierRanges(eventIdentifierMap, events.length);
  const tasks = buildTasks(events, stringPool, identifierRanges);

  associateControllersToTasks(tasks, controllerInfos);

  stringPool.clear();

  return {
    tasks,
    rawLines,
    auxLogs: [],
    pipelineCustomActions: {},
    controllerInfos
  };
}
