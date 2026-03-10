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
  JsonValue,
  NodeInfo,
  TaskInfo,
} from "@/types/logTypes";
import {
  parseAdbScreencapMethods,
  parseAdbInputMethods,
  parseWin32ScreencapMethod,
  parseWin32InputMethod,
} from "@/utils/controllerParse";
import { isTauriEnv } from "@/utils/env";
export {
  parseAdbScreencapMethods,
  parseAdbInputMethods,
  parseWin32ScreencapMethod,
  parseWin32InputMethod,
} from "@/utils/controllerParse";

interface PngFileInfo {
  filename: string;
  path: string;
}

export function normalizeId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return undefined;
}

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
        const normalized = value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
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

  const lineNumberRegex = /^L\d+$/;

  if (opt3) {
    if (
      lineNumberRegex.test(opt2 || "") ||
      (opt1 && (opt1.includes(".cpp") || opt1.includes(".hpp") || opt1.includes(".h")))
    ) {
      sourceFile = opt1;
      lineNumber = opt2;
    } else if (opt2 && (opt2.includes(".cpp") || opt2.includes(".hpp") || opt2.includes(".h"))) {
      sourceFile = opt2;
      functionName = opt1 || "";
    } else {
      functionName = opt3;
    }
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

function parseStatus(message: string): {
  message: string;
  status?: "enter" | "leave";
  duration?: number;
} {
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
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
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
  const screencapMethodsBitmask = parseBigIntParam(params["screencap_methods"]);
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

export interface OnErrorScreenshot {
  filename: string;
  timestamp: string;
  timestampMs: number;
  nodeName: string;
  filePath: string;
}

/** 错误截图文件名正则表达式，支持1-3位毫秒数 */
const ON_ERROR_FILENAME_REGEX = /^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}\.\d{1,3})_(.+?)\.png$/;

export function extractLogDirectory(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(/Logging (.+)\/maa\.log/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export async function parseOnErrorScreenshotsAsync(baseDir: string): Promise<OnErrorScreenshot[]> {
  const screenshots: OnErrorScreenshot[] = [];
  if (!isTauriEnv()) {
    return screenshots;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    let pngFiles = await invoke<PngFileInfo[]>("list_png_files", { dirPath: baseDir });

    if (pngFiles.length === 0) {
      const parentDir = baseDir.replace(/[/\\][^/\\]*$/, "");
      pngFiles = await invoke<PngFileInfo[]>("list_png_files", { dirPath: parentDir });
    }

    for (const file of pngFiles) {
      const match = file.filename.match(ON_ERROR_FILENAME_REGEX);
      if (!match) continue;

      const [, timestampStr, nodeName] = match;
      // 使用空格分隔格式，让 Date.parse 解析为本地时间（与日志时间戳解析方式一致）
      const localTimestamp = timestampStr.replace(
        /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})\.(\d{1,3})$/,
        (_, y, m, d, h, min, s, ms) => `${y}-${m}-${d} ${h}:${min}:${s}.${ms.padStart(3, "0")}`
      );

      screenshots.push({
        filename: file.filename,
        timestamp: localTimestamp,
        timestampMs: Date.parse(localTimestamp),
        nodeName,
        filePath: file.path,
      });
    }
  } catch {
    // 忽略错误
  }

  return screenshots;
}

export function parseOnErrorScreenshots(_baseDir: string): OnErrorScreenshot[] {
  return [];
}

export function attachScreenshotsToNodes(
  nodes: NodeInfo[],
  screenshots: OnErrorScreenshot[]
): void {
  for (const screenshot of screenshots) {
    const screenshotTime = screenshot.timestampMs;

    const candidates = nodes.filter((n) => {
      if (n.name !== screenshot.nodeName) return false;
      const nodeTime = new Date(n.timestamp).getTime();
      return nodeTime <= screenshotTime;
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      candidates[0].error_screenshot = screenshot.filePath;
    }
  }
}

interface NodeInfoWithTemp extends NodeInfo {
  _temp_error_screenshot_filename?: string;
}

/**
 * 从 save_on_error 日志行解析截图信息
 * @param rawLine - 原始日志行
 * @returns 解析结果，包含时间戳、节点名和文件名
 */
function parseSaveOnErrorRawLine(rawLine: string): {
  timestamp: string;
  nodeName: string;
  filename: string;
} | null {
  const timestampMatch = rawLine.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]/);
  if (!timestampMatch) return null;

  const match = rawLine.match(
    /save_on_error to .*?(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}\.\d{1,3})_(.+?)\.png/
  );
  if (!match) return null;

  const [, timePart, nodeName] = match;
  const filename = `${timePart}_${nodeName}.png`;

  return {
    timestamp: timestampMatch[1],
    nodeName,
    filename,
  };
}

/**
 * 从任务列表中找到最佳匹配的节点
 *
 * 匹配逻辑：
 * 1. 找到截图时间之前开始的所有任务
 * 2. 选择开始时间最接近的任务
 * 3. 在任务中找到同名节点，且节点时间 <= 截图时间
 * 4. 选择时间最接近的节点
 *
 * @param tasks - 任务列表
 * @param nodeName - 节点名称
 * @param screenshotTimeMs - 截图时间戳（毫秒）
 * @returns 最佳匹配的节点
 */
function findBestMatchingNode(
  tasks: TaskInfo[],
  nodeName: string,
  screenshotTimeMs: number
): NodeInfo | null {
  const taskCandidates = tasks.filter((task) => {
    const taskStart = new Date(task.start_time).getTime();
    return screenshotTimeMs >= taskStart;
  });

  if (taskCandidates.length === 0) return null;

  taskCandidates.sort(
    (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  );

  for (const task of taskCandidates) {
    const nodeCandidates = task.nodes.filter((n) => {
      if (n.name !== nodeName) return false;
      const nodeTime = new Date(n.timestamp).getTime();
      return nodeTime <= screenshotTimeMs;
    });

    if (nodeCandidates.length === 0) continue;

    nodeCandidates.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return nodeCandidates[0];
  }

  return null;
}

/**
 * 处理单个 save_on_error 日志行，关联到节点
 * @param rawLine - 原始日志行
 * @param tasks - 任务列表
 */
function processSaveOnErrorRawLine(rawLine: string, tasks: TaskInfo[]): void {
  const parsed = parseSaveOnErrorRawLine(rawLine);
  if (!parsed) return;

  const screenshotTimeMs = Date.parse(parsed.timestamp);
  const targetNode = findBestMatchingNode(tasks, parsed.nodeName, screenshotTimeMs);

  if (targetNode) {
    (targetNode as NodeInfoWithTemp)._temp_error_screenshot_filename = parsed.filename;
  }
}

/**
 * 从 save_on_error 日志行关联截图到节点
 * @param tasks - 任务列表
 * @param saveOnErrorRawLines - save_on_error 原始日志行
 */
export function attachScreenshotsFromSaveOnError(
  tasks: TaskInfo[],
  saveOnErrorRawLines: string[]
): void {
  for (const rawLine of saveOnErrorRawLines) {
    processSaveOnErrorRawLine(rawLine, tasks);
  }
}

/**
 * 从临时字段关联截图文件路径
 * @param tasks - 任务列表
 * @param screenshotMap - 截图文件映射
 * @param processedFilenames - 已处理的文件名集合
 */
function attachScreenshotsFromTemp(
  tasks: TaskInfo[],
  screenshotMap: Map<string, OnErrorScreenshot>,
  processedFilenames: Set<string>
): void {
  for (const task of tasks) {
    for (const node of task.nodes) {
      const tempNode = node as NodeInfoWithTemp;
      if (!tempNode._temp_error_screenshot_filename) continue;

      const screenshot = screenshotMap.get(tempNode._temp_error_screenshot_filename);
      if (screenshot) {
        node.error_screenshot = screenshot.filePath;
        processedFilenames.add(screenshot.filename);
      }
      delete tempNode._temp_error_screenshot_filename;
    }
  }
}

/**
 * 找到包含截图时间的最近任务
 * @param tasks - 任务列表
 * @param screenshotTime - 截图时间戳（毫秒）
 * @returns 匹配的任务
 */
function findTargetTask(tasks: TaskInfo[], screenshotTime: number): TaskInfo | null {
  const taskCandidates = tasks.filter((task) => {
    const taskStart = new Date(task.start_time).getTime();
    return screenshotTime >= taskStart;
  });

  if (taskCandidates.length === 0) return null;

  return taskCandidates.reduce((closest, task) => {
    const closestStart = new Date(closest.start_time).getTime();
    const taskStart = new Date(task.start_time).getTime();
    return taskStart > closestStart ? task : closest;
  });
}

/**
 * 在任务中找到最佳匹配的节点
 * @param targetTask - 目标任务
 * @param screenshot - 截图信息
 * @param screenshotTime - 截图时间戳（毫秒）
 * @returns 匹配的节点
 */
function findTargetNode(
  targetTask: TaskInfo,
  screenshot: OnErrorScreenshot,
  screenshotTime: number
): NodeInfo | null {
  const nodeCandidates = targetTask.nodes.filter((n) => {
    if (n.error_screenshot) return false;
    if (n.name !== screenshot.nodeName) return false;
    const nodeTime = new Date(n.timestamp).getTime();
    return nodeTime <= screenshotTime;
  });

  if (nodeCandidates.length === 0) return null;

  nodeCandidates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return nodeCandidates[0];
}

/**
 * 关联单个截图到节点
 * @param tasks - 任务列表
 * @param screenshot - 截图信息
 * @param processedFilenames - 已处理的文件名集合
 */
function attachSingleScreenshot(
  tasks: TaskInfo[],
  screenshot: OnErrorScreenshot,
  processedFilenames: Set<string>
): void {
  if (processedFilenames.has(screenshot.filename)) return;

  const screenshotTime = screenshot.timestampMs;
  const targetTask = findTargetTask(tasks, screenshotTime);
  if (!targetTask) return;

  const targetNode = findTargetNode(targetTask, screenshot, screenshotTime);
  if (!targetNode) return;

  targetNode.error_screenshot = screenshot.filePath;
  processedFilenames.add(screenshot.filename);
}

/**
 * 关联截图到任务和节点
 * @param tasks - 任务列表
 * @param screenshots - 截图列表
 */
export function attachScreenshotsToTasks(
  tasks: TaskInfo[],
  screenshots: OnErrorScreenshot[]
): void {
  const screenshotMap = new Map<string, OnErrorScreenshot>();
  for (const screenshot of screenshots) {
    screenshotMap.set(screenshot.filename, screenshot);
  }

  const processedFilenames = new Set<string>();
  attachScreenshotsFromTemp(tasks, screenshotMap, processedFilenames);

  for (const screenshot of screenshots) {
    attachSingleScreenshot(tasks, screenshot, processedFilenames);
  }
}
