/**
 * @fileoverview M9A 项目解析器
 *
 * 本文件实现了 M9A 项目 (https://github.com/MAA1999/M9A) 的日志解析逻辑。
 * M9A 使用 MaaFramework 的标准日志格式。
 *
 * maa.log 解析：使用 baseParser 共享逻辑
 * custom 日志：管道符格式，YYYY-MM-DD HH:MM:SS.mmm | LEVEL | caller | message
 *
 * @module parsers/projects/m9a
 * @author MaaLogs Team
 * @license MIT
 */

import type {
  AuxLogEntry,
  ProjectParser,
  MainLogParseResult,
  AuxLogParserConfig,
  AuxLogParseResult,
  AuxLogParserInfo,
} from "../../types/parserTypes";
import { parseMainLogBase } from "../baseParser";

function splitCustomLine(
  line: string
): { timestamp: string; level: string; caller: string; message: string } | null {
  const first = line.indexOf("|");
  if (first === -1) return null;
  const second = line.indexOf("|", first + 1);
  if (second === -1) return null;
  const third = line.indexOf("|", second + 1);
  if (third === -1) return null;
  const timestamp = line.slice(0, first).trim();
  const level = line.slice(first + 1, second).trim();
  const caller = line.slice(second + 1, third).trim();
  const message = line.slice(third + 1).trim();
  if (!timestamp || !level || !caller) return null;
  return { timestamp, level, caller, message };
}

function parseM9aCustomLine(
  line: string,
  lineNumber: number,
  fileName: string
): AuxLogEntry | null {
  const parts = splitCustomLine(line);
  if (!parts) return null;
  const { timestamp, level, caller, message } = parts;

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

export const m9aProjectParser: ProjectParser = {
  id: "m9a",
  name: "M9A",
  description: "M9A 项目日志解析器",

  parseMainLog(lines: string[], config): MainLogParseResult {
    const context = parseMainLogBase(lines, config.fileName);

    return {
      events: context.events,
      controllers: context.controllers,
      identifierMap: context.identifierMap,
    };
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
