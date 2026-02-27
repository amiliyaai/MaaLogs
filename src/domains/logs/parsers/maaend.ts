/**
 * @fileoverview MaaEnd项目 (https://github.com/MaaEnd/MaaEnd) 日志解析器
 *
 * 本文件实现了对 MaaEnd/go-service 日志的解析支持。
 * go-service 是 Maa 框架的 Go 语言后端服务。
 *
 * 支持的日志格式：
 * - JSON 格式日志：每行一个 JSON 对象
 * - 文本格式日志：带时间戳的文本日志
 * - 混合格式：包含多种格式的日志文件
 *
 * @module parsers/maaend
 * @author MaaLogs Team
 * @license MIT
 */

import type { AuxLogEntry } from "../types/logTypes";
import type { LogParser, AuxLogParser, AuxLogParserConfig, AuxLogParseResult } from "./types";

/**
 * JSON 日志条目结构
 *
 * go-service 输出的 JSON 格式日志字段。
 */
interface JsonLogEntry {
  time?: string;
  level?: string;
  msg?: string;
  message?: string;
  identifier?: string;
  task_id?: number;
  entry?: string;
  caller?: string;
  [key: string]: unknown;
}

/**
 * 解析 JSON 格式的日志行
 *
 * go-service 可能输出 JSON 格式的日志，每行一个 JSON 对象。
 *
 * @param {string} line - 原始日志行
 * @param {number} lineNumber - 行号
 * @param {string} fileName - 文件名
 * @returns {AuxLogEntry | null} 解析后的日志条目或 null
 *
 * @example
 * parseJsonLine('{"time":"2024-01-15T10:30:45Z","level":"info","msg":"Task started"}', 1, 'go-service.log');
 */
function parseJsonLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  // 检查是否为 JSON 格式
  if (!line.startsWith("{")) return null;

  try {
    const json: JsonLogEntry = JSON.parse(line);

    // 提取时间戳
    const timestampRaw = json.time || json.timestamp || "";
    const timestamp = typeof timestampRaw === "string" ? timestampRaw : "";
    const timestampMs = timestamp ? Date.parse(timestamp) : undefined;

    // 提取日志级别
    const level = (json.level || json.lvl || "INFO").toString().toUpperCase();

    // 提取消息
    const message = json.msg || json.message || json.m || "";

    // 计算 key
    const key = `${fileName}-${lineNumber}`;

    // 构建日志条目
    const entry: AuxLogEntry = {
      key,
      source: "go-service",
      timestamp: timestamp || "",
      timestampMs: Number.isNaN(timestampMs) ? undefined : timestampMs,
      level,
      message: typeof message === "string" ? message : JSON.stringify(message),
      identifier: json.identifier,
      task_id: json.task_id,
      entry: json.entry,
      caller: json.caller,
      fileName,
      lineNumber,
    };

    // 提取其他字段作为 details
    const details: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(json)) {
      if (
        ![
          "time",
          "timestamp",
          "level",
          "lvl",
          "msg",
          "message",
          "m",
          "identifier",
          "task_id",
          "entry",
          "caller",
        ].includes(key)
      ) {
        details[key] = value;
      }
    }
    if (Object.keys(details).length > 0) {
      entry.details = details;
    }

    return entry;
  } catch {
    return null;
  }
}

/**
 * 解析文本格式的日志行
 *
 * go-service 也可能输出文本格式的日志。
 * 支持多种常见的时间戳格式。
 *
 * @param {string} line - 原始日志行
 * @param {number} lineNumber - 行号
 * @param {string} fileName - 文件名
 * @returns {AuxLogEntry | null} 解析后的日志条目或 null
 *
 * @example
 * parseTextLine('2024/01/15 10:30:45.123 INFO Task started', 1, 'go-service.log');
 */
function parseTextLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  // 支持的时间戳格式：
  // - 2024-01-15 10:30:45.123
  // - 2024/01/15 10:30:45.123
  // - 2024-01-15T10:30:45.123Z
  // - [2024-01-15 10:30:45.123]
  const timestampRegex =
    /^(?:\[)?(\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?)(?:\])?\s*/;
  const match = line.match(timestampRegex);

  if (!match) return null;

  const timestamp = match[1].replace(/\//g, "-").replace("T", " ").replace("Z", "");
  const rest = line.slice(match[0].length);

  // 提取日志级别
  const levelMatch = rest.match(/^(\w+)\s*/);
  const level = levelMatch ? levelMatch[1].toUpperCase() : "INFO";
  const message = levelMatch ? rest.slice(levelMatch[0].length) : rest;

  // 提取 identifier
  const identifierMatch = message.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  const identifier = identifierMatch ? identifierMatch[1] : undefined;

  // 提取 task_id
  const taskIdMatch = message.match(/\[task_id[=_](\d+)\]/i);
  const task_id = taskIdMatch ? parseInt(taskIdMatch[1]) : undefined;

  // 计算毫秒时间戳
  const timestampMs = Date.parse(timestamp.replace(" ", "T"));

  return {
    key: `${fileName}-${lineNumber}`,
    source: "go-service",
    timestamp,
    timestampMs: Number.isNaN(timestampMs) ? undefined : timestampMs,
    level,
    message: message.trim(),
    identifier,
    task_id,
    fileName,
    lineNumber,
  };
}

/**
 * 解析单行日志
 *
 * 尝试使用多种格式解析日志行，返回第一个成功的结果。
 *
 * @param {string} line - 原始日志行
 * @param {number} lineNumber - 行号
 * @param {string} fileName - 文件名
 * @returns {AuxLogEntry | null} 解析后的日志条目或 null
 */
function parseLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  // 跳过空行
  if (line.trim().length === 0) return null;

  // 尝试 JSON 格式
  const jsonEntry = parseJsonLine(line, lineNumber, fileName);
  if (jsonEntry) return jsonEntry;

  // 尝试文本格式
  const textEntry = parseTextLine(line, lineNumber, fileName);
  if (textEntry) return textEntry;

  // 无法解析，创建基本条目
  return {
    key: `${fileName}-${lineNumber}`,
    source: "go-service",
    timestamp: "",
    level: "INFO",
    message: line.trim(),
    fileName,
    lineNumber,
  };
}

/**
 * MaaEnd/go-service 解析器实例
 *
 * 实现 LogParser 接口，用于解析 go-service 日志文件。
 *
 * @example
 * import { maaEndParser } from './maaend';
 * const entries = await maaEndParser.parse(content, 'go-service.log');
 */
export const maaEndParser: LogParser = {
  /**
   * 解析器名称
   */
  name: "MaaEndParser",

  /**
   * 支持的文件名模式
   *
   * 主要支持 go-service.log 文件。
   */
  supportedFiles: ["go-service.log", "go-service*.log"],

  /**
   * 检测文件内容是否为 go-service 日志
   *
   * 通过检查文件名和内容特征来判断。
   *
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名
   * @returns {boolean} 是否为 go-service 日志
   */
  canParse(content: string, fileName: string): boolean {
    const lowerFileName = fileName.toLowerCase();

    // 检查文件名
    if (lowerFileName.includes("go-service")) return true;

    // 检查内容特征
    const lines = content.split("\n").slice(0, 10);
    let jsonCount = 0;
    let textCount = 0;

    for (const line of lines) {
      if (line.trim().length === 0) continue;
      if (line.startsWith("{")) {
        jsonCount++;
      } else if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(line)) {
        textCount++;
      }
    }

    // 如果有 JSON 或时间戳格式的日志行，认为是 go-service 日志
    return jsonCount > 0 || textCount > 0;
  },

  /**
   * 解析 go-service 日志文件
   *
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名
   * @returns {Promise<AuxLogEntry[]>} 解析后的日志条目数组
   */
  async parse(content: string, fileName: string): Promise<AuxLogEntry[]> {
    const lines = content.split("\n");
    const entries: AuxLogEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      const entry = parseLine(lines[i], i + 1, fileName);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  },
};

/**
 * MaaEnd 辅助日志解析器实例
 *
 * 实现 AuxLogParser 接口，用于解析 go-service 日志文件。
 */
export const maaEndAuxParser: AuxLogParser = {
  /**
   * 解析器唯一标识符
   */
  id: "MaaEndParser",

  /**
   * 解析器显示名称
   */
  name: "MaaEnd 解析器",

  /**
   * 解析器描述
   */
  description: "解析 MaaEnd/go-service 日志文件，支持 JSON 和文本格式",

  /**
   * 解析日志行
   *
   * @param {string[]} lines - 日志行数组
   * @param {AuxLogParserConfig} config - 解析配置
   * @returns {AuxLogParseResult} 解析结果
   */
  parse(lines: string[], config: AuxLogParserConfig): AuxLogParseResult {
    const entries: AuxLogEntry[] = [];
    const { fileName } = config;

    for (let i = 0; i < lines.length; i++) {
      const entry = parseLine(lines[i], i + 1, fileName);
      if (entry) {
        entries.push(entry);
      }
    }

    return { entries };
  },
};

/**
 * 检测日志行是否为 go-service JSON 格式
 *
 * @param {string} line - 日志行
 * @returns {boolean} 是否为 JSON 格式
 */
export function isGoServiceJsonLine(line: string): boolean {
  return line.startsWith("{") && line.endsWith("}");
}

/**
 * 检测日志行是否为 go-service 文本格式
 *
 * @param {string} line - 日志行
 * @returns {boolean} 是否为文本格式
 */
export function isGoServiceTextLine(line: string): boolean {
  return /^\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}:\d{2}/.test(line);
}
