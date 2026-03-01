/**
 * @fileoverview 基础解析器 - 共享 maa.log 解析逻辑
 *
 * 本文件提供 MaaFramework 5.3 标准日志格式的共享解析逻辑。
 * 所有基于 MaaFramework 的项目（M9A、MaaEnd 等）都使用相同的 maa.log 格式。
 *
 * 功能：
 * - 项目自动检测（基于 Working 目录）
 * - OnEventNotify 事件解析
 * - node disabled 解析
 * - Controller Info 解析
 * - Next List 提取
 * - 嵌套识别处理
 *
 * @module parsers/baseParser
 * @author MaaLogs Team
 * @license MIT
 */

import type {
  EventNotification,
  ControllerInfo,
  NextListItem,
  RecognitionDetail,
  JsonValue,
} from "../types/logTypes";
import {
  parseBracketLine,
  createEventNotification,
  parseControllerInfo,
  type BracketLineResult,
} from "./shared";

/** 项目类型 */
export type ProjectType = "m9a" | "maaend" | "unknown";

/** 主日志解析上下文 */
export interface MainLogParseContext {
  /** 解析出的事件列表 */
  events: EventNotification[];
  /** 控制器信息列表 */
  controllers: ControllerInfo[];
  /** 事件索引到 identifier 的映射 */
  identifierMap: Map<number, string>;
  /** 最后一个 identifier */
  lastIdentifier: string | null;
  /** 检测到的项目类型 */
  detectedProject: ProjectType;
}

/** 创建主日志解析上下文 */
export function createMainLogContext(): MainLogParseContext {
  return {
    events: [],
    controllers: [],
    identifierMap: new Map(),
    lastIdentifier: null,
    detectedProject: "unknown",
  };
}

/**
 * 项目识别模式配置
 *
 * 根据 Working 目录路径匹配项目类型：
 * - M9A: 匹配 "D:/M9A/" 或 "D:\M9A\" 等路径
 * - MaaEnd: 匹配 "MaaEnd-win-x86_64" 等路径
 */
const PROJECT_PATTERNS: { pattern: RegExp; project: ProjectType }[] = [
  { pattern: /M9A[\\/]/i, project: "m9a" },
  { pattern: /MaaEnd/i, project: "maaend" },
];

/**
 * 从单行日志检测项目类型
 *
 * 检查日志行是否包含 "Working" 关键字，并匹配项目路径模式。
 *
 * @param line - 日志行
 * @returns 项目类型，如果无法识别则返回 null
 *
 * @example
 * detectProjectFromLine('[Logger] Working D:/M9A') // 'm9a'
 * detectProjectFromLine('[Logger] Working C:/MaaEnd-win-x86_64') // 'maaend'
 */
export function detectProjectFromLine(line: string): ProjectType | null {
  if (!line.includes("Working")) return null;

  for (const { pattern, project } of PROJECT_PATTERNS) {
    if (pattern.test(line)) {
      return project;
    }
  }
  return null;
}

/**
 * 从日志行数组检测项目类型
 *
 * 扫描前 100 行日志，寻找 "Working" 行来识别项目。
 *
 * @param lines - 日志行数组
 * @returns 项目类型，如果无法识别则返回 "unknown"
 */
export function detectProject(lines: string[]): ProjectType {
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const project = detectProjectFromLine(lines[i]);
    if (project) {
      return project;
    }
  }
  return "unknown";
}

/** 类型守卫：判断是否为对象类型 JsonValue */
function isRecordJsonValue(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 辅助函数：安全转换为字符串 */
function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * 解析 OnEventNotify 事件
 *
 * MaaFramework 5.3+ 使用 !!!OnEventNotify!!! 标记事件通知。
 *
 * 日志格式：
 * [时间戳][级别][进程ID][线程ID][EventDispatcher.hpp] !!!OnEventNotify!!! [handle=xxx] [msg=Node.PipelineNode.Succeeded] [details={...}]
 *
 * @param parsed - 解析后的日志行
 * @param fileName - 文件名
 * @param lineNumber - 行号
 * @returns 事件通知对象，如果不是 OnEventNotify 则返回 null
 */
export function parseOnEventNotify(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): EventNotification | null {
  if (!parsed) return null;

  const { message, params } = parsed;

  if (!message.includes("!!!OnEventNotify!!!")) return null;

  const msg = asString(params["msg"]);
  const detailsValue = params["details"];
  if (!msg) return null;

  return createEventNotification(
    parsed,
    fileName,
    lineNumber,
    msg,
    isRecordJsonValue(detailsValue) ? detailsValue : {}
  );
}

/**
 * 解析 node disabled 事件
 *
 * 当节点被禁用时，MaaFramework 会记录 node disabled 日志。
 *
 * 日志格式：
 * [时间戳][级别][进程ID][线程ID][TaskBase.cpp] node disabled NodeName [data.enabled=false]
 *
 * @param parsed - 解析后的日志行
 * @param fileName - 文件名
 * @param lineNumber - 行号
 * @returns 事件通知对象，如果不是 node disabled 则返回 null
 */
export function parseNodeDisabled(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): EventNotification | null {
  if (!parsed) return null;

  const { functionName, message, params } = parsed;

  if (!functionName?.includes("TaskBase::run_recognition")) return null;

  if (!message.includes("node disabled")) return null;

  const match = message.match(/node disabled\s+(\S+)/);
  if (!match) return null;

  const nodeName = match[1];
  const enabled = params["data.enabled"];

  const details: Record<string, JsonValue> = {
    name: nodeName,
    enabled: enabled ?? false,
  };

  return createEventNotification(parsed, fileName, lineNumber, "Node.Disabled", details);
}

/**
 * 解析 Next List 事件
 *
 * 当节点执行 next 列表时触发。
 *
 * 日志格式：
 * !!!OnEventNotify!!! [msg=Node.NextList.Starting] [details={"list":[{"name":"NodeA"},...]}]
 *
 * @param parsed - 解析后的日志行
 * @param fileName - 文件名
 * @param lineNumber - 行号
 * @returns 包含事件和 next 列表的对象，如果不是 NextList 事件则返回 null
 */
export function parseNextListEvent(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): { event: EventNotification; nextList: NextListItem[] } | null {
  if (!parsed) return null;

  const event = parseOnEventNotify(parsed, fileName, lineNumber);
  if (!event) return null;

  const msg = event.message;
  if (!msg.startsWith("Node.NextList.")) return null;

  const details = event.details;
  const listValue = details?.list;

  if (!Array.isArray(listValue)) return null;

  const nextList: NextListItem[] = listValue.map((item) => {
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

  return { event, nextList };
}

/**
 * 解析嵌套识别节点事件
 *
 * 当执行嵌套识别（RecognitionNode）时触发。
 *
 * 日志格式：
 * !!!OnEventNotify!!! [msg=Node.RecognitionNode.Starting] [details={"name":"NodeName",...}]
 *
 * @param parsed - 解析后的日志行
 * @param fileName - 文件名
 * @param lineNumber - 行号
 * @returns 事件通知对象，如果不是 RecognitionNode 事件则返回 null
 */
export function parseRecognitionNodeEvent(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): EventNotification | null {
  if (!parsed) return null;

  const event = parseOnEventNotify(parsed, fileName, lineNumber);
  if (!event) return null;

  const msg = event.message;
  if (!msg.startsWith("Node.RecognitionNode.")) return null;

  return event;
}

/**
 * 解析 Pipeline 节点识别事件
 *
 * 当 Pipeline 节点完成识别时触发。
 *
 * 日志格式：
 * !!!OnEventNotify!!! [msg=Node.PipelineNode.Succeeded] [details={"name":"NodeName","reco_details":{...}}]
 *
 * @param parsed - 解析后的日志行
 * @param fileName - 文件名
 * @param lineNumber - 行号
 * @returns 事件通知对象，如果不是 PipelineNode 事件则返回 null
 */
export function parseNodeRecognitionEvent(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): EventNotification | null {
  if (!parsed) return null;

  const event = parseOnEventNotify(parsed, fileName, lineNumber);
  if (!event) return null;

  const msg = event.message;
  if (!msg.startsWith("Node.PipelineNode.")) return null;

  return event;
}

/**
 * 从事件中提取识别详情
 *
 * @param event - 事件通知对象
 * @returns 识别详情，如果无法提取则返回 null
 */
export function extractRecoDetailsFromEvent(event: EventNotification): RecognitionDetail | null {
  const details = event.details;
  if (!details) return null;

  const recoDetails = details.reco_details;
  if (!recoDetails || typeof recoDetails !== "object") return null;

  const reco = recoDetails as Record<string, JsonValue>;
  const box = reco.box;

  let parsedBox: [number, number, number, number] | null = null;
  if (Array.isArray(box) && box.length === 4) {
    const [x, y, w, h] = box;
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      typeof w === "number" &&
      typeof h === "number"
    ) {
      parsedBox = [x, y, w, h];
    }
  }

  return {
    name: asString(reco.name) || "",
    reco_id: typeof reco.reco_id === "number" ? reco.reco_id : 0,
    algorithm: asString(reco.algorithm) || "Unknown",
    box: parsedBox,
    detail: reco.detail || null,
  };
}

/**
 * 处理单行主日志
 *
 * 按优先级处理：
 * 1. 项目检测
 * 2. OnEventNotify 事件
 * 3. node disabled 事件
 * 4. Controller Info
 * 5. identifier 更新
 *
 * @param context - 解析上下文
 * @param rawLine - 原始日志行
 * @param parsed - 解析后的日志行
 * @param fileName - 文件名
 * @param lineNumber - 行号
 */
export function handleMainLogLine(
  context: MainLogParseContext,
  rawLine: string,
  parsed: BracketLineResult | null,
  fileName: string,
  lineNumber: number
): void {
  if (context.detectedProject === "unknown") {
    const project = detectProjectFromLine(rawLine);
    if (project) {
      context.detectedProject = project;
    }
  }

  if (!parsed) {
    updateIdentifier(context, rawLine);
    return;
  }

  const event = parseOnEventNotify(parsed, fileName, lineNumber);
  if (event) {
    context.events.push(event);
    updateIdentifier(context, rawLine);
    if (context.lastIdentifier) {
      context.identifierMap.set(context.events.length - 1, context.lastIdentifier);
    }
    return;
  }

  const disabledEvent = parseNodeDisabled(parsed, fileName, lineNumber);
  if (disabledEvent) {
    context.events.push(disabledEvent);
    updateIdentifier(context, rawLine);
    return;
  }

  updateIdentifier(context, rawLine);

  const controller = parseControllerInfo(parsed, fileName, lineNumber);
  if (controller) {
    context.controllers.push(controller);
  }
}

/** 从日志行中提取并更新 identifier */
function updateIdentifier(context: MainLogParseContext, rawLine: string): void {
  const match = rawLine.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  if (match) {
    context.lastIdentifier = match[1];
  }
}

/**
 * 解析主日志文件（共享入口）
 *
 * 所有项目解析器的 parseMainLog 方法都应调用此函数。
 *
 * @param lines - 日志行数组
 * @param fileName - 文件名
 * @returns 解析上下文，包含事件、控制器信息和检测到的项目类型
 */
export function parseMainLogBase(lines: string[], fileName: string): MainLogParseContext {
  const context = createMainLogContext();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const parsed = parseBracketLine(rawLine);
    handleMainLogLine(context, rawLine, parsed, fileName, i + 1);
  }

  if (context.detectedProject === "unknown") {
    context.detectedProject = detectProject(lines);
  }

  return context;
}
