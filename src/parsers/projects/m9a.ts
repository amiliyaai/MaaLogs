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
import {
  parseBracketLine,
  extractIdentifier,
  createEventNotification,
  parseControllerInfo,
} from "../shared";

/**
 * 解析单行 M9A custom 日志
 */
function parseM9aCustomLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  const regex =
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s*\|\s*(\w+)\s*\|\s*([^|]+)\s*\|\s*(.*)$/;
  const match = line.match(regex);

  if (!match) return null;

  const [, timestamp, level, caller, message] = match;

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

/**
 * 从日志行中提取事件通知
 */
function parseM9aEventNotification(
  parsed: ReturnType<typeof parseBracketLine>,
  fileName: string,
  lineNumber: number
): EventNotification | null {
  if (!parsed) return null;

  const { params, functionName } = parsed;

  if (functionName === "MaaNS::MessageNotifier::notify") {
    const msg = params["msg"];
    const details = params["details"] as Record<string, unknown> | undefined;

    if (!msg || typeof msg !== "string") return null;

    if (msg.startsWith("Tasker.")) {
      const entry = details?.entry as string | undefined;
      if (entry && !entry.startsWith("MaaNS::")) {
        return createEventNotification(
          parsed,
          fileName,
          lineNumber,
          msg,
          details || {}
        );
      }
    }
  }

  return null;
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
  detail: unknown;
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
  let detail: unknown = null;

  if (bestResult && typeof bestResult === "object" && bestResult !== null && !Array.isArray(bestResult)) {
    const resultObj = bestResult as Record<string, unknown>;
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
  let detail: unknown = null;

  if (bestResult && typeof bestResult === "object" && bestResult !== null && !Array.isArray(bestResult)) {
    const resultObj = bestResult as Record<string, unknown>;
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
  let detail: unknown = null;

  if (bestResult && typeof bestResult === "object" && bestResult !== null && !Array.isArray(bestResult)) {
    const resultObj = bestResult as Record<string, unknown>;
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
    name = params["name_"] as string;
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

  const details: Record<string, unknown> = {
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

  const match = message.match(/(\d+)ms/);
  const duration = match ? parseInt(match[1]) : 0;

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

    const details: Record<string, unknown> = {
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

/**
 * M9A 项目解析器实例
 */
export const m9aProjectParser: ProjectParser = {
  id: "m9a",
  name: "M9A",
  description: "M9A 项目日志解析器",

  parseMainLog(lines: string[], config): MainLogParseResult {
    let nodeIdCounter = 0;
    let actionIdCounter = 0;

    const events: EventNotification[] = [];
    const controllers: ControllerInfo[] = [];
    const identifierMap = new Map<number, string>();
    let lastIdentifier: string | null = null;

    const taskIdByThread = new Map<string, number>();
    const recoCache = new Map<string, RecognitionCache>();
    const actionContexts = new Map<string, ActionContext>();
    const nodeEventIndexByName = new Map<string, number>();
    let pendingRunRecognition: { curNode: string; nextList: NextListItem[] } | null = null;
    const pendingRecognitionAttempts: RecognitionAttempt[] = [];
    let nestedRecognitionContext: NestedRecognitionContext | null = null;
    const nestedAttemptsByParent = new Map<string, RecognitionAttempt[]>();
    let lastParentNodeName: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const parsed = parseBracketLine(rawLine);
      if (!parsed) continue;

      const event = parseM9aEventNotification(parsed, config.fileName, i + 1);
      if (event) {
        events.push(event);

        const taskId = event.details?.task_id;
        if (typeof taskId === "number") {
          taskIdByThread.set(parsed.threadId, taskId);
        }

        const identifier = extractIdentifier(rawLine);
        if (identifier) {
          lastIdentifier = identifier;
        }
        if (lastIdentifier) {
          identifierMap.set(events.length - 1, lastIdentifier);
        }
        continue;
      }

      const ocrReco = parseOCRerAnalyze(parsed);
      if (ocrReco) {
        recoCache.set(ocrReco.name, ocrReco);
        if (nestedRecognitionContext) {
          // 嵌套识别的 OCRer，不添加到 pendingRecognitionAttempts
        } else if (pendingRunRecognition) {
          const attempt = parseRecognitionAttempt(parsed, recoCache);
          if (attempt) {
            pendingRecognitionAttempts.push(attempt);
          }
        }
        continue;
      }

      const templateReco = parseTemplateMatcherAnalyze(parsed);
      if (templateReco) {
        recoCache.set(templateReco.name, templateReco);
        if (nestedRecognitionContext) {
          // 嵌套识别的 TemplateMatcher，不添加到 pendingRecognitionAttempts
        } else if (pendingRunRecognition) {
          const attempt = parseRecognitionAttempt(parsed, recoCache);
          if (attempt) {
            pendingRecognitionAttempts.push(attempt);
          }
        }
        continue;
      }

      const customReco = parseCustomRecognitionAnalyze(parsed);
      if (customReco) {
        recoCache.set(customReco.name, customReco);
        if (pendingRunRecognition) {
          const attempt = parseRecognitionAttempt(parsed, recoCache);
          if (attempt) {
            // 附加嵌套识别结果
            const nestedAttempts = nestedAttemptsByParent.get(customReco.name);
            if (nestedAttempts && nestedAttempts.length > 0) {
              attempt.nested_nodes = nestedAttempts;
              nestedAttemptsByParent.delete(customReco.name);
            }
            pendingRecognitionAttempts.push(attempt);
          }
        }
        // CustomRecognition 返回结果，清除嵌套上下文
        nestedRecognitionContext = null;
        continue;
      }

      // 检测 CustomRecognition::analyze | enter（没有 best_result_ 的行）
      if (parsed.functionName?.includes("CustomRecognition::analyze")) {
        const name = parsed.params["name_"] as string;
        if (name && !parsed.params["best_result_"]) {
          // 进入 CustomRecognition，设置嵌套上下文
          nestedRecognitionContext = {
            parentRecoName: name,
            entryNode: "",
          };
        }
        continue;
      }

      const contextRunReco = parseContextRunRecognition(parsed);
      if (contextRunReco) {
        if (contextRunReco.isEnter) {
          nestedRecognitionContext = {
            parentRecoName: lastParentNodeName || "",
            entryNode: contextRunReco.entry,
          };
        } else {
          nestedRecognitionContext = null;
        }
        continue;
      }

      const runRecognition = parseRunRecognition(parsed);
      if (runRecognition) {
        if (runRecognition.isEnter) {
          if (nestedRecognitionContext) {
            // 嵌套识别的 run_recognition，跳过主流程处理
            pendingRunRecognition = null;
            pendingRecognitionAttempts.length = 0;
          } else {
            pendingRunRecognition = runRecognition;
            pendingRecognitionAttempts.length = 0;
          }
        } else {
          if (!nestedRecognitionContext) {
            // run_recognition | leave，但没有 node hit
            // 需要将 next_list 和 recognition_attempts 设置到父节点上
            if (pendingRunRecognition && pendingRecognitionAttempts.length > 0) {
              const { curNode, nextList } = pendingRunRecognition;
              const parentEventIndex = nodeEventIndexByName.get(curNode);
              if (parentEventIndex !== undefined && events[parentEventIndex]) {
                const parentEvent = events[parentEventIndex];
                if (parentEvent.details) {
                  if (nextList.length > 0 && !parentEvent.details.next_list) {
                    parentEvent.details.next_list = nextList;
                  }
                  if (!parentEvent.details.recognition_attempts) {
                    parentEvent.details.recognition_attempts = pendingRecognitionAttempts.slice();
                  }
                }
              }
            }
            pendingRunRecognition = null;
            pendingRecognitionAttempts.length = 0;
          }
        }
        continue;
      }

      // 处理 node disabled
      const nodeDisabled = parseNodeDisabled(parsed);
      if (nodeDisabled && pendingRunRecognition) {
        // 添加一个 disabled 状态的识别尝试
        pendingRecognitionAttempts.push({
          reco_id: 0,
          name: nodeDisabled.nodeName,
          timestamp: parsed.timestamp,
          status: "disabled",
        });
        continue;
      }

      const currentTaskId = taskIdByThread.get(parsed.threadId) || 0;

      const nodeHitResult = parseNodeHitLine(parsed, config.fileName, i + 1, currentTaskId, recoCache, nodeIdCounter);
      if (nodeHitResult) {
        nodeIdCounter = nodeHitResult.nodeIdCounter;

        if (nestedRecognitionContext) {
          // 嵌套识别的 node hit，存储到父节点的 nested_nodes
          const nodeName = nodeHitResult.event.details?.name as string;
          const cachedReco = nodeName ? recoCache.get(nodeName) : null;
          const nestedAttempt: RecognitionAttempt = {
            reco_id: cachedReco?.reco_id || 0,
            name: nodeName || "",
            timestamp: nodeHitResult.event.timestamp,
            status: cachedReco?.box ? "success" : "failed",
            reco_details: cachedReco
              ? {
                  name: nodeName || "",
                  reco_id: cachedReco.reco_id,
                  algorithm: cachedReco.algorithm,
                  box: cachedReco.box,
                  detail: cachedReco.detail,
                }
              : undefined,
          };

          // 对于 MaaContextRunRecognition 调用，parentRecoName 为空，使用 lastParentNodeName
          const parentName = nestedRecognitionContext.parentRecoName || lastParentNodeName || "";
          if (parentName) {
            // 直接附加到父节点事件的 recognition_attempts 中最后一个 attempt 的 nested_nodes
            const parentEventIndex = nodeEventIndexByName.get(parentName);
            if (parentEventIndex !== undefined && events[parentEventIndex]) {
              const parentEvent = events[parentEventIndex];
              if (parentEvent.details) {
                // 确保 recognition_attempts 存在
                if (!parentEvent.details.recognition_attempts) {
                  // 创建一个基于父节点的 attempt
                  const parentCachedReco = recoCache.get(parentName);
                  parentEvent.details.recognition_attempts = [{
                    reco_id: parentCachedReco?.reco_id || 0,
                    name: parentName,
                    timestamp: parentEvent.timestamp,
                    status: parentCachedReco?.box ? "success" : "failed",
                    reco_details: parentCachedReco
                      ? {
                          name: parentName,
                          reco_id: parentCachedReco.reco_id,
                          algorithm: parentCachedReco.algorithm,
                          box: parentCachedReco.box,
                          detail: parentCachedReco.detail,
                        }
                      : undefined,
                  }];
                }
                const attempts = parentEvent.details.recognition_attempts as RecognitionAttempt[];
                const lastAttempt = attempts[attempts.length - 1];
                if (lastAttempt) {
                  if (!lastAttempt.nested_nodes) {
                    lastAttempt.nested_nodes = [];
                  }
                  lastAttempt.nested_nodes.push(nestedAttempt);
                }
              }
            }
          } else {
            // 没有父节点名称，存储到 nestedAttemptsByParent
            if (!nestedAttemptsByParent.has(parentName)) {
              nestedAttemptsByParent.set(parentName, []);
            }
            nestedAttemptsByParent.get(parentName)!.push(nestedAttempt);
          }
          continue;
        }

        events.push(nodeHitResult.event);
        const nodeName = nodeHitResult.event.details?.name as string;
        if (nodeName) {
          nodeEventIndexByName.set(nodeName, events.length - 1);
          lastParentNodeName = nodeName;
        }

        if (pendingRunRecognition && nodeHitResult.event.details) {
          const { curNode, nextList } = pendingRunRecognition;
          const eventDetails = nodeHitResult.event.details;

          // 如果 nodeName === curNode 且 nextList 只包含自己，这是 direct_hit，跳过设置
          const isDirectHit = nodeName === curNode && nextList.length === 1 && nextList[0].name === curNode;

          if (!isDirectHit) {
            // 设置当前节点的 next_list
            if (nextList.length > 0) {
              eventDetails.next_list = nextList;
            }

            // 设置当前节点的 recognition_attempts
            if (pendingRecognitionAttempts.length > 0) {
              eventDetails.recognition_attempts = pendingRecognitionAttempts.slice();
            }
          }

          // 如果 nodeName !== curNode，也需要更新父节点的信息
          if (nodeName !== curNode) {
            const parentEventIndex = nodeEventIndexByName.get(curNode);
            if (parentEventIndex !== undefined && events[parentEventIndex]) {
              const parentEvent = events[parentEventIndex];
              if (parentEvent.details) {
                if (nextList.length > 0 && !parentEvent.details.next_list) {
                  parentEvent.details.next_list = nextList;
                }
                if (pendingRecognitionAttempts.length > 0 && !parentEvent.details.recognition_attempts) {
                  parentEvent.details.recognition_attempts = pendingRecognitionAttempts.slice();
                }
              }
            }
          }
          pendingRunRecognition = null;
          pendingRecognitionAttempts.length = 0;
        }

        continue;
      }

      const actuatorRun = parseActuatorRun(parsed);
      if (actuatorRun) {
        const { nodeName, isEnter } = actuatorRun;
        const processId = parsed.processId;

        if (isEnter && nodeName) {
          actionContexts.set(processId, {
            nodeName,
            startTime: parsed.timestamp,
            startLineNumber: i + 1,
            actions: [],
          });
        } else if (!isEnter) {
          const ctx = actionContexts.get(processId);
          if (ctx && ctx.actions.length > 0) {
            const eventIndex = nodeEventIndexByName.get(ctx.nodeName);
            if (eventIndex !== undefined && events[eventIndex]) {
              const nodeEvent = events[eventIndex];
              if (nodeEvent.details) {
                const realActions = ctx.actions.filter((a) => a.action !== "Sleep");
                if (realActions.length > 0) {
                  nodeEvent.details.action_details = realActions[0];
                }
              }
            }
          }
          actionContexts.delete(processId);
        }
        continue;
      }

      const ctx = actionContexts.get(parsed.processId);
      if (ctx) {
        const clickAction = parseMtouchHelperClick(parsed, actionIdCounter + 1);
        if (clickAction) {
          actionIdCounter++;
          ctx.actions.push(clickAction);
          continue;
        }

        const swipeAction = parseMtouchHelperSwipe(parsed, actionIdCounter + 1);
        if (swipeAction) {
          actionIdCounter++;
          ctx.actions.push(swipeAction);
          continue;
        }

        const sleepAction = parseActuatorSleep(parsed, actionIdCounter + 1);
        if (sleepAction) {
          actionIdCounter++;
          ctx.actions.push(sleepAction);
          continue;
        }
      }

      const customActionResult = parseCustomActionRun(parsed, config.fileName, i + 1, actionIdCounter);
      if (customActionResult) {
        actionIdCounter = customActionResult.actionId;
        events.push(customActionResult.event);
        continue;
      }

      const identifier = extractIdentifier(rawLine);
      if (identifier) {
        lastIdentifier = identifier;
      }

      const controller = parseControllerInfo(parsed, config.fileName, i + 1);
      if (controller) {
        controllers.push(controller);
      }
    }

    return { events, controllers, identifierMap };
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
