/**
 * @fileoverview MaaEnd 项目解析器
 *
 * 本文件实现了 MaaEnd 项目 (https://github.com/MaaEnd/MaaEnd) 的完整日志解析逻辑。
 * MaaEnd 使用 MaaFramework 的标准日志格式。
 *
 * 支持的日志格式：
 * - maa.log: 方括号格式，事件通知使用 !!!OnEventNotify!!!
 * - go-service 日志: JSON 格式或文本格式
 *
 * @module parsers/projects/maaend
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
 * 从日志行中提取事件通知（MaaEnd 原始格式）
 */
function parseMaaEndEventNotification(
  parsed: ReturnType<typeof parseBracketLine>,
  fileName: string,
  lineNumber: number
): EventNotification | null {
  if (!parsed) return null;

  const { message, params } = parsed;

  if (!message.includes("!!!OnEventNotify!!!")) return null;

  const msg = params["msg"];
  const details = params["details"];
  if (!msg) return null;

  return createEventNotification(
    parsed,
    fileName,
    lineNumber,
    msg as string,
    (details as Record<string, unknown>) || {}
  );
}

/**
 * JSON 日志条目结构
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
 */
function parseJsonLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  if (!line.startsWith("{")) return null;

  try {
    const json: JsonLogEntry = JSON.parse(line);

    const timestampRaw = json.time || json.timestamp || "";
    const timestamp = typeof timestampRaw === "string" ? timestampRaw : "";
    const timestampMs = timestamp ? Date.parse(timestamp) : undefined;

    const level = (json.level || json.lvl || "INFO").toString().toUpperCase();

    const message = json.msg || json.message || json.m || "";

    const entry: AuxLogEntry = {
      key: `${fileName}-${lineNumber}`,
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
 */
function parseTextLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  const timestampRegex =
    /^(?:\[)?(\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?)(?:\])?\s*/;
  const match = line.match(timestampRegex);

  if (!match) return null;

  const timestamp = match[1].replace(/\//g, "-").replace("T", " ").replace("Z", "");
  const rest = line.slice(match[0].length);

  const levelMatch = rest.match(/^(\w+)\s*/);
  const level = levelMatch ? levelMatch[1].toUpperCase() : "INFO";
  const message = levelMatch ? rest.slice(levelMatch[0].length) : rest;

  const identifierMatch = message.match(/\[identifier[=_]([a-f0-9-]{36})\]/i);
  const identifier = identifierMatch ? identifierMatch[1] : undefined;

  const taskIdMatch = message.match(/\[task_id[=_](\d+)\]/i);
  const task_id = taskIdMatch ? parseInt(taskIdMatch[1]) : undefined;

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
 * 解析单行辅助日志
 */
function parseAuxLine(line: string, lineNumber: number, fileName: string): AuxLogEntry | null {
  if (line.trim().length === 0) return null;

  const jsonEntry = parseJsonLine(line, lineNumber, fileName);
  if (jsonEntry) return jsonEntry;

  const textEntry = parseTextLine(line, lineNumber, fileName);
  if (textEntry) return textEntry;

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
 * MaaEnd 项目解析器实例
 */
export const maaEndProjectParser: ProjectParser = {
  id: "maaend",
  name: "MaaEnd",
  description: "MaaEnd 项目日志解析器",

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

      const event = parseMaaEndEventNotification(parsed, config.fileName, i + 1);
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
      const entry = parseAuxLine(lines[i], i + 1, fileName);
      if (entry) {
        entries.push(entry);
      }
    }

    return { entries };
  },

  getAuxLogParserInfo(): AuxLogParserInfo {
    return {
      id: "maaend",
      name: "MaaEnd 解析器",
      description: "解析 MaaEnd/go-service 日志文件，支持 JSON 和文本格式",
    };
  },
};
