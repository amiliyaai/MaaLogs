import type { AuxLogEntry } from "../types/logTypes";
import type { AuxLogParser, AuxLogParseResult, AuxLogParserConfig } from "./types";

export abstract class BaseParser implements AuxLogParser {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  abstract parse(lines: string[], config: AuxLogParserConfig): AuxLogParseResult;

  protected createEntry(
    key: string,
    source: string,
    timestamp: string,
    message: string,
    options?: {
      timestampMs?: number;
      level?: string | undefined;
      identifier?: string;
      task_id?: number;
      entry?: string;
      caller?: string;
      details?: Record<string, unknown>;
      fileName?: string;
      lineNumber?: number;
    }
  ): AuxLogEntry {
    return {
      key,
      source,
      timestamp,
      timestampMs: options?.timestampMs,
      level: options?.level || "info",
      message,
      identifier: options?.identifier,
      task_id: options?.task_id,
      entry: options?.entry,
      caller: options?.caller,
      details: options?.details,
      fileName: options?.fileName || "",
      lineNumber: options?.lineNumber || 0
    };
  }

  protected parseTimestamp(ts: string, baseDate: string | null): { timestamp: string; timestampMs: number | null } {
    if (!ts) {
      return { timestamp: "", timestampMs: null };
    }

    const timeOnlyMatch = ts.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
    if (timeOnlyMatch && baseDate) {
      const [, h, m, s, ms] = timeOnlyMatch;
      const timestamp = `${baseDate} ${h}:${m}:${s}${ms ? `.${ms.slice(0, 3)}` : ""}`;
      const msNum = ms ? parseInt(ms.slice(0, 3).padEnd(3, "0"), 10) : 0;
      const date = new Date(`${baseDate}T${h}:${m}:${s}.${String(msNum).padStart(3, "0")}`);
      return { timestamp, timestampMs: date.getTime() };
    }

    const fullMatch = ts.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
    if (fullMatch) {
      const [, datePart, timePart, ms] = fullMatch;
      const timestamp = `${datePart} ${timePart}${ms ? `.${ms.slice(0, 3)}` : ""}`;
      const msNum = ms ? parseInt(ms.slice(0, 3).padEnd(3, "0"), 10) : 0;
      const date = new Date(`${datePart}T${timePart}.${String(msNum).padStart(3, "0")}`);
      return { timestamp, timestampMs: date.getTime() };
    }

    return { timestamp: ts, timestampMs: null };
  }
}
