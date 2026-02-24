/**
 * @fileoverview 日志解析工具函数
 *
 * 本文件提供日志解析的核心功能，包括：
 * - maa.log 行解析
 * - 事件通知提取
 * - 任务和节点构建
 * - Pipeline 配置解析
 * - 节点统计计算
 *
 * @module utils/parse
 * @author MaaLogs Team
 * @license MIT
 */

import type { LogLine, EventNotification, ActionDetail, NodeInfo, TaskInfo, RecognitionAttempt, ActionAttempt, NextListItem, ControllerInfo, AdbScreencapMethod, AdbInputMethod, Win32ScreencapMethod, Win32InputMethod } from "../types/logTypes";
import { createLogger } from "./logger";

const logger = createLogger("Parse");

/**
 * ADB 截图方式 Bitmask 映射
 *
 * 用于将日志中的数字 bitmask 转换为可读的截图方式名称。
 *
 * @see https://github.com/MaaXYZ/MaaFramework/blob/main/include/MaaFramework/MaaDef.h
 */
const ADB_SCREENCAP_METHOD_MAP: Record<number, AdbScreencapMethod> = {
  1: "EncodeToFileAndPull",
  2: "Encode",
  4: "RawWithGzip",
  8: "RawByNetcat",
  16: "MinicapDirect",
  32: "MinicapStream",
  64: "EmulatorExtras"
};

/**
 * ADB 输入方式 Bitmask 映射
 *
 * 用于将日志中的数字 bitmask 转换为可读的输入方式名称。
 *
 * @see https://github.com/MaaXYZ/MaaFramework/blob/main/include/MaaFramework/MaaDef.h
 */
const ADB_INPUT_METHOD_MAP: Record<number, AdbInputMethod> = {
  1: "AdbShell",
  2: "MinitouchAndAdbKey",
  4: "Maatouch",
  8: "EmulatorExtras"
};

/**
 * Win32 截图方式映射
 *
 * 用于将日志中的数字值转换为可读的截图方式名称。
 *
 * @see https://github.com/MaaXYZ/MaaFramework/blob/main/include/MaaFramework/MaaDef.h
 */
const WIN32_SCREENCAP_METHOD_MAP: Record<number, Win32ScreencapMethod> = {
  1: "GDI",
  2: "FramePool",
  4: "DXGI_DesktopDup",
  8: "DXGI_DesktopDup_Window",
  16: "PrintWindow",
  32: "ScreenDC"
};

/**
 * Win32 输入方式映射
 *
 * 用于将日志中的数字值转换为可读的输入方式名称。
 *
 * @see https://github.com/MaaXYZ/MaaFramework/blob/main/include/MaaFramework/MaaDef.h
 */
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

/**
 * 解析 ADB 截图方式 bitmask
 *
 * 将 bitmask 数字转换为截图方式名称数组。
 *
 * @param {number} bitmask - 截图方式 bitmask
 * @returns {AdbScreencapMethod[]} 截图方式名称数组
 *
 * @example
 * parseAdbScreencapMethods(64); // ['ADB']
 * parseAdbScreencapMethods(64 | 512); // ['ADB', 'MuMuPlayer12']
 */
export function parseAdbScreencapMethods(bitmask: number): AdbScreencapMethod[] {
  const methods: AdbScreencapMethod[] = [];
  for (const [bit, name] of Object.entries(ADB_SCREENCAP_METHOD_MAP)) {
    if ((bitmask & parseInt(bit)) !== 0) {
      methods.push(name);
    }
  }
  return methods.length > 0 ? methods : ["Unknown"];
}

/**
 * 解析 ADB 输入方式 bitmask
 *
 * 将 bitmask 数字转换为输入方式名称数组。
 *
 * @param {number} bitmask - 输入方式 bitmask
 * @returns {AdbInputMethod[]} 输入方式名称数组
 *
 * @example
 * parseAdbInputMethods(16); // ['EmulatorExtras']
 * parseAdbInputMethods(1 | 2); // ['AdbShell', 'MaaTouch']
 */
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

/**
 * 解析 Win32 截图方式值
 *
 * 将数字值转换为截图方式名称。
 *
 * @param {number} value - 截图方式值
 * @returns {Win32ScreencapMethod} 截图方式名称
 *
 * @example
 * parseWin32ScreencapMethod(1); // 'FramePool'
 * parseWin32ScreencapMethod(2); // 'PrintWindow'
 */
export function parseWin32ScreencapMethod(value: number): Win32ScreencapMethod {
  return WIN32_SCREENCAP_METHOD_MAP[value] || "Unknown";
}

/**
 * 解析 Win32 输入方式值
 *
 * 将数字值转换为输入方式名称。
 *
 * @param {number} value - 输入方式值
 * @returns {Win32InputMethod} 输入方式名称
 *
 * @example
 * parseWin32InputMethod(1); // 'PostMessage'
 * parseWin32InputMethod(4); // 'Seize'
 */
export function parseWin32InputMethod(value: number): Win32InputMethod {
  return WIN32_INPUT_METHOD_MAP[value] || "Unknown";
}

/**
 * 从日志行解析控制器信息
 *
 * 解析 MaaAdbControllerCreate 或 MaaWin32ControllerCreate 日志行，
 * 提取控制器配置信息。
 *
 * 支持的日志格式：
 * - ADB: [MaaAdbControllerCreate] [adb_path=...] [address=...] [screencap_methods=...] [input_methods=...] [config=...] [agent_path=...] | enter
 * - Win32: [MaaWin32ControllerCreate] [hWnd=...] [screencap_method=...] [mouse_method=...] [keyboard_method=...] | enter
 *
 * @param {LogLine} parsed - 已解析的日志行
 * @param {string} fileName - 文件名
 * @returns {ControllerInfo | null} 控制器信息或 null（非控制器创建日志）
 *
 * @example
 * const logLine = parseLine('[...][MaaAdbControllerCreate] [adb_path=...] ...', 1);
 * parseControllerInfo(logLine, 'maa.log');
 * // 返回 ControllerInfo 对象
 */
export function parseControllerInfo(parsed: LogLine, fileName: string): ControllerInfo | null {
  const { functionName, params, timestamp, status, processId } = parsed;
  
  if (functionName !== "MaaAdbControllerCreate" && functionName !== "MaaWin32ControllerCreate") {
    return null;
  }

  if (status !== "enter") {
    return null;
  }

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

/**
 * 从日志行数组中提取所有控制器信息
 *
 * 遍历日志行，提取所有控制器创建事件。
 * 通常一个日志文件中只有一个控制器，但可能有多个（如切换设备）。
 *
 * @param {LogLine[]} lines - 已解析的日志行数组
 * @param {string} fileName - 文件名
 * @returns {ControllerInfo[]} 控制器信息数组
 *
 * @example
 * const controllers = extractControllerInfos(logLines, 'maa.log');
 * console.log(controllers[0].type); // 'adb' 或 'win32'
 */
export function extractControllerInfos(lines: LogLine[], fileName: string): ControllerInfo[] {
  const controllers: ControllerInfo[] = [];
  for (const line of lines) {
    const info = parseControllerInfo(line, fileName);
    if (info) {
      controllers.push(info);
    }
  }
  if (controllers.length > 0) {
    logger.info("提取控制器信息", {
      fileName,
      count: controllers.length,
      types: controllers.map(c => ({ type: c.type, processId: c.processId }))
    });
  }
  return controllers;
}

/**
 * 关联控制器信息到任务
 *
 * 根据进程 ID 将控制器信息关联到对应的任务。
 * 控制器和任务在同一进程中创建，直接通过进程 ID 匹配。
 *
 * @param {TaskInfo[]} tasks - 任务列表
 * @param {ControllerInfo[]} controllers - 控制器信息列表
 *
 * @example
 * associateControllersToTasks(tasks, controllers);
 * console.log(tasks[0].controllerInfo); // 关联的控制器信息
 */
export function associateControllersToTasks(tasks: TaskInfo[], controllers: ControllerInfo[]): void {
  if (controllers.length === 0 || tasks.length === 0) {
    return;
  }

  // 建立 processId -> ControllerInfo 的映射
  const controllerMap = new Map<string, ControllerInfo>();
  for (const controller of controllers) {
    controllerMap.set(controller.processId, controller);
  }

  // 为每个任务匹配同进程的控制器
  let matchedCount = 0;
  for (const task of tasks) {
    const controller = controllerMap.get(task.processId);
    if (controller) {
      task.controllerInfo = controller;
      matchedCount++;
    }
  }
  logger.debug("控制器关联完成", {
    totalTasks: tasks.length,
    totalControllers: controllers.length,
    matchedTasks: matchedCount
  });
}

/**
 * 字符串池（String Interning）
 *
 * 用于减少重复字符串带来的内存占用。
 * 当多个对象使用相同的字符串值时，共享同一个引用。
 * 这在处理大量日志数据时特别有效，因为很多字符串（如节点名、时间戳格式）会重复出现。
 *
 * @example
 * const pool = new StringPool();
 * const s1 = pool.intern('Hello');
 * const s2 = pool.intern('Hello');
 * console.log(s1 === s2); // true（同一个引用）
 */
export class StringPool {
  /**
   * 内部存储池，键和值都是同一个字符串引用
   */
  private pool = new Map<string, string>();

  /**
   * 获取或添加字符串到池中
   *
   * 如果字符串已存在于池中，返回池中的引用；
   * 否则将字符串添加到池中并返回。
   *
   * @param {string | undefined | null} value - 原始字符串
   * @returns {string} 池中的字符串引用，如果输入为空则返回空字符串
   *
   * @example
   * const pool = new StringPool();
   * pool.intern('test'); // 添加并返回 'test'
   * pool.intern(null); // 返回 ''
   */
  intern(value: string | undefined | null): string {
    if (value === undefined || value === null) return "";
    if (!this.pool.has(value)) {
      this.pool.set(value, value);
    }
    return this.pool.get(value)!;
  }

  /**
   * 清空字符串池
   *
   * 释放所有存储的字符串引用。
   * 通常在解析完成后调用以释放内存。
   */
  clear(): void {
    this.pool.clear();
  }
}

/**
 * 将字符串解析为更合理的类型
 *
 * 尝试将字符串值转换为更具体的类型：
 * - JSON 对象/数组 -> 解析后的对象
 * - "true"/"false" -> 布尔值
 * - 整数字符串 -> 数字
 * - 浮点数字符串 -> 数字
 * - 引号包裹的字符串 -> 去除引号
 *
 * @param {string} value - 原始文本
 * @returns {unknown} 解析后的值
 *
 * @example
 * parseValue('{"key": "value"}'); // { key: 'value' }
 * parseValue('true'); // true
 * parseValue('123'); // 123
 * parseValue('"hello"'); // 'hello'
 */
export function parseValue(value: string): unknown {
  // 尝试解析 JSON
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  // 布尔值
  if (value === "true") return true;
  if (value === "false") return false;
  // 大整数（超过 JavaScript 安全整数范围）
  if (/^\d+$/.test(value) && value.length > 15) {
    return BigInt(value);
  }
  // 整数
  if (/^-?\d+$/.test(value)) return parseInt(value);
  // 浮点数
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  // 去除引号
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * 规范化数字 ID
 *
 * 将各种形式的 ID 值转换为数字类型。
 * 支持数字和字符串数字。
 *
 * @param {unknown} value - 原始值
 * @returns {number | undefined} 数字 ID 或 undefined
 *
 * @example
 * normalizeId(123); // 123
 * normalizeId('456'); // 456
 * normalizeId('abc'); // undefined
 */
export function normalizeId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return undefined;
}

/**
 * 解析日志时间戳为毫秒时间
 *
 * 尝试将时间戳字符串转换为毫秒级 Unix 时间戳。
 * 支持多种常见格式，包括带空格和逗秒分隔符的格式。
 *
 * @param {string} [value] - 时间戳字符串
 * @returns {number | null} 毫秒时间戳或 null（解析失败）
 *
 * @example
 * parseTimestampToMs('2024-01-15 10:30:45.123'); // 毫秒时间戳
 * parseTimestampToMs('invalid'); // null
 */
export function parseTimestampToMs(value?: string): number | null {
  if (!value) return null;
  // 直接解析
  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) return direct;
  // 尝试规范化格式
  const normalized = value.replace(" ", "T").replace(",", ".");
  const fallback = Date.parse(normalized);
  if (!Number.isNaN(fallback)) return fallback;
  return null;
}

/**
 * 从日志行中提取 identifier（Agent Server 会话标识）
 *
 * identifier 是 MaaAgentServer 的会话标识符，用于关联日志与任务。
 * 通常出现在 MaaAgentServerStartUp 或 AgentServer::start_up 日志中。
 *
 * 格式：[identifier=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx] 或 [identifier_xxxx...]
 *
 * @param {string} line - 日志行内容
 * @returns {string | null} identifier（UUID 格式）或 null
 *
 * @example
 * extractIdentifierFromLine('[identifier=abc123-def456-...] Task started');
 * // 返回 'abc123-def456-...'
 */
export function extractIdentifierFromLine(line: string): string | null {
  const match = line.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  return match ? match[1] : null;
}

/**
 * 根据事件索引与 identifier 的映射，构建 identifier 的生效范围
 *
 * identifier 在日志中可能出现多次，每次代表一个新的会话。
 * 此函数将连续相同 identifier 的事件合并为一个范围，
 * 用于确定每个事件属于哪个会话。
 *
 * @param {Map<number, string>} eventIdentifierMap - 事件索引到 identifier 的映射
 * @param {number} totalEvents - 事件总数
 * @returns {{identifier: string, startIndex: number, endIndex: number}[]} identifier 范围数组
 *
 * @example
 * const map = new Map([[0, 'id1'], [5, 'id2']]);
 * buildIdentifierRanges(map, 10);
 * // 返回 [{ identifier: 'id1', startIndex: 0, endIndex: 4 }, { identifier: 'id2', startIndex: 5, endIndex: 9 }]
 */
export function buildIdentifierRanges(
  eventIdentifierMap: Map<number, string>,
  totalEvents: number
): { identifier: string; startIndex: number; endIndex: number }[] {
  const ranges: { identifier: string; startIndex: number; endIndex: number }[] = [];
  const sortedEntries = [...eventIdentifierMap.entries()].sort((a, b) => a[0] - b[0]);
  if (sortedEntries.length === 0) return ranges;

  let currentIdentifier = sortedEntries[0][1];
  let currentStart = sortedEntries[0][0];

  // 遍历所有条目，合并连续相同的 identifier
  for (let i = 1; i < sortedEntries.length; i++) {
    const [eventIndex, identifier] = sortedEntries[i];
    if (identifier !== currentIdentifier) {
      ranges.push({
        identifier: currentIdentifier,
        startIndex: currentStart,
        endIndex: eventIndex - 1
      });
      currentIdentifier = identifier;
      currentStart = eventIndex;
    }
  }

  // 添加最后一个范围
  ranges.push({
    identifier: currentIdentifier,
    startIndex: currentStart,
    endIndex: totalEvents - 1
  });

  return ranges;
}

/**
 * 解析日志行中的消息、参数、状态与耗时
 *
 * Maa 日志消息中包含方括号包裹的键值对参数，以及可选的状态标记。
 * 此函数提取这些信息并返回结构化数据。
 *
 * 支持的格式：
 * - [key=value] 键值对
 * - [flag] 布尔标记
 * - | enter 或 | leave,XXXms 状态和耗时
 *
 * @param {string} message - 日志消息文本
 * @returns {{message: string, params: Record<string, unknown>, status?: 'enter' | 'leave', duration?: number}} 解析结果
 *
 * @example
 * parseMessageAndParams('Task started [task_id=1] | enter,100ms');
 * // 返回 { message: 'Task started', params: { task_id: 1 }, status: 'enter', duration: 100 }
 */
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

  // 提取方括号中的参数（支持嵌套）
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

  // 解析键值对参数
  for (const param of extractedParams) {
    const kvMatch = param.match(/^([^=]+)=(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      params[key.trim()] = parseValue(value.trim());
    } else {
      params[param.trim()] = true;
    }
  }

  // 清理消息中的参数标记
  let cleanMessage = message;
  for (const param of extractedParams) {
    cleanMessage = cleanMessage.replace(`[${param}]`, "");
  }
  cleanMessage = cleanMessage.trim();

  // 提取状态和耗时
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
 * 解析 maa.log 单行结构
 *
 * Maa 日志格式为方括号分隔的结构化文本：
 * [timestamp][level][processId][threadId][sourceFile?][lineNumber?][functionName?] message [params...]
 *
 * @param {string} line - 原始行内容
 * @param {number} lineNum - 行号
 * @returns {LogLine | null} 解析后的日志对象或 null（格式不匹配）
 *
 * @example
 * parseLine('[2024-01-15 10:30:45.123][INF][P1][T2] Task started', 1);
 * // 返回 LogLine 对象
 */
export function parseLine(line: string, lineNum: number): LogLine | null {
  // 匹配方括号分隔的日志格式
  const regex = /^\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?(?:\[([^\]]+)\])?(?:\[([^\]]+)\])?\s*(.*)$/;
  const match = line.match(regex);
  if (!match) return null;

  const [, timestamp, level, processId, threadId, part1, part2, part3, rest] = match;
  let sourceFile: string | undefined;
  let lineNumber: string | undefined;
  let functionName: string | undefined;
  const message = rest;

  // 解析可选的源码位置信息
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
 * 从日志行中提取 OnEventNotify 事件
 *
 * OnEventNotify 是 Maa 框架发出的事件通知，包含任务生命周期和节点执行信息。
 * 这些事件是构建任务列表的核心数据源。
 *
 * @param {LogLine} parsed - 已解析的日志行
 * @param {string} fileName - 文件名
 * @returns {EventNotification | null} 事件对象或 null（非事件日志）
 *
 * @example
 * const logLine = parseLine('[...][!!!OnEventNotify!!!][msg=Tasker.Task.Starting][details={...}]', 1);
 * parseEventNotification(logLine, 'maa.log');
 * // 返回 EventNotification 对象
 */
export function parseEventNotification(parsed: LogLine, fileName: string): EventNotification | null {
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
 * 从动作详情中提取 Custom Action 名称
 *
 * Custom Action 是用户自定义的动作类型，在日志中以特定格式记录。
 * 此函数从动作详情中提取自定义动作的名称。
 *
 * @param {ActionDetail} [details] - 动作详情
 * @returns {string | null} Custom Action 名称或 null
 *
 * @example
 * extractCustomActionFromActionDetails({
 *   action: 'Custom',
 *   detail: { custom_action: 'MyAction' }
 * });
 * // 返回 'MyAction'
 */
export function extractCustomActionFromActionDetails(details?: ActionDetail): string | null {
  if (!details || details.action !== "Custom") return null;
  const detail = details.detail as Record<string, unknown> | undefined;
  if (!detail || typeof detail !== "object") return null;

  // 尝试多种可能的属性名
  const custom =
    (detail as Record<string, unknown>).custom_action ||
    (detail as Record<string, unknown>).customAction ||
    ((detail as Record<string, unknown>).param as Record<string, unknown>)?.custom_action ||
    ((detail as Record<string, unknown>).param as Record<string, unknown>)?.customAction;

  return typeof custom === "string" ? custom : null;
}

/**
 * 从 pipeline 节点提取 Custom Action 名称
 *
 * 从 Pipeline JSON 配置的节点定义中提取 Custom Action。
 * 支持多种配置格式。
 *
 * @param {unknown} node - pipeline 节点对象
 * @returns {string | null} Custom Action 名称或 null
 *
 * @example
 * extractCustomActionFromPipeline({
 *   action: { type: 'Custom', custom_action: 'MyAction' }
 * });
 * // 返回 'MyAction'
 */
export function extractCustomActionFromPipeline(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;

  const nodeObj = node as Record<string, unknown>;
  const action = nodeObj.action;
  const actionType =
    typeof action === "string"
      ? action
      : typeof action === "object"
        ? (action as Record<string, unknown>).type || (action as Record<string, unknown>).action
        : null;

  if (actionType !== "Custom") return null;

  if (action && typeof action === "object") {
    const actionObj = action as Record<string, unknown>;
    const custom =
      actionObj.custom_action ||
      actionObj.customAction ||
      (actionObj.param as Record<string, unknown>)?.custom_action ||
      (actionObj.param as Record<string, unknown>)?.customAction;
    if (typeof custom === "string") return custom;
  }

  const fallback = nodeObj.custom_action || nodeObj.customAction;
  return typeof fallback === "string" ? fallback : null;
}

/**
 * 从 pipeline 节点提取关键词
 *
 * 提取节点名称、ROI 区域等关键词，用于日志关联匹配。
 *
 * @param {unknown} node - pipeline 节点对象
 * @returns {string[]} 关键词数组
 *
 * @example
 * extractPipelineKeywords({
 *   name: 'StartButton',
 *   roi: [100, 200, 50, 80]
 * });
 * // 返回 ['pipeline:StartButton', 'roi:100,200,50,80']
 */
export function extractPipelineKeywords(node: unknown): string[] {
  const keywords: string[] = [];
  if (!node || typeof node !== "object") return keywords;

  const nodeObj = node as Record<string, unknown>;
  const name = nodeObj.name;
  if (typeof name === "string") {
    keywords.push(`pipeline:${name}`);
  }

  // 提取 ROI 区域
  const roiKeys = ["roi", "ROI", "roi_target", "ROITarget"];
  for (const key of roiKeys) {
    const roi = nodeObj[key];
    if (Array.isArray(roi) && roi.length >= 4) {
      keywords.push(`roi:${roi.join(",")}`);
    }
  }

  // 递归提取子节点关键词
  for (const [key, value] of Object.entries(nodeObj)) {
    if (key.endsWith("_ROI") || key.includes("_ROI_")) {
      keywords.push(`pipeline:${key}`);
    }
    if (typeof value === "object" && value !== null) {
      const subKeywords = extractPipelineKeywords(value);
      keywords.push(...subKeywords);
    }
  }

  return keywords;
}

/**
 * 解析 pipeline 配置并提取 Custom Action
 *
 * 读取 Pipeline JSON 配置文件内容，提取所有节点中定义的 Custom Action。
 *
 * @param {string} content - 配置文件内容
 * @param {string} fileName - 文件名
 * @returns {{actions: Record<string, {name: string, fileName: string}[]>, keywords: Record<string, string[]>}} 节点名与 Custom Action 的映射
 *
 * @example
 * const result = parsePipelineCustomActions('{"Node1": {"action": "Custom", "custom_action": "Action1"}}', 'pipeline.json');
 * console.log(result.actions['Node1']); // [{ name: 'Action1', fileName: 'pipeline.json' }]
 */
export function parsePipelineCustomActions(
  content: string,
  fileName: string
): {
  actions: Record<string, { name: string; fileName: string }[]>;
  keywords: Record<string, string[]>;
} {
  try {
    const data = JSON.parse(content);
    if (!data || typeof data !== "object") return { actions: {}, keywords: {} };

    const actions: Record<string, { name: string; fileName: string }[]> = {};
    const keywords: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(data)) {
      const customAction = extractCustomActionFromPipeline(value);
      if (customAction) {
        if (!actions[key]) actions[key] = [];
        actions[key].push({ name: customAction, fileName });
      }

      const pipelineKeywords = extractPipelineKeywords(value);
      if (pipelineKeywords.length > 0) {
        keywords[key] = pipelineKeywords;
      }
    }

    return { actions, keywords };
  } catch {
    return { actions: {}, keywords: {} };
  }
}

/**
 * 根据事件通知构建任务列表，并补齐任务生命周期信息
 *
 * 这是日志解析的核心函数，将原始事件流转换为结构化的任务列表。
 * 处理流程：
 * 1. 遍历所有事件，识别任务开始/成功/失败事件
 * 2. 为每个任务收集节点信息
 * 3. 关联 identifier 会话信息
 *
 * @param {EventNotification[]} events - 事件通知列表
 * @param {StringPool} stringPool - 字符串池（用于内存优化）
 * @param {{identifier: string, startIndex: number, endIndex: number}[]} [identifierRanges=[]] - identifier 与其生效范围的映射
 * @returns {TaskInfo[]} 任务列表
 *
 * @example
 * const tasks = buildTasks(events, stringPool, identifierRanges);
 * console.log(tasks[0].entry); // 'MainTask'
 */
export function buildTasks(
  events: EventNotification[],
  stringPool: StringPool,
  identifierRanges: { identifier: string; startIndex: number; endIndex: number }[] = []
): TaskInfo[] {
  const tasks: TaskInfo[] = [];
  const runningTaskMap = new Map<string, TaskInfo>();
  const taskProcessMap = new Map<number, { processId: string; threadId: string }>();
  const taskUuidMap = new Map<string, { processId: string; threadId: string }>();
  const firstSeenIndexMap = new Map<number, number>();
  let taskKeyCounter = 0;

  /**
   * 构建任务唯一标识键
   */
  const buildTaskKey = (taskId: number, uuid: string, processId: string) =>
    `${processId || "proc"}:${uuid || "uuid"}:${taskId}`;

  /**
   * 根据事件索引获取对应的 identifier
   */
  const getIdentifierForEventIndex = (index: number): string | undefined => {
    for (const range of identifierRanges) {
      if (index >= range.startIndex && index <= range.endIndex) {
        return range.identifier;
      }
    }
    return undefined;
  };

  // 遍历所有事件
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const { message, details, fileName } = event;
    const eventTaskId = normalizeId(details?.task_id ?? details?.taskId);
    const processThread = { processId: event.processId, threadId: event.threadId };

    // 记录任务 ID 与进程/线程的映射
    if (eventTaskId !== undefined) {
      taskProcessMap.set(eventTaskId, processThread);
      if (!firstSeenIndexMap.has(eventTaskId)) {
        firstSeenIndexMap.set(eventTaskId, i);
      }
    }

    // 记录 UUID 与进程/线程的映射
    if (details?.uuid) {
      taskUuidMap.set(details.uuid, processThread);
    }

    // 处理任务开始事件
    if (message === "Tasker.Task.Starting") {
      const taskId = eventTaskId;
      if (taskId === undefined) continue;

      const uuid = details.uuid || "";
      const taskKey = buildTaskKey(taskId, uuid, event.processId);
      const entry = details.entry || "";

      // 如果已有相同键的运行中任务，先结束它
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

      // 创建新任务
      if (taskId && !runningTaskMap.has(taskKey)) {
        const processInfo =
          (uuid && taskUuidMap.get(uuid)) || taskProcessMap.get(taskId) || processThread;
        const identifier = getIdentifierForEventIndex(i);

        const task: TaskInfo = {
          key: `task-${taskKeyCounter++}`,
          fileName,
          task_id: taskId,
          entry: stringPool.intern(entry),
          hash: stringPool.intern(details.hash || ""),
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
    }
    // 处理任务结束事件
    else if (message === "Tasker.Task.Succeeded" || message === "Tasker.Task.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) continue;

      const uuid = details.uuid || "";
      const taskKey = buildTaskKey(taskId, uuid, event.processId);
      let matchedTask = runningTaskMap.get(taskKey) || null;

      // 尝试匹配任务
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

  // 过滤掉 MaaTaskerPostStop 任务（内部清理任务）
  const filteredTasks = tasks.filter(task => task.entry !== "MaaTaskerPostStop");
  logger.info("任务构建完成", {
    totalTasks: tasks.length,
    filteredTasks: filteredTasks.length,
    entries: filteredTasks.map(t => t.entry)
  });
  return filteredTasks;
}

/**
 * 从事件流中构建单个任务的节点列表
 *
 * 解析任务相关的事件，提取节点信息、识别尝试、动作详情等。
 *
 * @param {TaskInfo} task - 目标任务
 * @param {EventNotification[]} events - 事件通知列表
 * @param {StringPool} stringPool - 字符串池
 * @returns {NodeInfo[]} 节点列表
 */
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

  // 临时存储
  const recognitionAttempts: RecognitionAttempt[] = [];
  const nestedNodes: RecognitionAttempt[] = [];
  const nestedActionNodes: ActionAttempt[] = [];
  let currentNextList: NextListItem[] = [];
  const recognitionsByTaskId = new Map<number, RecognitionAttempt[]>();
  const actionsByTaskId = new Map<number, ActionAttempt[]>();

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

    // 处理识别节点事件（嵌套）
    if (message === "Node.RecognitionNode.Succeeded" || message === "Node.RecognitionNode.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) continue;

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

    // 处理动作节点事件（嵌套）
    if (message === "Node.ActionNode.Succeeded" || message === "Node.ActionNode.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) continue;

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

    // 处理识别事件
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
    } else if (message === "Node.Recognition.Succeeded" || message === "Node.Recognition.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) continue;

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

    // 处理动作事件（嵌套）
    if (message === "Node.Action.Succeeded" || message === "Node.Action.Failed") {
      const taskId = eventTaskId;
      if (taskId === undefined) continue;

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
 * 统计节点成功率与耗时分布
 *
 * 遍历所有任务的节点，计算每个节点名称的统计指标：
 * - 执行次数
 * - 平均/最小/最大耗时
 * - 成功/失败次数
 * - 成功率
 *
 * @param {TaskInfo[]} tasks - 任务列表
 * @returns {{name: string, count: number, totalDuration: number, avgDuration: number, minDuration: number, maxDuration: number, successCount: number, failCount: number, successRate: number}[]} 节点统计数组
 *
 * @example
 * const stats = computeNodeStatistics(tasks);
 * console.log(stats[0].avgDuration); // 平均耗时（毫秒）
 */
export function computeNodeStatistics(
  tasks: TaskInfo[]
): {
  name: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successCount: number;
  failCount: number;
  successRate: number;
}[] {
  const statsMap = new Map<string, { durations: number[]; successCount: number; failCount: number }>();

  // 收集每个节点的耗时数据
  for (const task of tasks) {
    const nodes = task.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nextNode = nodes[i + 1];
      let duration = 0;

      // 计算节点耗时
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

      // 过滤异常值
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

  // 计算统计指标
  const result: {
    name: string;
    count: number;
    totalDuration: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    successCount: number;
    failCount: number;
    successRate: number;
  }[] = [];

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

/**
 * 调试信息模式正则表达式
 *
 * 用于匹配和隐藏日志中的调试信息，如：
 * - [Px123] / [px123] - 进程标识
 * - [Tx123] / [tx123] - 线程标识
 * - [L123] - 行号标识
 * - [xxx.cpp] / [xxx.h] - 源文件名
 */
export const debugInfoPattern = /\[P[xX]\d+\]|\[T[xX]\d+\]|\[L\d+\]|\[[^\]]+\.(cpp|h|hpp|c)\]/gi;

/**
 * 根据调试隐藏开关规范化搜索文本
 *
 * 当启用隐藏调试信息时，移除日志行中的进程/线程标识和源文件名，
 * 使搜索结果更简洁。
 *
 * @param {string} line - 原始文本
 * @param {boolean} hideDebugInfo - 是否隐藏调试信息
 * @returns {string} 处理后的文本
 *
 * @example
 * normalizeSearchLine('[Px1][Tx2][main.cpp] Task started', true);
 * // 返回 'Task started'
 */
export function normalizeSearchLine(line: string, hideDebugInfo: boolean): string {
  if (!hideDebugInfo) return line;
  return line.replace(debugInfoPattern, "").replace(/\s{2,}/g, " ").trim();
}
