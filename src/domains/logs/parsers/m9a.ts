/**
 * @fileoverview M9A项目 (https://github.com/MAA1999/M9A) 日志解析器
 *
 * @todo 目前只是拿日志文件给Ai生成的解析器，后续继续适配M9A项目
 * 本文件实现了对 Loguru 格式日志的解析支持。
 * Loguru 是一个流行的 Python 日志库，其日志格式具有特定的结构。
 *
 * 支持的日志格式：
 * - 标准格式：YYYY-MM-DD HH:MM:SS.mmm | LEVEL | module:function:line | message
 * - 带标识符格式：包含 identifier 的日志行
 *
 * @module parsers/loguru
 * @author MaaLogs Team
 * @license MIT
 */

import type { AuxLogEntry } from "../types/logTypes";
import type { LogParser, AuxLogParser, AuxLogParserConfig, AuxLogParseResult } from "./types";

/**
 * 解析单行 Loguru 格式日志
 *
 * Loguru 日志格式示例：
 * 2024-01-15 10:30:45.123 | INFO     | module:function:123 | message
 *
 * @param {string} line - 原始日志行
 * @param {number} lineNumber - 行号
 * @param {string} fileName - 文件名
 * @returns {AuxLogEntry | null} 解析后的日志条目或 null
 *
 * @example
 * parseLoguruLine('2024-01-15 10:30:45.123 | INFO | main:run:10 | Task started', 1, 'app.log');
 */
function parseLoguruLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  // Loguru 格式正则表达式
  // 格式：timestamp | level | caller | message
  const regex =
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s*\|\s*(\w+)\s*\|\s*([^|]+)\s*\|\s*(.*)$/;
  const match = line.match(regex);

  if (!match) return null;

  const [, timestamp, level, caller, message] = match;

  // 解析调用者信息（module:function:line）
  const callerParts = caller.trim().split(":");
  const callerInfo = callerParts.length >= 2 ? caller.trim() : undefined;

  // 提取 identifier（如果存在）
  const identifierMatch = message.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  const identifier = identifierMatch ? identifierMatch[1] : undefined;

  // 提取 task_id（如果存在）
  const taskIdMatch = message.match(/\[task_id[=_](\d+)\]/i);
  const task_id = taskIdMatch ? parseInt(taskIdMatch[1]) : undefined;

  // 提取 entry（如果存在）
  const entryMatch = message.match(/\[entry[=_]([^\]]+)\]/i);
  const entry = entryMatch ? entryMatch[1] : undefined;

  // 计算毫秒时间戳
  const timestampMs = Date.parse(timestamp.replace(" ", "T"));

  return {
    key: `${fileName}-${lineNumber}`,
    source: "loguru",
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
 * Loguru 解析器实例
 *
 * 实现 LogParser 接口，用于解析 Loguru 格式的日志文件。
 *
 * @example
 * import { loguruParser } from './loguru';
 * const entries = await loguruParser.parse(content, 'app.log');
 */
export const loguruParser: LogParser = {
  /**
   * 解析器名称
   */
  name: "LoguruParser",

  /**
   * 支持的文件名模式
   *
   * Loguru 解析器支持所有 .log 文件，
   * 但会通过 canParse 方法进行内容检测。
   */
  supportedFiles: ["*.log"],

  /**
   * 检测文件内容是否为 Loguru 格式
   *
   * 通过检查前几行是否匹配 Loguru 格式来判断。
   *
   * @param {string} content - 文件内容
   * @param {string} _fileName - 文件名（未使用）
   * @returns {boolean} 是否为 Loguru 格式
   */
  canParse(content: string, _fileName: string): boolean {
    const lines = content.split("\n").slice(0, 10);
    let matchCount = 0;

    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const regex = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*\|\s*\w+\s*\|/;
      if (regex.test(line)) {
        matchCount++;
      }
    }

    // 如果超过 50% 的非空行匹配，则认为是 Loguru 格式
    return matchCount > 0 && matchCount / lines.filter((l) => l.trim().length > 0).length > 0.5;
  },

  /**
   * 解析 Loguru 格式日志文件
   *
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名
   * @returns {Promise<AuxLogEntry[]>} 解析后的日志条目数组
   */
  async parse(content: string, fileName: string): Promise<AuxLogEntry[]> {
    const lines = content.split("\n");
    const entries: AuxLogEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) continue;

      const entry = parseLoguruLine(line, i + 1, fileName);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  },
};

/**
 * Loguru Custom日志解析器实例
 *
 * 实现 AuxLogParser 接口，用于解析 Loguru 格式日志文件。
 */
export const loguruAuxParser: AuxLogParser = {
  /**
   * 解析器唯一标识符
   */
  id: "LoguruParser",

  /**
   * 解析器显示名称
   */
  name: "Loguru 解析器",

  /**
   * 解析器描述
   */
  description: "解析 Loguru 格式日志文件（M9A 项目）",

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
      const line = lines[i];
      if (line.trim().length === 0) continue;

      const entry = parseLoguruLine(line, i + 1, fileName);
      if (entry) {
        entries.push(entry);
      }
    }

    return { entries };
  },
};

/**
 * 检测日志行是否为 Loguru 格式
 *
 * 快速检测单行日志是否匹配 Loguru 格式。
 *
 * @param {string} line - 日志行
 * @returns {boolean} 是否为 Loguru 格式
 *
 * @example
 * isLoguruLine('2024-01-15 10:30:45.123 | INFO | main:run:10 | message'); // true
 */
export function isLoguruLine(line: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s*\|\s*\w+\s*\|/;
  return regex.test(line);
}
