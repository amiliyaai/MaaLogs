/**
 * @fileoverview 共享解析工具
 *
 * 本文件提供日志解析的公共工具函数。
 * 这些函数被所有项目解析器共享使用。
 *
 * @module parsers/shared
 * @author MaaLogs Team
 * @license MIT
 */

import type {
  EventNotification,
  ControllerInfo,
  AdbScreencapMethod,
  AdbInputMethod,
  Win32ScreencapMethod,
  Win32InputMethod,
  JsonValue,
} from "../types/logTypes";

/**
 * ADB 截图方式 Bitmask 映射
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
 */
const ADB_INPUT_METHOD_MAP: Record<number, AdbInputMethod> = {
  1: "AdbShell",
  2: "MinitouchAndAdbKey",
  4: "Maatouch",
  8: "EmulatorExtras",
};

/**
 * Win32 截图方式映射
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
 * 方括号日志行解析结果
 */
export interface BracketLineResult {
  timestamp: string;
  level: string;
  processId: string;
  threadId: string;
  sourceFile?: string;
  lineNumber?: string;
  functionName: string;
  message: string;
  params: Record<string, JsonValue>;
  status?: "enter" | "leave";
  duration?: number;
}

/**
 * 消息解析结果
 */
export interface MessageParseResult {
  message: string;
  params: Record<string, JsonValue>;
  status?: "enter" | "leave";
  duration?: number;
}

/**
 * 解析值类型
 */
export function parseValue(value: string): JsonValue {
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      try {
        const normalized = value
          .replace(/\r?\n/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return JSON.parse(normalized);
      } catch {
        return value;
      }
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value) && value.length > 15) {
    return BigInt(value);
  }
  if (/^-?\d+$/.test(value)) return parseInt(value);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * 解析 ADB 截图方式 bitmask
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
 */
export function parseWin32ScreencapMethod(value: number): Win32ScreencapMethod {
  return WIN32_SCREENCAP_METHOD_MAP[value] || "Unknown";
}

/**
 * 解析 Win32 输入方式值
 */
export function parseWin32InputMethod(value: number): Win32InputMethod {
  return WIN32_INPUT_METHOD_MAP[value] || "Unknown";
}

/**
 * 解析方括号格式的日志行
 */
function readBracketSegments(
  line: string,
  maxSegments: number
): { segments: string[]; rest: string } | null {
  if (!line.startsWith("[")) return null;
  const segments: string[] = [];
  let index = 0;
  while (index < line.length && line[index] === "[" && segments.length < maxSegments) {
    const end = line.indexOf("]", index + 1);
    if (end === -1) return null;
    segments.push(line.slice(index + 1, end));
    index = end + 1;
  }
  return { segments, rest: line.slice(index).trimStart() };
}

function resolveSourceAndFunction(
  opt1?: string,
  opt2?: string,
  opt3?: string
): { sourceFile?: string; lineNumber?: string; functionName: string } {
  let sourceFile: string | undefined;
  let lineNumber: string | undefined;
  let functionName = "";

  if (opt3) {
    sourceFile = opt1;
    lineNumber = opt2;
    functionName = opt3;
  } else if (opt2) {
    if (opt1 && (opt1.includes(".cpp") || opt1.includes(".hpp") || opt1.includes(".h"))) {
      sourceFile = opt1;
      lineNumber = opt2;
    } else if (opt2.includes(".cpp") || opt2.includes(".hpp") || opt2.includes(".h")) {
      sourceFile = opt2;
      functionName = opt1 || "";
    } else {
      functionName = opt2;
    }
  } else if (opt1) {
    if (opt1.includes(".cpp") || opt1.includes(".hpp") || opt1.includes(".h")) {
      sourceFile = opt1;
    } else {
      functionName = opt1;
    }
  }

  return { sourceFile, lineNumber, functionName };
}

export function parseBracketLine(line: string): BracketLineResult | null {
  const bracketResult = readBracketSegments(line, 7);
  if (!bracketResult || bracketResult.segments.length < 4) return null;

  const [timestamp, level, processId, threadId, opt1, opt2, opt3] = bracketResult.segments;
  const { sourceFile, lineNumber, functionName } = resolveSourceAndFunction(opt1, opt2, opt3);
  const parsed = parseMessageAndParams(bracketResult.rest);

  return {
    timestamp: timestamp || "",
    level: level || "",
    processId: processId || "",
    threadId: threadId || "",
    sourceFile,
    lineNumber,
    functionName,
    message: parsed.message,
    params: parsed.params,
    status: parsed.status,
    duration: parsed.duration,
  };
}

/**
 * 解析消息和参数
 */
function readBracketToken(
  message: string,
  start: number
): { token: string; nextIndex: number } | null {
  let depth = 1;
  let braceDepth = 0;
  let index = start + 1;
  while (index < message.length && (depth > 0 || braceDepth > 0)) {
    const char = message[index];
    if (char === "{") {
      braceDepth += 1;
    } else if (char === "}") {
      braceDepth -= 1;
    } else if (char === "[" && braceDepth === 0) {
      depth += 1;
    } else if (char === "]" && braceDepth === 0) {
      depth -= 1;
    }
    index += 1;
  }
  if (depth !== 0) return null;
  return { token: message.substring(start + 1, index - 1), nextIndex: index };
}

function collectBracketTokens(message: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < message.length) {
    const start = message.indexOf("[", index);
    if (start === -1) break;
    const token = readBracketToken(message, start);
    if (token) {
      tokens.push(token.token);
      index = token.nextIndex;
    } else {
      index = start + 1;
    }
  }
  return tokens;
}

function buildParams(tokens: string[]): Record<string, JsonValue> {
  const params: Record<string, JsonValue> = {};
  for (const token of tokens) {
    const kvMatch = token.match(/^([^=]+)=(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      params[key.trim()] = parseValue(value.trim());
    } else {
      params[token.trim()] = true;
    }
  }
  return params;
}

function stripTokens(message: string, tokens: string[]): string {
  let cleanMessage = message;
  for (const token of tokens) {
    cleanMessage = cleanMessage.replace(`[${token}]`, "");
  }
  return cleanMessage.trim();
}

function parseStatus(message: string): { message: string; status?: "enter" | "leave"; duration?: number } {
  const statusMatch = message.match(/\|\s*(enter|leave)(?:,\s*(\d+)ms)?/);
  if (!statusMatch) return { message };
  const status = statusMatch[1] as "enter" | "leave";
  const duration = statusMatch[2] ? parseInt(statusMatch[2]) : undefined;
  const cleaned = message.replace(/\|\s*(enter|leave).*$/, "").trim();
  return { message: cleaned, status, duration };
}

export function parseMessageAndParams(message: string): MessageParseResult {
  const tokens = collectBracketTokens(message);
  const params = buildParams(tokens);
  const cleanedMessage = stripTokens(message, tokens);
  const { message: finalMessage, status, duration } = parseStatus(cleanedMessage);
  return { message: finalMessage, params, status, duration };
}

/**
 * 从日志行解析控制器信息
 */
function parseNumberParam(value: JsonValue, fallback = 0): number {
  if (typeof value === "number") return value;
  const parsed = parseInt(String(value ?? ""));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseBigIntParam(value: JsonValue): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  const parsed = Number(value ?? "");
  if (!Number.isNaN(parsed)) return BigInt(parsed);
  return 0n;
}

function parseAdbControllerInfo(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): ControllerInfo {
  const { params, timestamp, processId } = parsed;
  const adbPath = params["adb_path"] as string | undefined;
  const address = params["address"] as string | undefined;
  const screencapMethodsBitmask = parseNumberParam(params["screencap_methods"]);
  const inputMethodsBitmask = parseBigIntParam(params["input_methods"]);
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
    lineNumber,
  };
}

function parseWin32ControllerInfo(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): ControllerInfo {
  const { params, timestamp, processId } = parsed;
  const screencapMethodValue = parseNumberParam(params["screencap_method"]);
  const mouseMethodValue = parseNumberParam(params["mouse_method"]);
  const keyboardMethodValue = parseNumberParam(params["keyboard_method"]);

  return {
    type: "win32",
    processId,
    screencapMethod: parseWin32ScreencapMethod(screencapMethodValue),
    mouseMethod: parseWin32InputMethod(mouseMethodValue),
    keyboardMethod: parseWin32InputMethod(keyboardMethodValue),
    timestamp,
    fileName,
    lineNumber,
  };
}

export function parseControllerInfo(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): ControllerInfo | null {
  const { functionName, status } = parsed;

  if (status !== "enter") return null;
  if (functionName === "MaaAdbControllerCreate") {
    return parseAdbControllerInfo(parsed, fileName, lineNumber);
  }
  if (functionName === "MaaWin32ControllerCreate") {
    return parseWin32ControllerInfo(parsed, fileName, lineNumber);
  }
  return null;
}

/**
 * 从日志行中提取 identifier
 */
export function extractIdentifier(line: string): string | undefined {
  const match = line.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  return match ? match[1] : undefined;
}

/**
 * 创建事件通知对象
 */
export function createEventNotification(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number,
  msg: string,
  details: Record<string, JsonValue>
): EventNotification {
  return {
    timestamp: parsed.timestamp,
    level: parsed.level,
    processId: parsed.processId,
    threadId: parsed.threadId,
    message: msg,
    details,
    fileName,
    _lineNumber: lineNumber,
  };
}
