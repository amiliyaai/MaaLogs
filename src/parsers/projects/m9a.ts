/**
 * @fileoverview M9A 项目解析器
 *
 * 本文件实现了 M9A 项目 (https://github.com/MAA1999/M9A) 的完整日志解析逻辑。
 * M9A 使用 Loguru 日志库，其日志格式具有特定的结构。
 *
 * 支持的日志格式：
 * - maa.log: 方括号格式，事件通知使用 MaaNS::MessageNotifier::notify
 * - custom 日志: 管道符格式，YYYY-MM-DD HH:MM:SS.mmm | LEVEL | caller | message
 *
 * @module parsers/projects/m9a
 * @author MaaLogs Team
 * @license MIT
 */

import type {
  EventNotification,
  ControllerInfo,
  AuxLogEntry,
  RecognitionDetail,
  ActionDetail,
  NextListItem,
  RecognitionAttempt,
  ProjectParser,
  MainLogParseResult,
  AuxLogParserConfig,
  AuxLogParseResult,
  AuxLogParserInfo,
} from "../../types/parserTypes";
import type { JsonValue } from "../../types/logTypes";
import {
  parseBracketLine,
  extractIdentifier,
  createEventNotification,
  parseControllerInfo,
} from "../shared";

function isRecordJsonValue(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 解析单行 M9A custom 日志
 */
function parseM9aCustomLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  const parts = splitCustomLine(line);
  if (!parts) return null;
  const { timestamp, level, caller, message } = parts;

  const callerParts = caller.trim().split(":");
  const callerInfo = callerParts.length >= 2 ? caller.trim() : undefined;

  const identifierMatch = message.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  const identifier = identifierMatch ? identifierMatch[1] : undefined;

  const taskIdMatch = message.match(/\[task_id[=_](\d+)\]/i);
  const task_id = taskIdMatch ? parseInt(taskIdMatch[1]) : undefined;

  const entryMatch = message.match(/\[entry[=_]([^\]]+)\]/i);
  const entry = entryMatch ? entryMatch[1] : undefined;

  const timestampMs = Date.parse(timestamp.replace(" ", "T"));

  return {
    key: `${fileName}-${lineNumber}`,
    source: "m9a",
    timestamp,
    timestampMs: Number.isNaN(timestampMs) ? undefined : timestampMs,
    level: level.toUpperCase(),
    message: message.trim(),
    identifier,
    task_id,
    entry,
    caller: callerInfo,
    fileName,
    lineNumber,
  };
}

function splitCustomLine(
  line: string
): { timestamp: string; level: string; caller: string; message: string } | null {
  const first = line.indexOf("|");
  if (first === -1) return null;
  const second = line.indexOf("|", first + 1);
  if (second === -1) return null;
  const third = line.indexOf("|", second + 1);
  if (third === -1) return null;
  const timestamp = line.slice(0, first).trim();
  const level = line.slice(first + 1, second).trim();
  const caller = line.slice(second + 1, third).trim();
  const message = line.slice(third + 1).trim();
  if (!timestamp || !level || !caller) return null;
  return { timestamp, level, caller, message };
}

/**
 * 从日志行中提取事件通知
 */
function parseM9aEventNotification(
  parsed: ReturnType<typeof parseBracketLine>,
  fileName: string,
  lineNumber: number
): EventNotification | null {
  if (!parsed) return null;
  const taskerEvent = getTaskerEvent(parsed);
  if (!taskerEvent) return null;
  return createEventNotification(parsed, fileName, lineNumber, taskerEvent.msg, taskerEvent.details);
}

function getTaskerEvent(
  parsed: ReturnType<typeof parseBracketLine>
): { msg: string; details: Record<string, JsonValue> } | null {
  if (!parsed) return null;
  const { params, functionName } = parsed;
  if (functionName !== "MaaNS::MessageNotifier::notify") return null;
  const msg = typeof params["msg"] === "string" ? params["msg"] : undefined;
  if (!msg || !msg.startsWith("Tasker.")) return null;
  const detailsValue = params["details"];
  const details = isRecordJsonValue(detailsValue) ? detailsValue : undefined;
  const entry = typeof details?.entry === "string" ? details.entry : undefined;
  if (!entry || entry.startsWith("MaaNS::")) return null;
  return { msg, details: details || {} };
}

/**
 * 解析 box 字符串格式 "[W x H from (X, Y)]"
 */
function parseBoxString(boxStr: unknown): [number, number, number, number] | null {
  if (typeof boxStr !== "string") return null;

  const match = boxStr.match(/\[(\d+)\s*x\s*(\d+)\s*from\s*\((\d+),\s*(\d+)\)\]/);
  if (!match) return null;

  const [, w, h, x, y] = match;
  return [parseInt(x), parseInt(y), parseInt(w), parseInt(h)];
}

/**
 * 解析 JSON 格式的 box 数组 [x, y, w, h]
 */
function parseBoxArray(box: unknown): [number, number, number, number] | null {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const [x, y, w, h] = box;
  if (typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number") return null;
  return [x, y, w, h];
}

/**
 * 识别结果缓存
 * 用于存储 OCRer::analyze 和 TemplateMatcher::analyze 的结果，供 node hit 使用
 */
interface RecognitionCache {
  name: string;
  reco_id: number;
  algorithm: string;
  box: [number, number, number, number] | null;
  detail: JsonValue;
  timestamp: string;
}

/**
 * 动作执行上下文
 * 用于跟踪当前正在执行的动作及其详情
 */
interface ActionContext {
  nodeName: string;
  startTime: string;
  startLineNumber: number;
  actions: ActionDetail[];
}

/**
 * 嵌套识别上下文
 * 用于跟踪 CustomRecognition 内部的嵌套识别调用
 */
interface NestedRecognitionContext {
  parentRecoName: string;
  entryNode: string;
}

/**
 * 解析 OCRer::analyze 行
 *
 * M9A 日志格式：
 * [MaaNS::VisionNS::OCRer::analyze] Alarm_End [uid_=300000001] [all_results_=[...]] [best_result_={...}] [cost=403ms] ...
 */
function parseOCRerAnalyze(
  parsed: ReturnType<typeof parseBracketLine>
): RecognitionCache | null {
  if (!parsed) return null;

  const { functionName, params, message, timestamp } = parsed;

  if (!functionName?.includes("OCRer::analyze")) return null;

  const name = message.trim().split(/\s+/)[0];
  if (!name) return null;

  const uid = params["uid_"];
  if (typeof uid !== "number") return null;

  const bestResult = params["best_result_"];
  let box: [number, number, number, number] | null = null;
  let detail: JsonValue = null;

  if (bestResult && typeof bestResult === "object" && !Array.isArray(bestResult)) {
    const resultObj = bestResult as Record<string, JsonValue>;
    box = parseBoxArray(resultObj.box);
    detail = bestResult;
  }

  return {
    name,
    reco_id: uid,
    algorithm: "OCR",
    box,
    detail,
    timestamp,
  };
}

/**
 * 解析 TemplateMatcher::analyze 行
 *
 * M9A 日志格式：
 * [MaaNS::VisionNS::TemplateMatcher::analyze] Alarm_Complete [uid_=300000188] [best_result_={...}] ...
 */
function parseTemplateMatcherAnalyze(
  parsed: ReturnType<typeof parseBracketLine>
): RecognitionCache | null {
  if (!parsed) return null;

  const { functionName, params, message, timestamp } = parsed;

  if (!functionName?.includes("TemplateMatcher::analyze")) return null;

  const name = message.trim().split(/\s+/)[0];
  if (!name) return null;

  const uid = params["uid_"];
  if (typeof uid !== "number") return null;

  const bestResult = params["best_result_"];
  let box: [number, number, number, number] | null = null;
  let detail: JsonValue = null;

  if (bestResult && typeof bestResult === "object" && !Array.isArray(bestResult)) {
    const resultObj = bestResult as Record<string, JsonValue>;
    box = parseBoxArray(resultObj.box);
    detail = bestResult;
  }

  return {
    name,
    reco_id: uid,
    algorithm: "TemplateMatch",
    box,
    detail,
    timestamp,
  };
}

/**
 * 解析 CustomRecognition::analyze 行
 *
 * M9A 日志格式：
 * [MaaNS::TaskNS::CustomRecognition::analyze] [name_=Alarm_FindStage] [uid_=300000008] [best_result_={...}] ...
 */
function parseCustomRecognitionAnalyze(
  parsed: ReturnType<typeof parseBracketLine>
): RecognitionCache | null {
  if (!parsed) return null;

  const { functionName, params, timestamp } = parsed;

  if (!functionName?.includes("CustomRecognition::analyze")) return null;

  const name = params["name_"];
  if (typeof name !== "string") return null;

  const uid = params["uid_"];
  if (typeof uid !== "number") return null;

  const bestResult = params["best_result_"];
  let box: [number, number, number, number] | null = null;
  let detail: JsonValue = null;

  if (bestResult && typeof bestResult === "object" && !Array.isArray(bestResult)) {
    const resultObj = bestResult as Record<string, JsonValue>;
    box = parseBoxArray(resultObj.box);
    detail = bestResult;
  }

  return {
    name,
    reco_id: uid,
    algorithm: "Custom",
    box,
    detail,
    timestamp,
  };
}

/**
 * 从 OCRer/TemplateMatcher/CustomRecognition analyze 行提取识别尝试
 *
 * M9A 日志格式：
 * [TemplateMatcher::analyze] Alarm_Complete [uid_=300000003] [best_result_=nullopt] ...
 * [OCRer::analyze] Alarm_StageFlag [uid_=300000004] [best_result_={...}] ...
 * [CustomRecognition::analyze] [name_=Alarm_FindStage] [uid_=300000008] [best_result_={...}] ...
 */
function parseRecognitionAttempt(
  parsed: ReturnType<typeof parseBracketLine>,
  recoCache: Map<string, RecognitionCache>
): RecognitionAttempt | null {
  if (!parsed) return null;

  const { functionName, message, params, timestamp } = parsed;

  const isOCR = functionName?.includes("OCRer::analyze");
  const isTemplate = functionName?.includes("TemplateMatcher::analyze");
  const isCustom = functionName?.includes("CustomRecognition::analyze");

  if (!isOCR && !isTemplate && !isCustom) return null;

  let name: string;
  if (isCustom) {
    const nameValue = params["name_"];
    if (typeof nameValue !== "string") return null;
    name = nameValue;
  } else {
    name = message.trim().split(/\s+/)[0];
  }
  if (!name) return null;

  const cachedReco = recoCache.get(name);
  if (!cachedReco) return null;

  const status = cachedReco.box ? "success" : "failed";

  return {
    reco_id: cachedReco.reco_id,
    name,
    timestamp,
    status,
    reco_details: {
      name,
      reco_id: cachedReco.reco_id,
      algorithm: cachedReco.algorithm,
      box: cachedReco.box,
      detail: cachedReco.detail,
    },
  };
}

/**
 * 从 node hit 行提取节点信息并转换为虚拟事件
 *
 * M9A 日志格式：
 * node hit [result.name=TheAlarm] [result.box=[0 x 0 from (0, 0)]]
 */
function parseNodeHitLine(
  parsed: ReturnType<typeof parseBracketLine>,
  fileName: string,
  lineNumber: number,
  currentTaskId: number,
  recoCache: Map<string, RecognitionCache>,
  nodeIdCounter: number
): { event: EventNotification; nodeIdCounter: number } | null {
  if (!parsed) return null;

  const { message, params } = parsed;

  if (message !== "node hit") return null;

  const nodeName = params["result.name"];
  if (typeof nodeName !== "string") return null;

  const boxStr = params["result.box"];
  const box = parseBoxString(boxStr);

  const newCounter = nodeIdCounter + 1;

  const cachedReco = recoCache.get(nodeName);

  const recoDetails: RecognitionDetail = {
    name: nodeName,
    box: cachedReco?.box || box,
    algorithm: cachedReco?.algorithm || "Unknown",
    detail: cachedReco?.detail || null,
    reco_id: cachedReco?.reco_id || newCounter,
  };

  const details: Record<string, JsonValue> = {
    name: nodeName,
    node_id: newCounter,
    task_id: currentTaskId,
    reco_details: recoDetails,
  };

  return {
    event: createEventNotification(parsed, fileName, lineNumber, "Node.PipelineNode.Succeeded", details),
    nodeIdCounter: newCounter,
  };
}

/**
 * 解析 Actuator::run 行，检测动作开始/结束
 *
 * M9A 日志格式：
 * [MaaNS::TaskNS::Actuator::run] [pipeline_data.name=TheAlarm] | enter
 * [MaaNS::TaskNS::Actuator::run] | leave, 701ms
 */
function parseActuatorRun(
  parsed: ReturnType<typeof parseBracketLine>
): { nodeName: string | null; isEnter: boolean } | null {
  if (!parsed) return null;

  const { functionName, params, status } = parsed;

  if (!functionName?.includes("Actuator::run")) return null;

  const nodeName = params["pipeline_data.name"];
  if (typeof nodeName !== "string" && status !== "leave") return null;

  return {
    nodeName: typeof nodeName === "string" ? nodeName : null,
    isEnter: status === "enter",
  };
}

/**
 * 解析 TaskBase::run_recognition 行，提取 cur_node 和 next_list
 *
 * M9A 日志格式：
 * [TaskBase::run_recognition] [cur_node_=Alarm_Find0/3] [list=["Alarm_Select","Alarm_Complete","Alarm_StageFlag"]] | enter
 * [TaskBase::run_recognition] | leave, 443ms
 */
function parseRunRecognition(
  parsed: ReturnType<typeof parseBracketLine>
): { curNode: string; nextList: NextListItem[]; isEnter: boolean } | null {
  if (!parsed) return null;

  const { functionName, params, status } = parsed;

  if (!functionName?.includes("TaskBase::run_recognition")) return null;

  if (status === "leave") {
    return { curNode: "", nextList: [], isEnter: false };
  }

  const curNode = params["cur_node_"];
  if (typeof curNode !== "string") return null;

  const listParam = params["list"];
  let nextList: NextListItem[] = [];

  if (Array.isArray(listParam)) {
    nextList = listParam.map((item) => {
      if (typeof item === "string") {
        return { name: item, anchor: false, jump_back: false };
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        return {
          name: String(obj.name || ""),
          anchor: Boolean(obj.anchor),
          jump_back: Boolean(obj.jump_back),
        };
      }
      return { name: String(item), anchor: false, jump_back: false };
    });
  }

  return { curNode, nextList, isEnter: true };
}

/**
 * 解析 node disabled 行
 *
 * M9A 日志格式：
 * [TaskBase.cpp][L101][MaaNS::TaskNS::TaskBase::run_recognition] node disabled Alarm_Select [pipeline_data.enable=false]
 */
function parseNodeDisabled(
  parsed: ReturnType<typeof parseBracketLine>
): { nodeName: string } | null {
  if (!parsed) return null;

  const { functionName, message } = parsed;

  if (!functionName?.includes("TaskBase::run_recognition")) return null;

  if (!message.includes("node disabled")) return null;

  const match = message.match(/node disabled\s+(\S+)/);
  if (!match) return null;

  return { nodeName: match[1] };
}

function parseContextRunRecognition(
  parsed: ReturnType<typeof parseBracketLine>
): { entry: string; isEnter: boolean } | null {
  if (!parsed) return null;

  const { functionName, params, status } = parsed;

  if (!functionName?.includes("MaaContextRunRecognition")) return null;

  if (status === "leave") {
    return { entry: "", isEnter: false };
  }

  const entry = params["entry"] as string;
  if (!entry) return null;

  return { entry, isEnter: true };
}

/**
 * 解析 MtouchHelper::click 行
 *
 * M9A 日志格式：
 * [MaaNS::CtrlUnitNs::MtouchHelper::click] [x=1799] [y=842] [touch_x=238] [touch_y=1799]
 */
function parseMtouchHelperClick(
  parsed: ReturnType<typeof parseBracketLine>,
  actionId: number
): ActionDetail | null {
  if (!parsed) return null;

  const { functionName, params, status } = parsed;

  if (!functionName?.includes("MtouchHelper::click")) return null;
  if (status === "leave") return null;

  const x = params["x"];
  const y = params["y"];

  const boxX = typeof x === "number" ? x : parseInt(String(x)) || 0;
  const boxY = typeof y === "number" ? y : parseInt(String(y)) || 0;

  return {
    action_id: actionId,
    action: "Click",
    box: [boxX, boxY, 0, 0],
    detail: {
      touch_x: params["touch_x"],
      touch_y: params["touch_y"],
    },
    name: "Click",
    success: true,
  };
}

/**
 * 解析 MtouchHelper::swipe 行
 */
function parseMtouchHelperSwipe(
  parsed: ReturnType<typeof parseBracketLine>,
  actionId: number
): ActionDetail | null {
  if (!parsed) return null;

  const { functionName, params, status } = parsed;

  if (!functionName?.includes("MtouchHelper::swipe")) return null;
  if (status === "leave") return null;

  return {
    action_id: actionId,
    action: "Swipe",
    box: [0, 0, 0, 0],
    detail: {
      x: params["x"],
      y: params["y"],
      touch_x: params["touch_x"],
      touch_y: params["touch_y"],
    },
    name: "Swipe",
    success: true,
  };
}

/**
 * 解析 Actuator::sleep 行
 *
 * M9A 日志格式：
 * [MaaNS::TaskNS::Actuator::sleep] 200ms | enter
 */
function parseActuatorSleep(
  parsed: ReturnType<typeof parseBracketLine>,
  actionId: number
): ActionDetail | null {
  if (!parsed) return null;

  const { functionName, message, status } = parsed;

  if (!functionName?.includes("Actuator::sleep")) return null;
  if (status === "leave") return null;

  const duration = parseDurationMs(message);

  return {
    action_id: actionId,
    action: "Sleep",
    box: [0, 0, 0, 0],
    detail: {
      duration,
    },
    name: "Sleep",
    success: true,
  };
}

function parseDurationMs(message: string): number {
  const msIndex = message.indexOf("ms");
  if (msIndex === -1) return 0;
  let index = msIndex - 1;
  let digits = "";
  while (index >= 0 && message[index] >= "0" && message[index] <= "9") {
    digits = message[index] + digits;
    index -= 1;
  }
  if (!digits) return 0;
  return parseInt(digits);
}

/**
 * 解析自定义动作执行
 *
 * M9A 日志格式：
 * [MaaNS::TaskNS::CustomAction::run]
 * [context.task_id()=100000002] [node_name=SummonlngSuccess]
 * [param.name=SummonlngSwipe] [param.custom_param=null]
 * [reco_id=300000046] [rect=[119 x 89 from (283, 300)]]
 */
function parseCustomActionRun(
  parsed: ReturnType<typeof parseBracketLine>,
  fileName: string,
  lineNumber: number,
  actionId: number
): { event: EventNotification; actionId: number } | null {
  if (!parsed) return null;

  const { functionName, params, status } = parsed;

  if (!functionName?.includes("CustomAction::run")) return null;

  const nodeName = params["node_name"];
  const actionName = params["param.name"];
  const customParam = params["param.custom_param"];
  const rectStr = params["rect"];

  if (status === "enter") {
    const rect = parseBoxString(rectStr);

    const details: Record<string, JsonValue> = {
      name: nodeName,
      action_name: actionName,
      custom_param: customParam === "null" ? null : customParam,
      rect: rect,
    };

    return {
      event: createEventNotification(parsed, fileName, lineNumber, "CustomAction.Starting", details),
      actionId: actionId + 1,
    };
  }

  return null;
}

type ParseContext = {
  events: EventNotification[];
  controllers: ControllerInfo[];
  identifierMap: Map<number, string>;
  lastIdentifier: string | null;
  taskIdByThread: Map<string, number>;
  recoCache: Map<string, RecognitionCache>;
  actionContexts: Map<string, ActionContext>;
  nodeEventIndexByName: Map<string, number>;
  pendingRunRecognition: { curNode: string; nextList: NextListItem[] } | null;
  pendingRecognitionAttempts: RecognitionAttempt[];
  nestedRecognitionContext: NestedRecognitionContext | null;
  nestedAttemptsByParent: Map<string, RecognitionAttempt[]>;
  lastParentNodeName: string | null;
  nodeIdCounter: number;
  actionIdCounter: number;
};

function createParseContext(): ParseContext {
  return {
    events: [],
    controllers: [],
    identifierMap: new Map(),
    lastIdentifier: null,
    taskIdByThread: new Map(),
    recoCache: new Map(),
    actionContexts: new Map(),
    nodeEventIndexByName: new Map(),
    pendingRunRecognition: null,
    pendingRecognitionAttempts: [],
    nestedRecognitionContext: null,
    nestedAttemptsByParent: new Map(),
    lastParentNodeName: null,
    nodeIdCounter: 0,
    actionIdCounter: 0,
  };
}

function handleEventNotification(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>,
  rawLine: string,
  fileName: string,
  lineNumber: number
): boolean {
  if (!parsed) return false;
  const event = parseM9aEventNotification(parsed, fileName, lineNumber);
  if (!event) return false;
  context.events.push(event);

  const taskId = event.details?.task_id;
  if (typeof taskId === "number") {
    context.taskIdByThread.set(parsed.threadId, taskId);
  }

  const identifier = extractIdentifier(rawLine);
  if (identifier) {
    context.lastIdentifier = identifier;
  }
  if (context.lastIdentifier) {
    context.identifierMap.set(context.events.length - 1, context.lastIdentifier);
  }
  return true;
}

function handleRecognitionAnalyze(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>,
  analyzer: (parsed: ReturnType<typeof parseBracketLine>) => RecognitionCache | null
): boolean {
  const reco = analyzer(parsed);
  if (!reco) return false;
  context.recoCache.set(reco.name, reco);
  if (!context.nestedRecognitionContext && context.pendingRunRecognition) {
    const attempt = parseRecognitionAttempt(parsed, context.recoCache);
    if (attempt) {
      context.pendingRecognitionAttempts.push(attempt);
    }
  }
  return true;
}

function handleCustomRecognitionAnalyze(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>
): boolean {
  const customReco = parseCustomRecognitionAnalyze(parsed);
  if (!customReco) return false;
  context.recoCache.set(customReco.name, customReco);
  if (context.pendingRunRecognition) {
    const attempt = parseRecognitionAttempt(parsed, context.recoCache);
    if (attempt) {
      const nestedAttempts = context.nestedAttemptsByParent.get(customReco.name);
      if (nestedAttempts && nestedAttempts.length > 0) {
        attempt.nested_nodes = nestedAttempts;
        context.nestedAttemptsByParent.delete(customReco.name);
      }
      context.pendingRecognitionAttempts.push(attempt);
    }
  }
  context.nestedRecognitionContext = null;
  return true;
}

function handleCustomRecognitionEnter(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>
): boolean {
  if (!parsed || !parsed.functionName?.includes("CustomRecognition::analyze")) return false;
  const name = parsed.params["name_"] as string;
  if (name && !parsed.params["best_result_"]) {
    context.nestedRecognitionContext = {
      parentRecoName: name,
      entryNode: "",
    };
  }
  return true;
}

function handleContextRunRecognition(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>
): boolean {
  const contextRunReco = parseContextRunRecognition(parsed);
  if (!contextRunReco) return false;
  if (contextRunReco.isEnter) {
    context.nestedRecognitionContext = {
      parentRecoName: context.lastParentNodeName || "",
      entryNode: contextRunReco.entry,
    };
  } else {
    context.nestedRecognitionContext = null;
  }
  return true;
}

function applyPendingRunRecognition(context: ParseContext): void {
  const pending = context.pendingRunRecognition;
  if (!pending || context.pendingRecognitionAttempts.length === 0) return;
  const parentEventIndex = context.nodeEventIndexByName.get(pending.curNode);
  if (parentEventIndex === undefined) return;
  const parentEvent = context.events[parentEventIndex];
  if (!parentEvent?.details) return;
  if (pending.nextList.length > 0 && !parentEvent.details.next_list) {
    parentEvent.details.next_list = pending.nextList;
  }
  if (!parentEvent.details.recognition_attempts) {
    parentEvent.details.recognition_attempts = context.pendingRecognitionAttempts.slice();
  }
}

function handleRunRecognition(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>
): boolean {
  const runRecognition = parseRunRecognition(parsed);
  if (!runRecognition) return false;
  if (runRecognition.isEnter) {
    if (context.nestedRecognitionContext) {
      context.pendingRunRecognition = null;
      context.pendingRecognitionAttempts.length = 0;
    } else {
      context.pendingRunRecognition = runRecognition;
      context.pendingRecognitionAttempts.length = 0;
    }
  } else if (!context.nestedRecognitionContext) {
    applyPendingRunRecognition(context);
    context.pendingRunRecognition = null;
    context.pendingRecognitionAttempts.length = 0;
  }
  return true;
}

function handleNodeDisabled(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>
): boolean {
  if (!parsed) return false;
  const nodeDisabled = parseNodeDisabled(parsed);
  if (!nodeDisabled || !context.pendingRunRecognition) return false;
  context.pendingRecognitionAttempts.push({
    reco_id: 0,
    name: nodeDisabled.nodeName,
    timestamp: parsed.timestamp,
    status: "disabled",
  });
  return true;
}

function buildRecoDetails(
  nodeName: string,
  cachedReco: RecognitionCache
): RecognitionDetail {
  return {
    name: nodeName,
    reco_id: cachedReco.reco_id,
    algorithm: cachedReco.algorithm,
    box: cachedReco.box,
    detail: cachedReco.detail,
  };
}

function buildNestedAttempt(
  nodeName: string,
  event: EventNotification,
  cachedReco: RecognitionCache | null
): RecognitionAttempt {
  return {
    reco_id: cachedReco?.reco_id || 0,
    name: nodeName || "",
    timestamp: event.timestamp,
    status: cachedReco?.box ? "success" : "failed",
    reco_details: cachedReco ? buildRecoDetails(nodeName, cachedReco) : undefined,
  };
}

function ensureParentAttempts(
  context: ParseContext,
  parentName: string,
  parentEvent: EventNotification
): RecognitionAttempt[] {
  if (!parentEvent.details) return [];
  if (!parentEvent.details.recognition_attempts) {
    const parentCachedReco = context.recoCache.get(parentName);
    const parentAttempt: Record<string, JsonValue> = {
      reco_id: parentCachedReco?.reco_id || 0,
      name: parentName,
      timestamp: parentEvent.timestamp,
      status: parentCachedReco?.box ? "success" : "failed",
    };
    if (parentCachedReco) {
      parentAttempt.reco_details = buildRecoDetails(parentName, parentCachedReco);
    }
    parentEvent.details.recognition_attempts = [parentAttempt];
  }
  return parentEvent.details.recognition_attempts as RecognitionAttempt[];
}

function attachNestedAttempt(
  context: ParseContext,
  nestedAttempt: RecognitionAttempt,
  parentName: string
): void {
  if (tryAttachNestedToParent(context, parentName, nestedAttempt)) return;
  queueNestedAttempt(context, parentName, nestedAttempt);
}

function getParentEvent(context: ParseContext, parentName: string): EventNotification | null {
  if (!parentName) return null;
  const parentEventIndex = context.nodeEventIndexByName.get(parentName);
  if (parentEventIndex === undefined) return null;
  const parentEvent = context.events[parentEventIndex];
  if (!parentEvent?.details) return null;
  return parentEvent;
}

function tryAttachNestedToParent(
  context: ParseContext,
  parentName: string,
  nestedAttempt: RecognitionAttempt
): boolean {
  const parentEvent = getParentEvent(context, parentName);
  if (!parentEvent) return false;
  const attempts = ensureParentAttempts(context, parentName, parentEvent);
  const lastAttempt = attempts[attempts.length - 1];
  if (!lastAttempt) return false;
  if (!lastAttempt.nested_nodes) {
    lastAttempt.nested_nodes = [];
  }
  lastAttempt.nested_nodes.push(nestedAttempt);
  return true;
}

function queueNestedAttempt(
  context: ParseContext,
  parentName: string,
  nestedAttempt: RecognitionAttempt
): void {
  if (!context.nestedAttemptsByParent.has(parentName)) {
    context.nestedAttemptsByParent.set(parentName, []);
  }
  context.nestedAttemptsByParent.get(parentName)!.push(nestedAttempt);
}

function handleNestedNodeHit(
  context: ParseContext,
  nodeHitResult: { event: EventNotification; nodeIdCounter: number }
): void {
  const nodeName = nodeHitResult.event.details?.name as string;
  const cachedReco = nodeName ? context.recoCache.get(nodeName) : null;
  const nestedAttempt = buildNestedAttempt(nodeName || "", nodeHitResult.event, cachedReco || null);
  const parentName =
    context.nestedRecognitionContext?.parentRecoName || context.lastParentNodeName || "";
  attachNestedAttempt(context, nestedAttempt, parentName);
}

function applyPendingToParent(
  context: ParseContext,
  parentName: string,
  nextList: NextListItem[]
): void {
  const parentEventIndex = context.nodeEventIndexByName.get(parentName);
  if (parentEventIndex === undefined) return;
  const parentEvent = context.events[parentEventIndex];
  if (!parentEvent?.details) return;
  if (nextList.length > 0 && !parentEvent.details.next_list) {
    parentEvent.details.next_list = nextList;
  }
  if (context.pendingRecognitionAttempts.length > 0 && !parentEvent.details.recognition_attempts) {
    parentEvent.details.recognition_attempts = context.pendingRecognitionAttempts.slice();
  }
}

function handleMainNodeHit(
  context: ParseContext,
  nodeHitResult: { event: EventNotification; nodeIdCounter: number }
): void {
  context.events.push(nodeHitResult.event);
  const nodeName = nodeHitResult.event.details?.name as string;
  if (nodeName) {
    context.nodeEventIndexByName.set(nodeName, context.events.length - 1);
    context.lastParentNodeName = nodeName;
  }

  if (context.pendingRunRecognition && nodeHitResult.event.details) {
    const { curNode, nextList } = context.pendingRunRecognition;
    const eventDetails = nodeHitResult.event.details;
    const isDirectHit =
      nodeName === curNode && nextList.length === 1 && nextList[0].name === curNode;

    if (!isDirectHit) {
      if (nextList.length > 0) {
        eventDetails.next_list = nextList;
      }
      if (context.pendingRecognitionAttempts.length > 0) {
        eventDetails.recognition_attempts = context.pendingRecognitionAttempts.slice();
      }
    }

    if (nodeName !== curNode) {
      applyPendingToParent(context, curNode, nextList);
    }
    context.pendingRunRecognition = null;
    context.pendingRecognitionAttempts.length = 0;
  }
}

function handleNodeHit(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>,
  fileName: string,
  lineNumber: number
): boolean {
  if (!parsed) return false;
  const currentTaskId = context.taskIdByThread.get(parsed.threadId) || 0;
  const nodeHitResult = parseNodeHitLine(
    parsed,
    fileName,
    lineNumber,
    currentTaskId,
    context.recoCache,
    context.nodeIdCounter
  );
  if (!nodeHitResult) return false;
  context.nodeIdCounter = nodeHitResult.nodeIdCounter;
  if (context.nestedRecognitionContext) {
    handleNestedNodeHit(context, nodeHitResult);
  } else {
    handleMainNodeHit(context, nodeHitResult);
  }
  return true;
}

function handleActuatorRun(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>,
  lineNumber: number
): boolean {
  if (!parsed) return false;
  const actuatorRun = parseActuatorRun(parsed);
  if (!actuatorRun) return false;
  const { nodeName, isEnter } = actuatorRun;
  const processId = parsed.processId;

  if (isEnter && nodeName) {
    startActionContext(context, processId, nodeName, parsed.timestamp, lineNumber);
  } else if (!isEnter) {
    finalizeActionContext(context, processId);
  }
  return true;
}

function startActionContext(
  context: ParseContext,
  processId: string,
  nodeName: string,
  timestamp: string,
  lineNumber: number
): void {
  context.actionContexts.set(processId, {
    nodeName,
    startTime: timestamp,
    startLineNumber: lineNumber,
    actions: [],
  });
}

function finalizeActionContext(context: ParseContext, processId: string): void {
  const ctx = context.actionContexts.get(processId);
  if (!ctx) {
    context.actionContexts.delete(processId);
    return;
  }
  if (ctx.actions.length > 0) {
    const eventIndex = context.nodeEventIndexByName.get(ctx.nodeName);
    if (eventIndex !== undefined && context.events[eventIndex]) {
      const nodeEvent = context.events[eventIndex];
      if (nodeEvent.details) {
        const realActions = ctx.actions.filter((a) => a.action !== "Sleep");
        if (realActions.length > 0) {
          nodeEvent.details.action_details = realActions[0];
        }
      }
    }
  }
  context.actionContexts.delete(processId);
}

function parseActionFromParsed(
  parsed: ReturnType<typeof parseBracketLine>,
  actionId: number
): ActionDetail | null {
  return (
    parseMtouchHelperClick(parsed, actionId) ||
    parseMtouchHelperSwipe(parsed, actionId) ||
    parseActuatorSleep(parsed, actionId)
  );
}

function handleActionDetails(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>
): boolean {
  if (!parsed) return false;
  const ctx = context.actionContexts.get(parsed.processId);
  if (!ctx) return false;
  const action = parseActionFromParsed(parsed, context.actionIdCounter + 1);
  if (!action) return false;
  context.actionIdCounter += 1;
  ctx.actions.push(action);
  return true;
}

function handleCustomAction(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>,
  fileName: string,
  lineNumber: number
): boolean {
  const customActionResult = parseCustomActionRun(
    parsed,
    fileName,
    lineNumber,
    context.actionIdCounter
  );
  if (!customActionResult) return false;
  context.actionIdCounter = customActionResult.actionId;
  context.events.push(customActionResult.event);
  return true;
}

function handleIdentifierAndController(
  context: ParseContext,
  rawLine: string,
  parsed: ReturnType<typeof parseBracketLine>,
  fileName: string,
  lineNumber: number
): void {
  const identifier = extractIdentifier(rawLine);
  if (identifier) {
    context.lastIdentifier = identifier;
  }
  if (parsed) {
    const controller = parseControllerInfo(parsed, fileName, lineNumber);
    if (controller) {
      context.controllers.push(controller);
    }
  }
}

type LineHandler = (
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>,
  rawLine: string,
  fileName: string,
  lineNumber: number
) => boolean;

const lineHandlers: LineHandler[] = [
  (context, parsed, rawLine, fileName, lineNumber) =>
    handleEventNotification(context, parsed, rawLine, fileName, lineNumber),
  (context, parsed) => handleRecognitionAnalyze(context, parsed, parseOCRerAnalyze),
  (context, parsed) => handleRecognitionAnalyze(context, parsed, parseTemplateMatcherAnalyze),
  (context, parsed) => handleCustomRecognitionAnalyze(context, parsed),
  (context, parsed) => handleCustomRecognitionEnter(context, parsed),
  (context, parsed) => handleContextRunRecognition(context, parsed),
  (context, parsed) => handleRunRecognition(context, parsed),
  (context, parsed) => handleNodeDisabled(context, parsed),
  (context, parsed, _rawLine, fileName, lineNumber) =>
    handleNodeHit(context, parsed, fileName, lineNumber),
  (context, parsed, _rawLine, _fileName, lineNumber) =>
    handleActuatorRun(context, parsed, lineNumber),
  (context, parsed) => handleActionDetails(context, parsed),
  (context, parsed, _rawLine, fileName, lineNumber) =>
    handleCustomAction(context, parsed, fileName, lineNumber),
];

function handleLine(
  context: ParseContext,
  parsed: ReturnType<typeof parseBracketLine>,
  rawLine: string,
  fileName: string,
  lineNumber: number
): boolean {
  for (const handler of lineHandlers) {
    if (handler(context, parsed, rawLine, fileName, lineNumber)) return true;
  }
  return false;
}

/**
 * M9A 项目解析器实例
 */
export const m9aProjectParser: ProjectParser = {
  id: "m9a",
  name: "M9A",
  description: "M9A 项目日志解析器",

  parseMainLog(lines: string[], config): MainLogParseResult {
    const context = createParseContext();

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;
      const parsed = parseBracketLine(rawLine);
      if (!parsed) continue;
      const lineNumber = i + 1;

      if (!handleLine(context, parsed, rawLine, config.fileName, lineNumber)) {
        handleIdentifierAndController(context, rawLine, parsed, config.fileName, lineNumber);
      }
    }

    return {
      events: context.events,
      controllers: context.controllers,
      identifierMap: context.identifierMap,
    };
  },

  parseAuxLog(lines: string[], config: AuxLogParserConfig): AuxLogParseResult {
    const entries: AuxLogEntry[] = [];
    const { fileName } = config;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) continue;

      const entry = parseM9aCustomLine(line, i + 1, fileName);
      if (entry) {
        entries.push(entry);
      }
    }

    return { entries };
  },

  getAuxLogParserInfo(): AuxLogParserInfo {
    return {
      id: "m9a",
      name: "M9A 解析器",
      description: "解析 M9A 项目日志文件",
    };
  },
};
