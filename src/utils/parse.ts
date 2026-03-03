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

import type {
  LogLine,
  EventNotification,
  ActionDetail,
  NodeInfo,
  TaskInfo,
  RecognitionAttempt,
  ActionAttempt,
  NextListItem,
  ControllerInfo,
  AdbScreencapMethod,
  AdbInputMethod,
  Win32ScreencapMethod,
  Win32InputMethod,
  RecognitionDetail,
  JsonValue,
  NestedActionNode,
  AuxLogEntry,
} from "../types/logTypes";
import { createLogger } from "./logger";
import { parseMessageAndParams } from "../parsers/shared";

const logger = createLogger("Parse");

/**
 * 检查 JSON 值是否为对象类型（非数组）
 *
 * 用于类型守卫，判断一个 JsonValue 是否为 Record<string, JsonValue> 类型。
 *
 * @param {JsonValue | undefined} value - 待检查的 JSON 值
 * @returns {boolean} 如果是对象且非数组则返回 true
 */
function isRecordJsonValue(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 将 JSON 值安全转换为字符串
 *
 * 如果值是字符串类型则返回该值，否则返回 undefined。
 *
 * @param {JsonValue | undefined} value - 待转换的 JSON 值
 * @returns {string | undefined} 字符串值或 undefined
 */
function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

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
  64: "EmulatorExtras",
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
  8: "EmulatorExtras",
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
  32: "ScreenDC",
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
  256: "PostMessageWithWindowPos",
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
 * 从参数对象中解析数字值
 *
 * 安全地从参数对象中提取指定键的数字值。
 * 支持数字类型和可解析为数字的字符串。
 *
 * @param {Record<string, JsonValue>} params - 参数对象
 * @param {string} key - 键名
 * @returns {number} 解析后的数字，解析失败返回 0
 */
function parseNumberParam(params: Record<string, JsonValue>, key: string): number {
  const value = params[key];
  if (typeof value === "number") return value;
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 从参数对象中解析 BigInt 值
 *
 * 安全地从参数对象中提取指定键的 BigInt 值。
 * 支持 bigint、number 和可解析的字符串类型。
 *
 * @param {Record<string, JsonValue>} params - 参数对象
 * @param {string} key - 键名
 * @returns {bigint} 解析后的 BigInt，解析失败返回 0n
 */
function parseBigIntParam(params: Record<string, JsonValue>, key: string): bigint {
  const value = params[key];
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(value);
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? BigInt(parsed) : 0n;
}

/**
 * 解析日志行的方括号标记
 *
 * 从日志行开头提取连续的方括号内容作为标记。
 * Maa 日志格式使用方括号分隔时间戳、级别、进程ID等信息。
 *
 * @param {string} line - 日志行内容
 * @param {number} maxTokens - 最大标记数量
 * @returns {{tokens: string[], rest: string} | null} 标记数组和剩余内容，格式不匹配返回 null
 *
 * @example
 * parseLineTokens('[2024-01-15][INF][P1] message', 3);
 * // 返回 { tokens: ['2024-01-15', 'INF', 'P1'], rest: 'message' }
 */
function parseLineTokens(
  line: string,
  maxTokens: number
): { tokens: string[]; rest: string } | null {
  const tokens: string[] = [];
  let index = 0;
  while (index < line.length && line[index] === "[" && tokens.length < maxTokens) {
    const end = line.indexOf("]", index + 1);
    if (end === -1) return null;
    tokens.push(line.slice(index + 1, end));
    index = end + 1;
  }
  return { tokens, rest: line.slice(index).trimStart() };
}

/**
 * 解析源文件和函数名信息
 *
 * 从日志行的标记中解析出源文件名、行号和函数名。
 * Maa 日志的源信息位置可能变化，此函数处理多种格式组合。
 *
 * @param {string} [part1] - 第一个可选部分
 * @param {string} [part2] - 第二个可选部分
 * @param {string} [part3] - 第三个可选部分
 * @returns {{sourceFile?: string, lineNumber?: string, functionName?: string}} 解析结果
 *
 * @example
 * resolveSourceAndFunction('TaskBase.cpp', 'L131', 'run_task');
 * // 返回 { sourceFile: 'TaskBase.cpp', lineNumber: 'L131', functionName: 'run_task' }
 */
function resolveSourceAndFunction(
  part1?: string,
  part2?: string,
  part3?: string
): { sourceFile?: string; lineNumber?: string; functionName?: string } {
  if (part3) {
    return { sourceFile: part1, lineNumber: part2, functionName: part3 };
  }
  if (part1 && !part2) {
    if (part1.includes(".cpp") || part1.includes(".h")) {
      return { sourceFile: part1 };
    }
    return { functionName: part1 };
  }
  if (part1 && part2) {
    return { sourceFile: part1, lineNumber: part2 };
  }
  return {};
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
    const screencapMethodsBitmask = parseNumberParam(params, "screencap_methods");
    const inputMethodsBitmask = parseBigIntParam(params, "input_methods");
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
      lineNumber: parsed._lineNumber || 0,
    };
  }

  if (functionName === "MaaWin32ControllerCreate") {
    const screencapMethodValue = parseNumberParam(params, "screencap_method");
    const mouseMethodValue = parseNumberParam(params, "mouse_method");
    const keyboardMethodValue = parseNumberParam(params, "keyboard_method");

    return {
      type: "win32",
      processId,
      screencapMethod: parseWin32ScreencapMethod(screencapMethodValue),
      mouseMethod: parseWin32InputMethod(mouseMethodValue),
      keyboardMethod: parseWin32InputMethod(keyboardMethodValue),
      timestamp,
      fileName,
      lineNumber: parsed._lineNumber || 0,
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
      types: controllers.map((c) => ({ type: c.type, processId: c.processId })),
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
export function associateControllersToTasks(
  tasks: TaskInfo[],
  controllers: ControllerInfo[]
): void {
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
    matchedTasks: matchedCount,
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
 * 将值强制转换为数字 ID
 *
 * 与 normalizeId 不同，此函数总是返回数字，解析失败返回 0。
 * 用于需要确定数字值的场景。
 *
 * @param {unknown} value - 原始值
 * @returns {number} 数字 ID，解析失败返回 0
 */
function coerceId(value: unknown): number {
  const normalized = normalizeId(value);
  if (typeof normalized === "number") return normalized;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * 将值强制转换为字符串
 *
 * 如果值是字符串则返回该值，否则返回空字符串。
 *
 * @param {unknown} value - 原始值
 * @returns {string} 字符串值
 */
function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
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
  const startTime = performance.now();
  logger.debug("开始构建 identifier 范围", {
    mapSize: eventIdentifierMap.size,
    totalEvents
  });

  const ranges: { identifier: string; startIndex: number; endIndex: number }[] = [];
  const sortedEntries = [...eventIdentifierMap.entries()].sort((a, b) => a[0] - b[0]);
  if (sortedEntries.length === 0) {
    logger.debug("identifier 范围构建完成：无数据");
    return ranges;
  }

  let currentIdentifier = sortedEntries[0][1];
  let currentStart = sortedEntries[0][0];

  for (let i = 1; i < sortedEntries.length; i++) {
    const [eventIndex, identifier] = sortedEntries[i];
    if (identifier !== currentIdentifier) {
      ranges.push({
        identifier: currentIdentifier,
        startIndex: currentStart,
        endIndex: eventIndex - 1,
      });
      currentIdentifier = identifier;
      currentStart = eventIndex;
    }
  }

  ranges.push({
    identifier: currentIdentifier,
    startIndex: currentStart,
    endIndex: totalEvents - 1,
  });

  const duration = performance.now() - startTime;
  logger.debug("identifier 范围构建完成", {
    rangesCount: ranges.length,
    durationMs: Math.round(duration)
  });

  return ranges;
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
  const parsed = parseLineTokens(line, 7);
  if (!parsed) return null;
  const { tokens, rest } = parsed;
  if (tokens.length < 4) return null;
  const [timestamp, level, processId, threadId, part1, part2, part3] = tokens;
  const { sourceFile, lineNumber, functionName } = resolveSourceAndFunction(part1, part2, part3);
  const { message: cleanMessage, params, status, duration } = parseMessageAndParams(rest);

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
    _lineNumber: lineNum,
  };
}

/**
 * 从日志行中提取 OnEventNotify 事件
 *
 * OnEventNotify 是 Maa 框架发出的事件通知，包含任务生命周期和节点执行信息。
 * 这些事件是构建任务列表的核心数据源。
 *
 * 日志格式：
 * [时间戳][级别][进程ID][线程ID][EventDispatcher.hpp] !!!OnEventNotify!!! [handle=xxx] [msg=Node.PipelineNode.Succeeded] [details={...}]
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
export function parseEventNotification(
  parsed: LogLine,
  fileName: string
): EventNotification | null {
  const { message, params } = parsed;

  if (!message.includes("!!!OnEventNotify!!!")) {
    return null;
  }

  const msg = asString(params["msg"]);
  const detailsValue = params["details"];
  if (!msg) return null;

  return {
    timestamp: parsed.timestamp,
    level: parsed.level,
    message: msg,
    details: isRecordJsonValue(detailsValue) ? detailsValue : {},
    _lineNumber: parsed._lineNumber,
    fileName,
    processId: parsed.processId,
    threadId: parsed.threadId,
  };
}

/**
 * 规范化 Focus 显示配置
 *
 * 将 Focus 配置中的 display 字段转换为字符串数组。
 * 支持字符串和数组两种格式。
 *
 * @param {JsonValue | undefined} value - display 配置值
 * @returns {string[]} 显示配置数组
 */
function normalizeFocusDisplay(value: JsonValue | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string") as string[];
  return [];
}

/**
 * 格式化 Focus 模板值
 *
 * 将 JSON 值转换为适合显示的字符串格式。
 * 基本类型直接转换，对象类型序列化为 JSON。
 *
 * @param {JsonValue} value - JSON 值
 * @returns {string} 格式化后的字符串
 */
function formatFocusTemplateValue(value: JsonValue): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null) return "null";
  return JSON.stringify(value);
}

/**
 * 解析 Focus 模板中的路径引用
 *
 * 支持点号分隔的路径，如 "node.name" 或 "reco_details.best_target"。
 * 从事件详情对象中按路径提取值。
 *
 * @param {Record<string, JsonValue>} details - 事件详情对象
 * @param {string} path - 点号分隔的路径字符串
 * @returns {JsonValue | undefined} 找到的值或 undefined
 */
function resolveFocusTemplateValue(
  details: Record<string, JsonValue>,
  path: string
): JsonValue | undefined {
  const parts = path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  let current: JsonValue = details;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    const record = current as Record<string, JsonValue>;
    if (!(part in record)) return undefined;
    current = record[part];
  }
  return current;
}

/**
 * 应用 Focus 模板变量替换
 *
 * 将模板中的 {path} 占位符替换为事件详情中对应的值。
 * 路径最长支持 100 个字符。
 *
 * @param {string} content - 模板内容
 * @param {Record<string, JsonValue>} details - 事件详情对象
 * @returns {string} 替换后的内容
 */
function applyFocusTemplate(content: string, details: Record<string, JsonValue>): string {
  return content.replace(/\{([^}]{0,100})\}/g, (match, key) => {
    const trimmedKey = String(key).trim();
    if (trimmedKey.length > 100) return match;
    const value = resolveFocusTemplateValue(details, trimmedKey);
    if (value === undefined) return match;
    return formatFocusTemplateValue(value);
  });
}

/**
 * 规范化 Focus 模板配置
 *
 * 将 Focus 模板配置转换为统一的 {content, display} 格式。
 * 支持字符串模板和对象模板两种格式。
 *
 * @param {JsonValue} template - 模板配置
 * @returns {{content: string, display: string[]} | null} 规范化后的模板或 null（无效模板）
 */
function normalizeFocusTemplate(
  template: JsonValue
): { content: string; display: string[] } | null {
  if (typeof template === "string") {
    return { content: template, display: ["log"] };
  }
  if (isRecordJsonValue(template)) {
    const contentValue = template.content;
    const displayValue = template.display;
    let content: string;
    if (typeof contentValue === "string") {
      content = contentValue;
    } else if (contentValue === undefined) {
      content = "";
    } else {
      content = JSON.stringify(contentValue);
    }
    if (!content) return null;
    if (displayValue === undefined) return { content, display: ["log"] };
    const display = normalizeFocusDisplay(displayValue);
    if (display.length === 0) return null;
    return { content, display };
  }
  return null;
}

/**
 * 从事件详情中提取条目名称
 *
 * 优先使用 entry 字段，其次使用 name 字段
 *
 * @param details - 事件详情对象
 * @returns 条目名称或 undefined
 */
function extractEntryName(details: Record<string, JsonValue>): string | undefined {
  if (typeof details.entry === "string") {
    return details.entry;
  }
  if (typeof details.name === "string") {
    return details.name;
  }
  return undefined;
}

/**
 * 构建 Focus 消息
 *
 * 1. 优先查找与事件类型完全匹配的模板
 * 2. 如果没有完全匹配的模板，使用 focus 配置中的第一个模板
 * 3. 应用模板并返回格式化后的消息
 *
 * @param event - 事件通知对象
 * @param focus - Focus 配置对象
 * @param details - 事件详情对象
 * @returns 格式化后的 Focus 消息或 null
 */
function buildFocusMessage(
  event: EventNotification,
  focus: Record<string, JsonValue>,
  details: Record<string, JsonValue>
): string | null {
  let template: JsonValue | undefined;

  for (const key of Object.keys(focus)) {
    if (event.message.startsWith(key)) {
      template = focus[key];
      break;
    }
  }

  if (!template) {
    const focusKeys = Object.keys(focus);
    if (focusKeys.length > 0) {
      template = focus[focusKeys[0]];
    }
  }

  if (!template) {
    return null;
  }

  const normalized = normalizeFocusTemplate(template);
  if (!normalized || !normalized.display.includes("log")) {
    return null;
  }

  const applied = applyFocusTemplate(normalized.content, details).trim();
  return applied || null;
}

/**
 * 构建单个 Focus 日志条目
 *
 * @param event - 事件通知对象
 * @param index - 事件索引
 * @param focusMap - 节点名称到 Focus 配置的映射
 * @returns Focus 日志条目或 null
 */
function buildSingleFocusEntry(
  event: EventNotification,
  index: number,
  focusMap: Map<string, Record<string, JsonValue>>
): AuxLogEntry | null {
  const details = isRecordJsonValue(event.details) ? event.details : {};

  const nodeName = typeof details.name === "string" ? details.name : undefined;

  let focus: Record<string, JsonValue> | undefined;

  const directFocus = isRecordJsonValue(details.focus) ? details.focus : undefined;
  if (directFocus) {
    focus = directFocus;
  } else if (nodeName) {
    focus = focusMap.get(nodeName);
  }

  if (!focus) return null;

  if (!event.message.startsWith("Node.Recognition") && !event.message.startsWith("Node.Action")) {
    return null;
  }

  const message = buildFocusMessage(event, focus, details);

  if (!message) {
    return null;
  }

  const taskId = normalizeId(details.task_id ?? details.taskId);
  const entry = extractEntryName(details);
  const timestampMs = parseTimestampToMs(event.timestamp) ?? undefined;
  const identifier = typeof details.identifier === "string" ? details.identifier : undefined;

  return {
    key: `focus-${event.fileName}-${event._lineNumber ?? index + 1}`,
    source: "focus",
    timestamp: event.timestamp,
    timestampMs,
    level: "info",
    message,
    identifier,
    task_id: taskId,
    entry,
    fileName: event.fileName,
    lineNumber: event._lineNumber ?? index + 1,
    details: {
      event: event.message,
      ...(nodeName ? { nodeName } : {}),
    },
  };
}

/**
 * 从事件列表中构建 Focus 配置映射
 *
 * 从 Node.PipelineNode 事件中提取节点名称和 Focus 配置，
 * 构建节点名称到 Focus 配置的映射关系。
 *
 * @param events - 事件列表
 * @returns 节点名称到 Focus 配置的 Map
 */
function buildFocusMapFromEvents(
  events: EventNotification[]
): Map<string, Record<string, JsonValue>> {
  const focusMap = new Map<string, Record<string, JsonValue>>();

  for (const event of events) {
    if (!event.message.startsWith("Node.PipelineNode.")) {
      continue;
    }

    const details = isRecordJsonValue(event.details) ? event.details : {};
    const nodeName = typeof details.name === "string" ? details.name : undefined;
    const focus = isRecordJsonValue(details.focus) ? details.focus : undefined;

    if (nodeName && focus) {
      focusMap.set(nodeName, focus);
    }
  }

  return focusMap;
}

/**
 * 从事件列表中构建 Focus 日志条目
 *
 * @param events - 事件列表
 * @returns Focus 日志条目数组
 */
export function buildFocusLogEntries(events: EventNotification[]): AuxLogEntry[] {
  const entries: AuxLogEntry[] = [];
  const focusMap = buildFocusMapFromEvents(events);

  for (let i = 0; i < events.length; i++) {
    const entry = buildSingleFocusEntry(events[i], i, focusMap);
    if (entry) entries.push(entry);
  }
  return entries;
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
  const actionType = getActionType(action);

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

function getActionType(action: unknown): string | null {
  if (typeof action === "string") return action;
  if (!action || typeof action !== "object") return null;
  const actionObj = action as Record<string, unknown>;
  const type = actionObj.type ?? actionObj.action;
  return typeof type === "string" ? type : null;
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

type IdentifierRange = { identifier: string; startIndex: number; endIndex: number };

/**
 * 创建 identifier 查找函数
 *
 * 返回一个高效的查找函数，用于根据事件索引快速定位对应的 identifier。
 * 使用闭包维护当前范围索引，实现 O(1) 平均查找复杂度。
 *
 * @param {IdentifierRange[]} ranges - identifier 范围数组
 * @returns {(eventIndex: number) => string | undefined} 查找函数
 */
function createIdentifierLookup(ranges: IdentifierRange[]) {
  const sorted = ranges.slice().sort((a, b) => a.startIndex - b.startIndex);
  let rangeIndex = 0;
  return (eventIndex: number): string | undefined => {
    while (rangeIndex < sorted.length && eventIndex > sorted[rangeIndex].endIndex) {
      rangeIndex++;
    }
    const range = sorted[rangeIndex];
    if (range && eventIndex >= range.startIndex && eventIndex <= range.endIndex) {
      return range.identifier;
    }
    return undefined;
  };
}

/**
 * 更新任务的持续时间
 *
 * 根据任务的开始时间和结束时间计算并更新持续时间。
 *
 * @param {TaskInfo} task - 任务对象
 * @param {string} endTime - 结束时间字符串
 */
function updateTaskDuration(task: TaskInfo, endTime: string) {
  if (!task.start_time) return;
  const start = new Date(task.start_time).getTime();
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  task.duration = end - start;
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
  const startTime = performance.now();
  logger.debug("开始构建任务", {
    eventsCount: events.length,
    identifierRangesCount: identifierRanges.length
  });

  const tasks: TaskInfo[] = [];
  const runningTaskMap = new Map<string, TaskInfo>();
  const taskProcessMap = new Map<number, { processId: string; threadId: string }>();
  const taskUuidMap = new Map<string, { processId: string; threadId: string }>();
  const firstSeenIndexMap = new Map<number, number>();
  let taskKeyCounter = 0;
  const getIdentifierForEventIndex = createIdentifierLookup(identifierRanges);
  const buildTaskKey = (taskId: number, uuid: string, processId: string) =>
    `${processId || "proc"}:${uuid || "uuid"}:${taskId}`;
  const resolveProcessInfo = (
    taskId: number,
    uuid: string,
    fallback: { processId: string; threadId: string }
  ) => (uuid && taskUuidMap.get(uuid)) || taskProcessMap.get(taskId) || fallback;
  const normalizeTaskId = (details?: Record<string, JsonValue>) =>
    normalizeId(details?.task_id ?? details?.taskId);
  const nextTaskKey = () => `task-${taskKeyCounter++}`;

  const finalizeRunningTask = (task: TaskInfo, endTime: string, endIndex: number) => {
    task.status = "failed";
    task.end_time = stringPool.intern(endTime);
    task._endEventIndex = endIndex;
    updateTaskDuration(task, task.end_time);
  };

  const handleTaskStart = (
    event: EventNotification,
    eventTaskId: number | undefined,
    index: number,
    processThread: { processId: string; threadId: string }
  ) => {
    const taskId = eventTaskId;
    if (taskId === undefined) return;

    const details = event.details as Record<string, JsonValue>;
    const uuid = (details.uuid as string) || "";
    const taskKey = buildTaskKey(taskId, uuid, event.processId);
    const entry = (details.entry as string) || "";

    if (taskId && runningTaskMap.has(taskKey)) {
      const prevTask = runningTaskMap.get(taskKey);
      if (prevTask && !prevTask.end_time) {
        finalizeRunningTask(
          prevTask,
          event.timestamp,
          Math.max(index - 1, prevTask._startEventIndex ?? index - 1)
        );
      }
      runningTaskMap.delete(taskKey);
    }

    if (taskId && !runningTaskMap.has(taskKey)) {
      const processInfo = resolveProcessInfo(taskId, uuid, processThread);
      const identifier = getIdentifierForEventIndex(index);

      const task: TaskInfo = {
        key: nextTaskKey(),
        fileName: event.fileName,
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
        _startEventIndex: index,
      };
      tasks.push(task);
      runningTaskMap.set(taskKey, task);
    }
  };

  const handleTaskEnd = (
    event: EventNotification,
    eventTaskId: number | undefined,
    index: number,
    processThread: { processId: string; threadId: string }
  ) => {
    const taskId = eventTaskId;
    if (taskId === undefined) return;

    const details = event.details as Record<string, JsonValue>;
    const uuid = (details.uuid as string) || "";
    const taskKey = buildTaskKey(taskId, uuid, event.processId);
    let matchedTask = runningTaskMap.get(taskKey) || null;

    if (!matchedTask) {
      matchedTask =
        tasks.find(
          (t) =>
            t.task_id === taskId &&
            t.processId === event.processId &&
            !t.end_time &&
            (!uuid || t.uuid === uuid)
        ) || null;
    }

    if (matchedTask) {
      matchedTask.status = event.message === "Tasker.Task.Succeeded" ? "succeeded" : "failed";
      matchedTask.end_time = stringPool.intern(event.timestamp);
      matchedTask._endEventIndex = index;

      if (!matchedTask.processId || !matchedTask.threadId) {
        const processInfo = resolveProcessInfo(taskId, uuid, processThread);
        matchedTask.processId = stringPool.intern(processInfo.processId || "");
        matchedTask.threadId = stringPool.intern(processInfo.threadId || "");
      }

      if (matchedTask.end_time) {
        updateTaskDuration(matchedTask, matchedTask.end_time);
      }
      runningTaskMap.delete(taskKey);
    }
  };

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const { message, details } = event;
    const eventTaskId = normalizeTaskId(details);
    const processThread = { processId: event.processId, threadId: event.threadId };

    if (eventTaskId !== undefined) {
      taskProcessMap.set(eventTaskId, processThread);
      if (!firstSeenIndexMap.has(eventTaskId)) {
        firstSeenIndexMap.set(eventTaskId, i);
      }
    }

    if (typeof details.uuid === "string") {
      taskUuidMap.set(details.uuid, processThread);
    }

    if (message === "Tasker.Task.Starting") {
      handleTaskStart(event, eventTaskId, i, processThread);
    } else if (message === "Tasker.Task.Succeeded" || message === "Tasker.Task.Failed") {
      handleTaskEnd(event, eventTaskId, i, processThread);
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

  // 去重：合并相同任务（相同 entry、start_time、uuid 但不同 processId/threadId 的任务）
  const deduplicatedTasks = deduplicateTasks(tasks);

  const filteredTasks = deduplicatedTasks.filter(
    (task) => task.entry !== "MaaTaskerPostStop" && !task.entry.includes("post_stop")
  );

  const duration = performance.now() - startTime;
  logger.info("任务构建完成", {
    totalTasks: tasks.length,
    deduplicatedTasks: deduplicatedTasks.length,
    filteredTasks: filteredTasks.length,
    entries: filteredTasks.slice(0, 10).map((t) => t.entry),
    durationMs: Math.round(duration)
  });
  return filteredTasks;
}

/**
 * 任务去重函数
 *
 * 合并相同任务（相同 entry、task_id、uuid、hash 但不同 processId/threadId 的任务）
 * 优先保留有控制器信息的任务
 *
 * @param tasks - 原始任务列表
 * @returns 去重后的任务列表
 */
function deduplicateTasks(tasks: TaskInfo[]): TaskInfo[] {
  const taskSignatureMap = new Map<string, TaskInfo[]>();

  for (const task of tasks) {
    const signature = `${task.entry || ""}|${task.task_id || ""}|${task.uuid || ""}|${task.hash || ""}`;
    if (!taskSignatureMap.has(signature)) {
      taskSignatureMap.set(signature, []);
    }
    taskSignatureMap.get(signature)!.push(task);
  }

  const result: TaskInfo[] = [];

  for (const [, sameTasks] of taskSignatureMap) {
    if (sameTasks.length === 1) {
      result.push(sameTasks[0]);
      continue;
    }

    // 多个任务具有相同签名，合并它们
    // 优先保留有 controllerInfo 的任务
    const mainTask = sameTasks.find((t) => t.controllerInfo) || sameTasks[0];

    // 合并节点（按 node_id 去重）
    const nodesMap = new Map<number, NodeInfo>();
    for (const task of sameTasks) {
      for (const node of task.nodes) {
        if (!nodesMap.has(node.node_id)) {
          nodesMap.set(node.node_id, node);
        }
      }
    }
    mainTask.nodes = Array.from(nodesMap.values()).sort((a, b) => a.node_id - b.node_id);

    result.push(mainTask);
  }

  return result;
}

/**
 * 任务节点构建上下文类型
 *
 * 在构建任务节点过程中维护的状态信息，包括：
 * - 当前任务信息
 * - 已构建的节点列表
 * - 识别尝试和嵌套节点的临时存储
 * - 各种 ID 到数据的映射关系
 */
type TaskNodeBuildContext = {
  task: TaskInfo;
  stringPool: StringPool;
  nodes: NodeInfo[];
  nodeIdSet: Set<number>;
  recognitionAttempts: RecognitionAttempt[];
  nestedNodes: RecognitionAttempt[];
  nestedActionNodes: NestedActionNode[];
  currentNextList: NextListItem[];
  currentActionId: number | undefined;
  recognitionsByTaskId: Map<number, RecognitionAttempt[]>;
  actionsByTaskId: Map<number, ActionAttempt[]>;
  actionNodesByTaskId: Map<number, NestedActionNode[]>;
};

/**
 * 从事件中更新 Next List
 *
 * 处理 Node.NextList.Starting 和 Node.NextList.Succeeded 事件，
 * 提取并更新当前节点的 next_list 信息。
 *
 * @param {TaskNodeBuildContext} context - 构建上下文
 * @param {string} message - 事件消息
 * @param {Record<string, JsonValue>} details - 事件详情
 * @param {number | undefined} eventTaskId - 事件关联的任务 ID
 */
function updateNextListFromEvent(
  context: TaskNodeBuildContext,
  message: string,
  details: Record<string, JsonValue>,
  eventTaskId: number | undefined
) {
  if (message !== "Node.NextList.Starting" && message !== "Node.NextList.Succeeded") return;
  if (eventTaskId !== context.task.task_id) return;
  const list = Array.isArray(details.list) ? details.list : [];
  context.currentNextList = list.map((item) => {
    if (!isRecordJsonValue(item)) {
      return {
        name: context.stringPool.intern(""),
        anchor: false,
        jump_back: false,
      };
    }
    const name = typeof item.name === "string" ? item.name : "";
    const anchor = typeof item.anchor === "boolean" ? item.anchor : false;
    const jumpBack = typeof item.jump_back === "boolean" ? item.jump_back : false;
    return {
      name: context.stringPool.intern(name),
      anchor,
      jump_back: jumpBack,
    };
  });
}

/**
 * 更新嵌套识别节点
 *
 * 处理 Node.RecognitionNode.Succeeded/Failed 事件，
 * 将嵌套识别节点添加到上下文中。
 * 这些节点是由 MaaContextRunRecognition API 调用产生的。
 *
 * @param {TaskNodeBuildContext} context - 构建上下文
 * @param {string} message - 事件消息
 * @param {Record<string, JsonValue>} details - 事件详情
 * @param {number | undefined} eventTaskId - 事件关联的任务 ID
 * @param {string} timestamp - 事件时间戳
 */
function updateNestedRecognitionNode(
  context: TaskNodeBuildContext,
  message: string,
  details: Record<string, JsonValue>,
  eventTaskId: number | undefined,
  timestamp: string
) {
  if (message !== "Node.RecognitionNode.Succeeded" && message !== "Node.RecognitionNode.Failed") {
    return;
  }
  if (eventTaskId === undefined || eventTaskId === context.task.task_id) return;
  const nestedRecognitions = context.recognitionsByTaskId.get(eventTaskId) || [];
  const recoDetails = details.reco_details as RecognitionDetail | undefined;
  const recoId = coerceId(recoDetails?.reco_id ?? details.node_id ?? details.nodeId);
  const nodeName = coerceString(details.name);
  context.nestedNodes.push({
    reco_id: recoId,
    name: context.stringPool.intern(nodeName),
    timestamp: context.stringPool.intern(timestamp),
    status: message === "Node.RecognitionNode.Succeeded" ? "success" : "failed",
    reco_details: recoDetails,
    nested_nodes: nestedRecognitions.length > 0 ? nestedRecognitions : undefined,
  });
  context.recognitionsByTaskId.delete(eventTaskId);
}

/**
 * 更新识别尝试记录
 *
 * 处理 Node.Recognition.Succeeded/Failed 事件，
 * 记录识别尝试信息。支持主任务和嵌套任务的识别事件。
 *
 * @param {TaskNodeBuildContext} context - 构建上下文
 * @param {string} message - 事件消息
 * @param {Record<string, JsonValue>} details - 事件详情
 * @param {number | undefined} eventTaskId - 事件关联的任务 ID
 * @param {string} timestamp - 事件时间戳
 */
function updateRecognitionAttempts(
  context: TaskNodeBuildContext,
  message: string,
  details: Record<string, JsonValue>,
  eventTaskId: number | undefined,
  timestamp: string
) {
  if (message !== "Node.Recognition.Succeeded" && message !== "Node.Recognition.Failed") return;
  if (eventTaskId === context.task.task_id) {
    const recoDetails = details.reco_details as RecognitionDetail | undefined;
    const recoName = coerceString(details.name) || coerceString(details.node_name);
    context.recognitionAttempts.push({
      reco_id: coerceId(details.reco_id),
      name: context.stringPool.intern(recoName),
      timestamp: context.stringPool.intern(timestamp),
      status: message === "Node.Recognition.Succeeded" ? "success" : "failed",
      reco_details: recoDetails,
      nested_nodes: context.nestedNodes.length > 0 ? context.nestedNodes.slice() : undefined,
    });
    context.nestedNodes.length = 0;
    return;
  }
  if (eventTaskId === undefined) return;
  const recoDetails = details.reco_details as RecognitionDetail | undefined;
  const recoName = coerceString(details.name) || coerceString(details.node_name);
  const attempt: RecognitionAttempt = {
    reco_id: coerceId(details.reco_id),
    name: context.stringPool.intern(recoName),
    timestamp: context.stringPool.intern(timestamp),
    status: message === "Node.Recognition.Succeeded" ? "success" : "failed",
    reco_details: recoDetails,
  };
  if (!context.recognitionsByTaskId.has(eventTaskId)) {
    context.recognitionsByTaskId.set(eventTaskId, []);
  }
  context.recognitionsByTaskId.get(eventTaskId)!.push(attempt);
}

/**
 * 更新动作尝试记录
 *
 * 处理 Node.Action.Starting/Succeeded/Failed 事件，
 * 记录动作尝试信息。支持嵌套任务的动作事件。
 *
 * @param {TaskNodeBuildContext} context - 构建上下文
 * @param {string} message - 事件消息
 * @param {Record<string, JsonValue>} details - 事件详情
 * @param {number | undefined} eventTaskId - 事件关联的任务 ID
 * @param {string} timestamp - 事件时间戳
 */
function updateActionAttempts(
  context: TaskNodeBuildContext,
  message: string,
  details: Record<string, JsonValue>,
  eventTaskId: number | undefined,
  timestamp: string
) {
  if (message === "Node.Action.Starting" && eventTaskId === context.task.task_id) {
    context.currentActionId = normalizeId(details.action_id);
    return;
  }
  if (message === "Node.Action.Succeeded" || message === "Node.Action.Failed") {
    if (eventTaskId === context.task.task_id) {
      context.currentActionId = undefined;
      return;
    }
  }
  if (message !== "Node.Action.Succeeded" && message !== "Node.Action.Failed") return;
  if (eventTaskId === undefined || eventTaskId === context.task.task_id) return;
  const actionDetails = details.action_details as ActionDetail | undefined;
  const actionName = coerceString(details.name);
  const actionAttempt: ActionAttempt = {
    action_id: coerceId(details.action_id),
    name: context.stringPool.intern(actionName),
    timestamp: context.stringPool.intern(timestamp),
    status: message === "Node.Action.Succeeded" ? "success" : "failed",
    action_details: actionDetails,
  };
  if (!context.actionsByTaskId.has(eventTaskId)) {
    context.actionsByTaskId.set(eventTaskId, []);
  }
  context.actionsByTaskId.get(eventTaskId)!.push(actionAttempt);
}

/**
 * 更新动作节点
 *
 * 处理 Node.ActionNode.Succeeded/Failed 事件，
 * 将嵌套动作节点添加到上下文中。
 *
 * @param {TaskNodeBuildContext} context - 构建上下文
 * @param {string} message - 事件消息
 * @param {Record<string, JsonValue>} details - 事件详情
 * @param {number | undefined} eventTaskId - 事件关联的任务 ID
 * @param {string} timestamp - 事件时间戳
 */
function updateActionNodes(
  context: TaskNodeBuildContext,
  message: string,
  details: Record<string, JsonValue>,
  eventTaskId: number | undefined,
  timestamp: string
) {
  if (message !== "Node.ActionNode.Succeeded" && message !== "Node.ActionNode.Failed") return;
  if (eventTaskId === undefined || eventTaskId === context.task.task_id) return;
  const nodeId = normalizeId(details.node_id ?? details.nodeId);
  if (nodeId === undefined) return;
  const nodeName = coerceString(details.name);
  const actionDetails = details.action_details as ActionDetail | undefined;
  const actions = context.actionsByTaskId.get(eventTaskId) || [];
  const actionNode: NestedActionNode = {
    node_id: nodeId,
    name: context.stringPool.intern(nodeName),
    timestamp: context.stringPool.intern(timestamp),
    status: message === "Node.ActionNode.Succeeded" ? "success" : "failed",
    action_details: actionDetails,
    actions: actions.length > 0 ? actions : undefined,
  };
  context.nestedActionNodes.push(actionNode);
  context.actionsByTaskId.delete(eventTaskId);
  if (context.currentActionId !== undefined) {
    if (!context.actionNodesByTaskId.has(context.currentActionId)) {
      context.actionNodesByTaskId.set(context.currentActionId, []);
    }
    context.actionNodesByTaskId.get(context.currentActionId)!.push(actionNode);
  }
}

/**
 * 更新 Pipeline 节点
 *
 * 处理 Node.PipelineNode.Succeeded/Failed 事件，
 * 构建完整的节点信息并添加到节点列表。
 * 这是节点构建的最终步骤，整合所有收集的信息。
 *
 * @param {TaskNodeBuildContext} context - 构建上下文
 * @param {string} message - 事件消息
 * @param {Record<string, JsonValue>} details - 事件详情
 * @param {number | undefined} eventTaskId - 事件关联的任务 ID
 * @param {string} timestamp - 事件时间戳
 */
function updatePipelineNodes(
  context: TaskNodeBuildContext,
  message: string,
  details: Record<string, JsonValue>,
  eventTaskId: number | undefined,
  timestamp: string
) {
  if (message !== "Node.PipelineNode.Succeeded" && message !== "Node.PipelineNode.Failed") return;
  if (eventTaskId !== context.task.task_id) return;
  const nodeId = normalizeId(details.node_id ?? details.nodeId);
  if (typeof nodeId !== "number" || context.nodeIdSet.has(nodeId)) {
    context.currentNextList = [];
    context.recognitionAttempts.length = 0;
    context.nestedNodes.length = 0;
    return;
  }
  const nodeDetails = details.node_details as NodeInfo["node_details"] | undefined;
  const nodeName = coerceString(nodeDetails?.name ?? details.name);
  const recoDetails = details.reco_details as RecognitionDetail | undefined;
  const actionDetails = details.action_details as ActionDetail | undefined;

  const nextListFromDetails = details.next_list as NextListItem[] | undefined;
  const nextList =
    nextListFromDetails && nextListFromDetails.length > 0
      ? nextListFromDetails
      : context.currentNextList;

  const recognitionAttemptsFromDetails = details.recognition_attempts as
    | RecognitionAttempt[]
    | undefined;
  const recognitionAttempts =
    recognitionAttemptsFromDetails && recognitionAttemptsFromDetails.length > 0
      ? recognitionAttemptsFromDetails
      : context.recognitionAttempts;

  const actionId = normalizeId(actionDetails?.action_id ?? details.action_id);
  const nestedActionNodes =
    actionId !== undefined
      ? context.actionNodesByTaskId.get(actionId) || []
      : context.nestedActionNodes.slice();

  context.nodes.push({
    node_id: nodeId,
    name: context.stringPool.intern(nodeName),
    timestamp: context.stringPool.intern(timestamp),
    status: message === "Node.PipelineNode.Succeeded" ? "success" : "failed",
    task_id: context.task.task_id,
    reco_details: recoDetails,
    action_details: actionDetails,
    node_details: nodeDetails,
    focus: details.focus,
    next_list: nextList.map((item) => ({
      name: context.stringPool.intern(item.name),
      anchor: item.anchor,
      jump_back: item.jump_back,
    })),
    recognition_attempts: recognitionAttempts.map((attempt) => ({
      reco_id: attempt.reco_id,
      name: context.stringPool.intern(attempt.name),
      timestamp: context.stringPool.intern(attempt.timestamp),
      status: attempt.status,
      reco_details: attempt.reco_details,
      nested_nodes: attempt.nested_nodes,
    })),
    nested_recognition_in_action:
      context.nestedNodes.length > 0 ? context.nestedNodes.slice() : undefined,
    nested_action_nodes: nestedActionNodes.length > 0 ? nestedActionNodes : undefined,
  });
  context.nodeIdSet.add(nodeId);
  context.currentNextList = [];
  context.recognitionAttempts.length = 0;
  context.nestedNodes.length = 0;
  context.nestedActionNodes.length = 0;
  if (actionId !== undefined) {
    context.actionNodesByTaskId.delete(actionId);
  }
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
    .slice(startIndex, endIndex + 1);

  const recognitionAttempts: RecognitionAttempt[] = [];
  const nestedNodes: RecognitionAttempt[] = [];
  const nestedActionNodes: NestedActionNode[] = [];
  const recognitionsByTaskId = new Map<number, RecognitionAttempt[]>();
  const actionsByTaskId = new Map<number, ActionAttempt[]>();
  const actionNodesByTaskId = new Map<number, NestedActionNode[]>();

  const context: TaskNodeBuildContext = {
    task,
    stringPool,
    nodes,
    nodeIdSet,
    recognitionAttempts,
    nestedNodes,
    nestedActionNodes,
    currentNextList: [],
    currentActionId: undefined,
    recognitionsByTaskId,
    actionsByTaskId,
    actionNodesByTaskId,
  };

  for (const event of taskEvents) {
    const { message, details } = event;
    const eventTaskId = normalizeId(details?.task_id ?? details?.taskId);
    updateNextListFromEvent(context, message, details, eventTaskId);
    updateNestedRecognitionNode(context, message, details, eventTaskId, event.timestamp);
    updateRecognitionAttempts(context, message, details, eventTaskId, event.timestamp);
    updateActionAttempts(context, message, details, eventTaskId, event.timestamp);
    updateActionNodes(context, message, details, eventTaskId, event.timestamp);
    updatePipelineNodes(context, message, details, eventTaskId, event.timestamp);
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

/**
 * 节点统计数据桶类型
 *
 * 用于累积单个节点名称的统计数据。
 */
type NodeStatsBucket = {
  count: number;
  totalDuration: number;
  minDuration: number;
  maxDuration: number;
  successCount: number;
  failCount: number;
};

/**
 * 计算节点持续时间
 *
 * 根据当前节点时间戳和下一个节点/任务结束时间计算节点执行耗时。
 * 无效值（非有限数、负数、超过 1 小时）返回 null。
 *
 * @param {string} currentTimestamp - 当前节点时间戳
 * @param {string} [nextTimestamp] - 下一个节点时间戳
 * @param {string} [taskEnd] - 任务结束时间戳
 * @returns {number | null} 持续时间（毫秒）或 null
 */
function getNodeDuration(
  currentTimestamp: string,
  nextTimestamp?: string,
  taskEnd?: string
): number | null {
  const currentTime = new Date(currentTimestamp).getTime();
  let endTime: number | null = null;
  if (nextTimestamp) {
    endTime = new Date(nextTimestamp).getTime();
  } else if (taskEnd) {
    endTime = new Date(taskEnd).getTime();
  }
  if (endTime === null) return null;
  const duration = endTime - currentTime;
  if (!Number.isFinite(duration) || duration < 0 || duration > 3600000) return null;
  return duration;
}

/**
 * 获取或创建统计数据桶
 *
 * 从 Map 中获取指定名称的统计数据桶，不存在则创建新桶。
 *
 * @param {Map<string, NodeStatsBucket>} statsMap - 统计数据 Map
 * @param {string} name - 节点名称
 * @param {number} initialDuration - 初始持续时间（用于初始化 min/max）
 * @returns {NodeStatsBucket} 统计数据桶
 */
function getOrCreateStats(
  statsMap: Map<string, NodeStatsBucket>,
  name: string,
  initialDuration: number
): NodeStatsBucket {
  if (!statsMap.has(name)) {
    statsMap.set(name, {
      count: 0,
      totalDuration: 0,
      minDuration: initialDuration,
      maxDuration: initialDuration,
      successCount: 0,
      failCount: 0,
    });
  }
  return statsMap.get(name)!;
}

/**
 * 更新统计数据桶
 *
 * 将一次执行的持续时间添加到统计数据中，
 * 更新计数、总耗时、最小/最大耗时和成功/失败计数。
 *
 * @param {NodeStatsBucket} stats - 统计数据桶
 * @param {number} duration - 本次执行持续时间
 * @param {NodeInfo["status"]} status - 节点状态
 */
function updateStatsBucket(
  stats: NodeStatsBucket,
  duration: number,
  status: NodeInfo["status"]
): void {
  stats.count += 1;
  stats.totalDuration += duration;
  if (duration < stats.minDuration) stats.minDuration = duration;
  if (duration > stats.maxDuration) stats.maxDuration = duration;
  if (status === "success") {
    stats.successCount++;
  } else {
    stats.failCount++;
  }
}

/**
 * 将任务节点数据添加到统计 Map
 *
 * 遍历任务的所有节点，计算每个节点的持续时间并更新统计。
 *
 * @param {Map<string, NodeStatsBucket>} statsMap - 统计数据 Map
 * @param {TaskInfo} task - 任务对象
 */
function addTaskNodeStats(statsMap: Map<string, NodeStatsBucket>, task: TaskInfo): void {
  const nodes = task.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nextNode = nodes[i + 1];
    const duration = getNodeDuration(node.timestamp, nextNode?.timestamp, task.end_time);
    if (duration === null) continue;
    const stats = getOrCreateStats(statsMap, node.name, duration);
    updateStatsBucket(stats, duration, node.status);
  }
}

/**
 * 构建统计结果数组
 *
 * 将统计数据 Map 转换为数组格式，计算平均耗时和成功率。
 *
 * @param {Map<string, NodeStatsBucket>} statsMap - 统计数据 Map
 * @returns {Array} 统计结果数组
 */
function buildStatsResult(statsMap: Map<string, NodeStatsBucket>) {
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
    if (stats.count === 0) continue;
    const avgDuration = stats.totalDuration / stats.count;
    const successRate = (stats.successCount / (stats.successCount + stats.failCount)) * 100;
    result.push({
      name,
      count: stats.count,
      totalDuration: stats.totalDuration,
      avgDuration,
      minDuration: stats.minDuration,
      maxDuration: stats.maxDuration,
      successCount: stats.successCount,
      failCount: stats.failCount,
      successRate,
    });
  }

  return result;
}

export function computeNodeStatistics(tasks: TaskInfo[]): {
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
  const statsMap = new Map<string, NodeStatsBucket>();

  for (const task of tasks) {
    addTaskNodeStats(statsMap, task);
  }
  return buildStatsResult(statsMap);
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
export const debugInfoPattern = /\[(?:px|tx|l)\d+\]|\[[^\]\r\n]{1,80}\.(?:c|cpp|h|hpp)\]/gi;

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
  return line
    .replace(debugInfoPattern, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
