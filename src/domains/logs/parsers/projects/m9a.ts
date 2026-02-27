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

import type { EventNotification, ControllerInfo, AuxLogEntry } from "../../types/logTypes";
import type { ProjectParser, MainLogParseResult } from "../project-types";
import type { AuxLogParserConfig, AuxLogParseResult, AuxLogParserInfo } from "../types";
import {
  parseBracketLine,
  extractIdentifier,
  extractDate,
  createEventNotification,
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
    const details = params["details"];
    if (!msg) return null;

    if (typeof msg === "string" && msg.startsWith("Tasker.")) {
      return createEventNotification(
        parsed,
        fileName,
        lineNumber,
        msg,
        (details as Record<string, unknown>) || {}
      );
    }
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
    const events: EventNotification[] = [];
    const controllers: ControllerInfo[] = [];
    const identifierMap = new Map<number, string>();
    let baseDate: string | null = null;
    let lastIdentifier: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const parsed = parseBracketLine(rawLine);
      if (!parsed) continue;

      if (baseDate === null && parsed.timestamp) {
        baseDate = extractDate(parsed.timestamp);
      }

      const event = parseM9aEventNotification(parsed, config.fileName, i + 1);
      if (event) {
        events.push(event);
        const identifier = extractIdentifier(rawLine);
        if (identifier) {
          lastIdentifier = identifier;
        }
        if (lastIdentifier) {
          identifierMap.set(events.length - 1, lastIdentifier);
        }
      } else {
        const identifier = extractIdentifier(rawLine);
        if (identifier) {
          lastIdentifier = identifier;
        }
      }
    }

    return { events, controllers, baseDate, identifierMap };
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
