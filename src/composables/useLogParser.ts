/**
 * @fileoverview 日志解析 Composable
 *
 * 本文件实现了日志解析功能的 Vue Composable，是应用的核心模块。
 * 负责：
 * - 解析 maa.log 主日志文件
 * - 解析 go-service 日志
 * - 构建任务和节点结构
 * - 关联 Custom 日志与任务
 * - 解析 Pipeline 配置文件
 *
 * @module composables/useLogParser
 * @author MaaLogs Team
 * @license MIT
 */

import { ref, computed, shallowRef, type Ref, type ComputedRef } from "vue";
import type {
  TaskInfo,
  RawLine,
  AuxLogEntry,
  SelectedFile,
  EventNotification,
  ControllerInfo,
} from "../types/logTypes";
import { projectParserRegistry, correlateAuxLogs, detectProject } from "../parsers";
import { type ProjectType } from "../parsers/baseParser";
import {
  StringPool,
  buildIdentifierRanges,
  buildTasks,
  associateControllersToTasks,
  buildFocusLogEntries,
} from "../utils/parse";
import { parseOnErrorScreenshotsAsync, attachScreenshotsToTasks, attachScreenshotsFromSaveOnError } from "../parsers/shared";
import { isMainLog } from "../utils/file";
import { createLogger, setLoggerContext } from "../utils/logger";

const logger = createLogger("LogParser");

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

type FileLineEntry = { file: SelectedFile; lines: string[] };

type ParseCollections = {
  events: EventNotification[];
  allLines: RawLine[];
  auxEntries: AuxLogEntry[];
  controllerInfos: ControllerInfo[];
  eventIdentifierMap: Map<number, string>;
  logDir?: string;
  baseDir?: string;
  saveOnErrorRawLines: string[];
};

async function attachScreenshotsToParsedTasks(
  tasks: TaskInfo[],
  saveOnErrorRawLines: string[],
  logDir?: string
): Promise<void> {
  try {
    attachScreenshotsFromSaveOnError(tasks, saveOnErrorRawLines);
  } catch {
    // 忽略错误
  }

  if (!logDir) return;
  try {
    const screenshots = await parseOnErrorScreenshotsAsync(logDir);
    if (screenshots.length === 0) return;
    attachScreenshotsToTasks(tasks, screenshots);
  } catch {
    // 忽略错误
  }
}

function logCorrelationStats(auxLogs: AuxLogEntry[]): void {
  const stats = {
    total: auxLogs.length,
    matched: auxLogs.filter((item) => item.correlation?.status === "matched").length,
    unmatched: auxLogs.filter((item) => item.correlation?.status === "unmatched").length,
    failed: auxLogs.filter((item) => item.correlation?.status === "failed").length,
  };
  logger.info("Custom日志关联完成", stats);
}

async function readSelectedFiles(
  files: SelectedFile[]
): Promise<{ fileLines: FileLineEntry[]; totalLines: number }> {
  const startTime = performance.now();
  logger.info("开始读取文件", { fileCount: files.length, files: files.map(f => ({ name: f.name, size: f.size })) });

  const fileLines: FileLineEntry[] = [];
  let totalLines = 0;
  for (const file of files) {
    const fileStartTime = performance.now();
    const text = await file.file.text();
    const rawLines = text.split(/\r?\n/);
    const lines = mergeMultilineLogs(rawLines);
    fileLines.push({ file, lines });
    totalLines += lines.length;

    const fileDuration = performance.now() - fileStartTime;
    logger.debug("文件读取完成", {
      fileName: file.name,
      rawLines: rawLines.length,
      mergedLines: lines.length,
      sizeBytes: file.size,
      durationMs: Math.round(fileDuration)
    });
  }

  const totalDuration = performance.now() - startTime;
  logger.info("文件读取阶段完成", { totalFiles: files.length, totalLines, durationMs: Math.round(totalDuration) });
  return { fileLines, totalLines };
}

function collectRawLines(allLines: RawLine[], fileName: string, lines: string[]): void {
  for (let i = 0; i < lines.length; i++) {
    allLines.push({ fileName, lineNumber: i + 1, line: lines[i] });
  }
}

function mergeMainLogResult(
  collections: ParseCollections,
  result: {
    events: EventNotification[];
    controllers: ControllerInfo[];
    identifierMap: Map<number, string>;
    _logDir?: string;
    saveOnErrorRawLines: string[];
  }
): void {
  const startIndex = collections.events.length;
  collections.events.push(...result.events);
  collections.controllerInfos.push(...result.controllers);
  for (const [idx, identifier] of result.identifierMap) {
    collections.eventIdentifierMap.set(startIndex + idx, identifier);
  }
  if (result._logDir) {
    collections.logDir = result._logDir;
  }
  collections.saveOnErrorRawLines.push(...result.saveOnErrorRawLines);
}

function parseMainLogFile(
  collections: ParseCollections,
  lines: string[],
  fileName: string
): ProjectType {
  const detected = detectProject(lines);
  logger.info("开始解析主日志文件", { fileName, detected });
  console.log("检测到项目类型：" + detected);

  if (detected !== "unknown") {
    const parser = getProjectParser(detected);
    if (parser) {
      const result = parser.parseMainLog(lines, { fileName });
      mergeMainLogResult(collections, result);
      return detected;
    }
  }

  const projectParser = projectParserRegistry.getDefault();
  if (!projectParser) return "unknown";
  const result = projectParser.parseMainLog(lines, { fileName });
  mergeMainLogResult(collections, result);
  return result.detectedProject || "unknown";
}

function parseAuxLogFile(
  collections: ParseCollections,
  lines: string[],
  fileName: string,
  detectedProjectType: ProjectType
): void {
  const parserId = detectedProjectType === "m9a" ? "m9a" : "maaend";
  const projectParser = getProjectParser(parserId);
  if (!projectParser) return;
  const result = projectParser.parseAuxLog(lines, { fileName });
  collections.auxEntries.push(...result.entries);
}

interface FileParseProgress {
  processed: number;
  totalLines: number;
  detectedProjectType: ProjectType;
}

function processFileEntries(
  collections: ParseCollections,
  fileLines: { file: SelectedFile; lines: string[] }[],
  onProgress: (percentage: number) => void
): FileParseProgress {
  const startTime = performance.now();
  const mainLogEntries: { file: SelectedFile; lines: string[] }[] = [];
  const auxLogEntries: { file: SelectedFile; lines: string[] }[] = [];

  for (const entry of fileLines) {
    if (isMainLog(entry.file.name)) {
      mainLogEntries.push(entry);
    } else {
      auxLogEntries.push(entry);
    }
  }

  logger.info("文件分类完成", {
    mainLogCount: mainLogEntries.length,
    auxLogCount: auxLogEntries.length,
    mainLogFiles: mainLogEntries.map(e => e.file.name),
    auxLogFiles: auxLogEntries.map(e => e.file.name)
  });

  const totalLines = fileLines.reduce((sum, e) => sum + e.lines.length, 0);
  let processed = 0;
  let detectedProjectType: ProjectType = "unknown";

  logger.info("开始解析主日志文件", { count: mainLogEntries.length });

  for (const entry of mainLogEntries) {
    const { file, lines } = entry;
    const fileStartTime = performance.now();
    collectRawLines(collections.allLines, file.name, lines);
    const detected = parseMainLogFile(collections, lines, file.name);
    if (detected !== "unknown") {
      detectedProjectType = detected;
    }
    processed += lines.length;
    onProgress(Math.round((processed / totalLines) * 100));

    const fileDuration = performance.now() - fileStartTime;
    logger.debug("主日志解析完成", {
      fileName: file.name,
      linesCount: lines.length,
      eventsCount: collections.events.length,
      detectedProject: detected,
      durationMs: Math.round(fileDuration)
    });
  }

  logger.info("开始解析辅助日志文件", { count: auxLogEntries.length });

  for (const entry of auxLogEntries) {
    const { file, lines } = entry;
    const fileStartTime = performance.now();
    collectRawLines(collections.allLines, file.name, lines);
    parseAuxLogFile(collections, lines, file.name, detectedProjectType);
    processed += lines.length;
    onProgress(Math.round((processed / totalLines) * 100));

    const fileDuration = performance.now() - fileStartTime;
    logger.debug("辅助日志解析完成", {
      fileName: file.name,
      linesCount: lines.length,
      auxEntriesCount: collections.auxEntries.length,
      durationMs: Math.round(fileDuration)
    });
  }

  const totalDuration = performance.now() - startTime;
  logger.info("文件解析阶段完成", {
    totalLines,
    processedLines: processed,
    eventsCount: collections.events.length,
    auxEntriesCount: collections.auxEntries.length,
    detectedProjectType,
    durationMs: Math.round(totalDuration)
  });

  return { processed, totalLines, detectedProjectType };
}

function getProjectParser(parserId: string) {
  const projectParser = projectParserRegistry.get(parserId);
  if (!projectParser) {
    logger.warn("未找到选择的解析器", { parserId });
    return null;
  }
  return projectParser;
}

function buildTaskMessage(taskCount: number): string {
  return taskCount > 0 ? `解析完成，共 ${taskCount} 个任务` : "解析完成，未识别到任务";
}

function buildStatusMessage(taskCount: number, auxLogCount: number): string {
  if (auxLogCount > 0) return `${buildTaskMessage(taskCount)}，Custom日志 ${auxLogCount} 条`;
  return buildTaskMessage(taskCount);
}

/**
 * 解析状态类型
 *
 * - idle: 初始状态，等待文件选择
 * - ready: 文件已选择，等待解析
 * - parsing: 正在解析中
 * - done: 解析完成
 */
export type ParseState = "idle" | "ready" | "parsing" | "done";

/**
 * 日志解析器配置（保留用于未来扩展）
 */
export interface LogParserConfig {
  /** 分块解析的块大小（未实现） */
  chunkSize?: number;
  baseDir?: () => string;
}

/**
 * 日志解析器返回值
 *
 * 包含日志解析的所有状态和操作方法。
 *
 * @property {Ref<ParseState>} parseState - 解析状态
 * @property {Ref<number>} parseProgress - 解析进度（百分比）
 * @property {Ref<string>} statusMessage - 状态消息
 * @property {Ref<TaskInfo[]>} tasks - 解析后的任务列表
 * @property {Ref<RawLine[]>} rawLines - 原始行数据
 * @property {Ref<AuxLogEntry[]>} auxLogs - 辅助日志条目
 * @property {Ref<ProjectType>} detectedProject - 检测到的项目类型
 * @property {Ref<string>} selectedProcessId - 当前选择的进程 ID
 * @property {Ref<string>} selectedThreadId - 当前选择的线程 ID
 * @property {ComputedRef<{label: string, value: string}[]>} processOptions - 进程选项列表
 * @property {ComputedRef<{label: string, value: string}[]>} threadOptions - 线程选项列表
 * @property {ComputedRef<TaskInfo[]>} filteredTasks - 过滤后的任务列表
 * @property {function} handleParse - 执行解析
 * @property {function} resetParseState - 重置解析状态
 */
export interface LogParserResult {
  parseState: Ref<ParseState>;
  parseProgress: Ref<number>;
  statusMessage: Ref<string>;
  tasks: Ref<TaskInfo[]>;
  rawLines: Ref<RawLine[]>;
  auxLogs: Ref<AuxLogEntry[]>;
  detectedProject: Ref<ProjectType>;
  selectedProcessId: Ref<string>;
  selectedThreadId: Ref<string>;
  processOptions: ComputedRef<{ label: string; value: string }[]>;
  threadOptions: ComputedRef<{ label: string; value: string }[]>;
  filteredTasks: ComputedRef<TaskInfo[]>;
  handleParse: () => Promise<void>;
  resetParseState: () => void;
}

/**
 * 日志解析器 Composable
 *
 * 封装日志解析的核心逻辑，包括任务构建、辅助日志关联等。
 * 这是应用的核心模块，负责将原始日志转换为结构化数据。
 *
 * @param {LogParserConfig} [config={}] - 解析器配置
 * @returns {LogParserResult} 解析器的状态和方法
 *
 * @example
 * const {
 *   parseState,
 *   tasks,
 *   handleParse,
 *   resetParseState
 * } = useLogParser({ chunkSize: 500 });
 *
 * // 选择文件后调用解析
 * await handleParse();
 */
export function useLogParser(_config: LogParserConfig = {}): LogParserResult {
  const parseState = ref<ParseState>("idle");
  const parseProgress = ref(0);
  const statusMessage = ref("请先选择日志文件");
  const tasks = shallowRef<TaskInfo[]>([]);
  const rawLines = ref<RawLine[]>([]);
  const auxLogs = ref<AuxLogEntry[]>([]);
  const detectedProject = ref<ProjectType>("unknown");
  const selectedProcessId = ref("all");
  const selectedThreadId = ref("all");

  // ============================================
  // 计算属性
  // ============================================

  /**
   * 进程选项列表
   *
   * 从所有任务中提取唯一的进程 ID，生成下拉选项。
   */
  const processOptions = computed(() => {
    const idSet = new Set<string>();
    for (const task of tasks.value) {
      if (task.processId) {
        idSet.add(task.processId);
      }
    }
    const ids = Array.from(idSet);
    return [{ label: "全部进程", value: "all" }, ...ids.map((id) => ({ label: id, value: id }))];
  });

  /**
   * 线程选项列表
   *
   * 从所有任务中提取唯一的线程 ID，生成下拉选项。
   */
  const threadOptions = computed(() => {
    const idSet = new Set<string>();
    for (const task of tasks.value) {
      if (task.threadId) {
        idSet.add(task.threadId);
      }
    }
    const ids = Array.from(idSet);
    return [{ label: "全部线程", value: "all" }, ...ids.map((id) => ({ label: id, value: id }))];
  });

  /**
   * 过滤后的任务列表
   *
   * 根据选择的进程和线程 ID 过滤任务。
   */
  const filteredTasks = computed(() => {
    const result: TaskInfo[] = [];
    const processId = selectedProcessId.value;
    const threadId = selectedThreadId.value;
    for (const task of tasks.value) {
      const matchesProcess = processId === "all" || task.processId === processId;
      const matchesThread = threadId === "all" || task.threadId === threadId;
      if (matchesProcess && matchesThread) {
        result.push(task);
      }
    }
    return result;
  });

  // ============================================
  // 解析方法
  // ============================================

  /**
   * 重置解析状态
   *
   * 清空所有解析结果，恢复到初始状态。
   */
  function resetParseState(): void {
    tasks.value = [];
    rawLines.value = [];
    auxLogs.value = [];
    selectedProcessId.value = "all";
    selectedThreadId.value = "all";
    parseProgress.value = 0;
    parseState.value = "idle";
    statusMessage.value = "请先选择日志文件";
  }

  async function handleParse(): Promise<void> {
    const totalStartTime = performance.now();
    setLoggerContext({
      threadId: selectedThreadId.value === "all" ? "ui" : selectedThreadId.value,
    });

    parseState.value = "parsing";
    statusMessage.value = "解析中…";
    parseProgress.value = 0;
    logger.info("开始解析日志", {
      fileCount: selectedFiles.value.length,
      files: selectedFiles.value.map(f => ({ name: f.name, size: f.size }))
    });

    try {
      const collections: ParseCollections = {
        events: [],
        allLines: [],
        auxEntries: [],
        controllerInfos: [],
        eventIdentifierMap: new Map(),
        baseDir: _config.baseDir ? _config.baseDir() : undefined,
        saveOnErrorRawLines: [],
      };

      const { fileLines, totalLines } = await readSelectedFiles(selectedFiles.value);
      logger.info("文件读取完成，开始解析", { totalLines });

      const progress = processFileEntries(
        collections,
        fileLines,
        (percentage) => {
          parseProgress.value = percentage;
          statusMessage.value = `解析中… ${percentage}%`;
        }
      );

      detectedProject.value = progress.detectedProjectType;
      rawLines.value = collections.allLines;

      logger.info("开始构建任务结构", {
        eventsCount: collections.events.length,
        identifierMapSize: collections.eventIdentifierMap.size
      });

      const buildStartTime = performance.now();
      const identifierRanges = buildIdentifierRanges(
        collections.eventIdentifierMap,
        collections.events.length
      );
      logger.debug("identifier 范围", {
        count: identifierRanges.length,
        samples: identifierRanges.slice(0, 5),
      });

      const stringPool = new StringPool();
      tasks.value = buildTasks(collections.events, stringPool, identifierRanges);
      stringPool.clear();
      const buildDuration = performance.now() - buildStartTime;

      logger.info("任务构建完成", {
        tasksCount: tasks.value.length,
        durationMs: Math.round(buildDuration)
      });

      const focusStartTime = performance.now();
      const focusEntries = buildFocusLogEntries(collections.events);
      if (focusEntries.length > 0) {
        collections.auxEntries.push(...focusEntries);
        logger.debug("Focus 日志条目构建完成", {
          focusEntriesCount: focusEntries.length,
          durationMs: Math.round(performance.now() - focusStartTime)
        });
      }

      associateControllersToTasks(tasks.value as TaskInfo[], collections.controllerInfos);

      logger.info("开始关联截图", {
        saveOnErrorLines: collections.saveOnErrorRawLines.length,
        logDir: collections.logDir || collections.baseDir || "无"
      });

      const screenshotStartTime = performance.now();
      await attachScreenshotsToParsedTasks(tasks.value, collections.saveOnErrorRawLines, collections.baseDir || collections.logDir);
      logger.debug("截图关联完成", {
        durationMs: Math.round(performance.now() - screenshotStartTime)
      });

      logger.info("开始关联辅助日志", {
        auxEntriesCount: collections.auxEntries.length,
        tasksCount: tasks.value.length
      });

      const correlationStartTime = performance.now();
      auxLogs.value = correlateAuxLogs(collections.auxEntries, tasks.value);
      logCorrelationStats(auxLogs.value);
      logger.debug("辅助日志关联完成", {
        durationMs: Math.round(performance.now() - correlationStartTime)
      });

      parseState.value = "done";

      const totalDuration = performance.now() - totalStartTime;
      statusMessage.value = buildStatusMessage(tasks.value.length, auxLogs.value.length);
      logger.info("日志解析完成", {
        tasksCount: tasks.value.length,
        auxLogsCount: auxLogs.value.length,
        rawLinesCount: rawLines.value.length,
        detectedProject: detectedProject.value,
        totalDurationMs: Math.round(totalDuration)
      });
    } catch (error) {
      parseState.value = "ready";
      statusMessage.value = "解析失败，请检查日志内容";
      parseProgress.value = 0;
      logger.error("解析失败", {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  return {
    parseState,
    parseProgress,
    statusMessage,
    tasks,
    rawLines,
    auxLogs,
    detectedProject,
    selectedProcessId,
    selectedThreadId,
    processOptions,
    threadOptions,
    filteredTasks,
    handleParse,
    resetParseState,
  };
}

/**
 * 选中的文件列表（模块级状态）
 *
 * 需要外部通过 setSelectedFiles 注入。
 * 这是为了在解析时访问文件列表。
 */
const selectedFiles = ref<SelectedFile[]>([]);

/**
 * 设置选中的文件列表
 *
 * 由外部组件调用，将文件列表注入到解析器中。
 *
 * @param {SelectedFile[]} files - 选中的文件列表
 *
 * @example
 * // 在文件选择组件中
 * setSelectedFiles(files);
 * // 然后调用解析
 * handleParse();
 */
export function setSelectedFiles(files: SelectedFile[]): void {
  selectedFiles.value = files;
}
