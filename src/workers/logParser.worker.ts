/**
 * @fileoverview 日志解析 Web Worker
 *
 * 在独立线程中执行日志解析，避免阻塞主线程 UI。
 * 处理：
 * - 文件读取（流式）
 * - 多行日志合并
 * - 主日志/辅助日志解析
 * - 任务结构构建
 *
 * @module workers/logParser.worker
 */

import type {
  EventNotification,
  ControllerInfo,
  TaskInfo,
  RawLine,
  AuxLogEntry,
  SelectedFile,
} from "@/types/logTypes";
import type { ProjectType } from "@/types/parserTypes";
import { projectParserRegistry } from "@/parsers/project-registry";
import { detectProject } from "@/parsers/baseParser";
import { m9aProjectParser, maaEndProjectParser } from "@/parsers";
projectParserRegistry.register(m9aProjectParser);
projectParserRegistry.register(maaEndProjectParser);
import { StringPool, buildIdentifierRanges, buildTasks, associateControllersToTasks, buildFocusLogEntries } from "@/utils/parse";
import { isMainLog, isMaaBakLog } from "@/utils/file";
import { LOG_FILE_NAMES } from "@/config/constants";

interface FileLineEntry {
  file: SelectedFile;
  lines: string[];
  size: number;
}

interface ParseCollections {
  events: EventNotification[];
  allLines: RawLine[];
  auxEntries: AuxLogEntry[];
  controllerInfos: ControllerInfo[];
  eventIdentifierMap: Map<number, string>;
  baseDir?: string;
  logDir?: string;
  saveOnErrorRawLines: string[];
  expectedParams: Map<string, string[]>;
}

interface WorkerMessage {
  type: "init" | "parse" | "cancel";
  payload?: unknown;
}

interface WorkerResponse {
  type: "progress" | "result" | "error" | "ready";
  payload: unknown;
}

function mergeMultilineLogs(lines: string[]): string[] {
  const merged: string[] = [];
  let currentLine = "";

  for (const line of lines) {
    if (line.startsWith("[")) {
      if (currentLine) {
        merged.push(currentLine);
      }
      currentLine = line;
    } else if (currentLine) {
      currentLine += line;
    } else {
      merged.push(line);
    }
  }

  if (currentLine) {
    merged.push(currentLine);
  }

  return merged;
}

function extractTimestamp(line: string): number | null {
  const match = line.match(/^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]?\d{3})\]/);
  if (match) {
    const parsed = Date.parse(match[1].replace(",", "."));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function sendProgress(percentage: number, message?: string): void {
  self.postMessage({
    type: "progress",
    payload: { percentage, message },
  } as WorkerResponse);
}

function sendError(error: Error): void {
  self.postMessage({
    type: "error",
    payload: { message: error.message, stack: error.stack },
  } as WorkerResponse);
}

interface FileContent {
  name: string;
  content: string;
}

async function readSelectedFiles(files: FileContent[]): Promise<{ fileLines: FileLineEntry[]; totalLines: number }> {
  const fileLines: FileLineEntry[] = [];
  let totalLines = 0;

  for (const file of files) {
    const rawLines = file.content.split(/\r?\n/);
    const lines = mergeMultilineLogs(rawLines);
    const contentBlob = new Blob([file.content], { type: "text/plain" });
    const fileObj = new File([contentBlob], file.name, { type: "text/plain" });
    fileLines.push({ 
      file: { 
        name: file.name, 
        size: file.content.length, 
        type: "text/plain", 
        file: fileObj
      }, 
      lines, 
      size: file.content.length 
    });
    totalLines += lines.length;
  }

  return { fileLines, totalLines };
}

function collectRawLines(allLines: RawLine[], fileName: string, lines: string[]): void {
  for (let i = 0; i < lines.length; i++) {
    allLines.push({ fileName, lineNumber: i + 1, line: lines[i] });
  }
}

async function processFileEntries(
  collections: ParseCollections,
  fileLines: FileLineEntry[],
  onProgress: (percentage: number) => void
): Promise<ProjectType> {
  const mainLogEntries: FileLineEntry[] = [];
  const auxLogEntries: FileLineEntry[] = [];
  const maaBakLogEntries: FileLineEntry[] = [];

  for (const entry of fileLines) {
    if (isMaaBakLog(entry.file.name)) {
      maaBakLogEntries.push(entry);
    } else if (isMainLog(entry.file.name)) {
      mainLogEntries.push(entry);
    } else {
      auxLogEntries.push(entry);
    }
  }

  if (maaBakLogEntries.length > 0 && mainLogEntries.length > 0) {
    const sortedBakLogs = maaBakLogEntries.sort((a, b) => {
      const timeA = extractTimestamp(a.lines[0]) || 0;
      const timeB = extractTimestamp(b.lines[0]) || 0;
      return timeA - timeB;
    });

    const mergedBakLines: string[] = [];
    const sourceFiles: string[] = [];
    for (const bak of sortedBakLogs) {
      mergedBakLines.push(...bak.lines);
      sourceFiles.push(bak.file.name);
    }

    for (const entry of mainLogEntries) {
      const mergedLines = [...mergedBakLines, ...entry.lines];
      const mergedContent = mergedLines.join("\n");
      const mergedFile: SelectedFile = {
        name: LOG_FILE_NAMES.MAA_LOG,
        size: mergedContent.length,
        type: "text/plain",
        file: new File([mergedContent], LOG_FILE_NAMES.MAA_LOG, { type: "text/plain" }),
        sourceFiles: [...sourceFiles, entry.file.name],
      };
      entry.file = mergedFile;
      entry.lines = mergedLines;
      entry.size = mergedFile.size;
    }
  }

  const totalLines = fileLines.reduce((sum, e) => sum + e.lines.length, 0);
  let processed = 0;
  let detectedProjectType: ProjectType = "unknown";

  for (const entry of mainLogEntries) {
    collectRawLines(collections.allLines, entry.file.name, entry.lines);
    const detected = detectProject(entry.lines);

    if (detected !== "unknown" && detectedProjectType === "unknown") {
      detectedProjectType = detected;
    }

    const projectParser = projectParserRegistry.get(detected);
    if (!projectParser) {
      const defaultParser = projectParserRegistry.getDefault();
      if (defaultParser) {
        const result = defaultParser.parseMainLog(entry.lines, {
          fileName: entry.file.name,
        });
        collections.events.push(...result.events);
        collections.controllerInfos.push(...result.controllers);
        for (const [idx, identifier] of result.identifierMap) {
          collections.eventIdentifierMap.set(idx, identifier);
        }
        if (result._logDir) {
          collections.logDir = result._logDir;
        }
        collections.saveOnErrorRawLines.push(...result.saveOnErrorRawLines);
        for (const [nodeName, expected] of result.expectedParams) {
          if (!collections.expectedParams.has(nodeName)) {
            collections.expectedParams.set(nodeName, expected);
          }
        }
      }
    } else {
      const result = projectParser.parseMainLog(entry.lines, {
        fileName: entry.file.name,
      });
      collections.events.push(...result.events);
      collections.controllerInfos.push(...result.controllers);
      for (const [idx, identifier] of result.identifierMap) {
        collections.eventIdentifierMap.set(idx, identifier);
      }
      if (result._logDir) {
        collections.logDir = result._logDir;
      }
      collections.saveOnErrorRawLines.push(...result.saveOnErrorRawLines);
      for (const [nodeName, expected] of result.expectedParams) {
        if (!collections.expectedParams.has(nodeName)) {
          collections.expectedParams.set(nodeName, expected);
        }
      }
    }

    processed += entry.lines.length;
    onProgress(Math.round((processed / totalLines) * 80));
  }

  for (const entry of auxLogEntries) {
    collectRawLines(collections.allLines, entry.file.name, entry.lines);
    const projectParser = projectParserRegistry.get(detectedProjectType);
    if (projectParser) {
      const result = projectParser.parseAuxLog(entry.lines, { fileName: entry.file.name });
      collections.auxEntries.push(...result.entries);
    }

    processed += entry.lines.length;
    onProgress(Math.round((processed / totalLines) * 80) + 10);
  }

  return detectedProjectType;
}

interface ParseResult {
  tasks: TaskInfo[];
  rawLines: RawLine[];
  auxEntries: AuxLogEntry[];
  detectedProjectType: ProjectType;
  controllerInfos: ControllerInfo[];
  logDir?: string;
  duration: number;
}

let isCancelled = false;

async function parseFiles(files: FileContent[], baseDir?: string): Promise<ParseResult> {
  isCancelled = false;
  const startTime = performance.now();

  const collections: ParseCollections = {
    events: [],
    allLines: [],
    auxEntries: [],
    controllerInfos: [],
    eventIdentifierMap: new Map(),
    baseDir,
    saveOnErrorRawLines: [],
    expectedParams: new Map(),
  };

  sendProgress(0, "读取文件...");
  const { fileLines } = await readSelectedFiles(files);
  if (isCancelled) throw new Error("解析已取消");

  sendProgress(10, "解析日志...");
  const detectedProjectType = await processFileEntries(collections, fileLines, (p) => {
    sendProgress(10 + Math.round(p * 0.6), "解析中...");
  });
  if (isCancelled) throw new Error("解析已取消");

  sendProgress(75, "构建任务结构...");
  const identifierRanges = buildIdentifierRanges(
    collections.eventIdentifierMap,
    collections.events.length
  );

  const stringPool = new StringPool();
  const tasks = buildTasks(collections.events, stringPool, identifierRanges);
  stringPool.clear();
  if (isCancelled) throw new Error("解析已取消");

  const focusEntries = buildFocusLogEntries(collections.events);
  if (focusEntries.length > 0) {
    collections.auxEntries.push(...focusEntries);
  }

  associateControllersToTasks(tasks as TaskInfo[], collections.controllerInfos);
  if (isCancelled) throw new Error("解析已取消");

  sendProgress(95, "完成");
  const duration = performance.now() - startTime;

  return {
    tasks: tasks as TaskInfo[],
    rawLines: collections.allLines,
    auxEntries: collections.auxEntries,
    detectedProjectType,
    controllerInfos: collections.controllerInfos,
    logDir: collections.logDir,
    duration,
  };
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  if (type === "init") {
    self.postMessage({ type: "ready", payload: null } as WorkerResponse);
    return;
  }

  if (type === "cancel") {
    isCancelled = true;
    return;
  }

  if (type === "parse") {
    try {
      const { files, baseDir } = payload as { files: FileContent[]; baseDir?: string };
      const result = await parseFiles(files, baseDir);
      self.postMessage({
        type: "result",
        payload: result,
      } as WorkerResponse);
    } catch (error) {
      if (error instanceof Error) {
        sendError(error);
      } else {
        sendError(new Error(String(error)));
      }
    }
  }
};

export {};
