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

import type { EventNotification, ControllerInfo, AdbScreencapMethod, AdbInputMethod, Win32ScreencapMethod, Win32InputMethod } from "../types/logTypes";

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
  params: Record<string, unknown>;
  status?: "enter" | "leave";
  duration?: number;
}

/**
 * 消息解析结果
 */
export interface MessageParseResult {
  message: string;
  params: Record<string, unknown>;
  status?: "enter" | "leave";
  duration?: number;
}

/**
 * 解析值类型
 */
export function parseValue(value: string): unknown {
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
export function parseBracketLine(line: string): BracketLineResult | null {
  const regex =
    /^\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?(?:\[([^\]]+)\])?(?:\[([^\]]+)\])?\s*([\s\S]*)$/;
  const match = line.match(regex);
  if (!match) return null;

  const [, timestamp, level, processId, threadId, opt1, opt2, opt3, rest] = match;

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

  const parsed = parseMessageAndParams(rest || "");

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
export function parseMessageAndParams(message: string): MessageParseResult {
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
 * 从日志行解析控制器信息
 */
export function parseControllerInfo(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number
): ControllerInfo | null {
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
    const screencapMethodsBitmask =
      typeof params["screencap_methods"] === "number"
        ? params["screencap_methods"]
        : parseInt(String(params["screencap_methods"] || "0"));
    const inputMethodsValue = params["input_methods"];
    const inputMethodsBitmask =
      typeof inputMethodsValue === "bigint"
        ? inputMethodsValue
        : typeof inputMethodsValue === "number"
          ? BigInt(inputMethodsValue)
          : 0n;
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

  if (functionName === "MaaWin32ControllerCreate") {
    const screencapMethodValue =
      typeof params["screencap_method"] === "number"
        ? params["screencap_method"]
        : parseInt(String(params["screencap_method"] || "0"));
    const mouseMethodValue =
      typeof params["mouse_method"] === "number"
        ? params["mouse_method"]
        : parseInt(String(params["mouse_method"] || "0"));
    const keyboardMethodValue =
      typeof params["keyboard_method"] === "number"
        ? params["keyboard_method"]
        : parseInt(String(params["keyboard_method"] || "0"));

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
 * 从时间戳中提取日期
 */
export function extractDate(timestamp: string): string | null {
  const match = timestamp.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * 创建事件通知对象
 */
export function createEventNotification(
  parsed: BracketLineResult,
  fileName: string,
  lineNumber: number,
  msg: string,
  details: Record<string, unknown>
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
