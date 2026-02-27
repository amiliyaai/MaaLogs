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

import type { EventNotification } from "../types/logTypes";

/**
 * 方括号日志行解析结果
 */
export interface BracketLineResult {
  timestamp: string;
  level: string;
  processId: string;
  threadId: string;
  functionName: string;
  message: string;
  params: Record<string, unknown>;
}

/**
 * 消息解析结果
 */
export interface MessageParseResult {
  message: string;
  params: Record<string, unknown>;
}

/**
 * 解析方括号格式的日志行
 *
 * 支持格式：
 * [timestamp][level][pid][tid][function][optional1][optional2] message
 *
 * @param {string} line - 日志行
 * @returns {BracketLineResult | null} 解析结果或 null
 */
export function parseBracketLine(line: string): BracketLineResult | null {
  const regex =
    /^\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\](?:\[([^\]]+)\])?(?:\[([^\]]+)\])?(?:\[([^\]]+)\])?\s*(.*)$/;
  const match = line.match(regex);
  if (!match) return null;

  const [, timestamp, level, processId, threadId, opt1, opt2, opt3, rest] = match;

  let functionName = "";
  let message = rest || "";
  const params: Record<string, unknown> = {};

  const functionCandidates = [opt1, opt2, opt3].filter(Boolean);
  if (functionCandidates.length > 0) {
    functionName = functionCandidates[0] || "";
  }

  const parsed = parseMessageAndParams(message);
  message = parsed.message;
  Object.assign(params, parsed.params);

  return {
    timestamp: timestamp || "",
    level: level || "",
    processId: processId || "",
    threadId: threadId || "",
    functionName,
    message,
    params,
  };
}

/**
 * 解析消息和参数
 *
 * 从消息中提取 key=value 格式的参数。
 * 支持格式：
 * - key=value
 * - key="value with spaces"
 * - key={'json': 'object'}
 *
 * @param {string} message - 原始消息
 * @returns {MessageParseResult} 解析结果
 */
export function parseMessageAndParams(message: string): MessageParseResult {
  const params: Record<string, unknown> = {};
  let remaining = message;

  const keyValueRegex = /(\w+)\s*[=:]\s*(\{[^}]*\}|"[^"]*"|'[^']*'|\S+)/g;
  let match;

  while ((match = keyValueRegex.exec(message)) !== null) {
    const [, key, value] = match;
    let parsedValue: unknown = value;

    if (value.startsWith("{") && value.endsWith("}")) {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      parsedValue = value.slice(1, -1);
    }

    params[key] = parsedValue;
    remaining = remaining.replace(match[0], "").trim();
  }

  return { message: remaining, params };
}

/**
 * 从日志行中提取 identifier
 *
 * @param {string} line - 日志行
 * @returns {string | undefined} identifier 或 undefined
 */
export function extractIdentifier(line: string): string | undefined {
  const match = line.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  return match ? match[1] : undefined;
}

/**
 * 从时间戳中提取日期
 *
 * @param {string} timestamp - 时间戳字符串
 * @returns {string | null} 日期字符串 (YYYY-MM-DD) 或 null
 */
export function extractDate(timestamp: string): string | null {
  const match = timestamp.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * 创建事件通知对象
 *
 * @param {BracketLineResult} parsed - 解析后的日志行
 * @param {string} fileName - 文件名
 * @param {number} lineNumber - 行号
 * @param {string} msg - 事件消息
 * @param {Record<string, unknown>} details - 事件详情
 * @returns {EventNotification} 事件通知对象
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
