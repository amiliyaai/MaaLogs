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
} from "@/types/logTypes";
import type { ProjectType } from "@/types/parserTypes";
import { correlateAuxLogs } from "@/parsers";
import {
  attachScreenshotsToTasks,
  attachScreenshotsFromSaveOnError,
  parseOnErrorScreenshotsAsync,
} from "@/parsers/shared";
import { createLogger, setLoggerContext } from "@/utils/logger";
import { useLogParserWorker } from "./useLogParserWorker";

const logger = createLogger("LogParser");

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
  expectedParams: Map<string, string[]>;
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
  const expectedParams = new Map<string, string[]>();

  const worker = useLogParserWorker();

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
    detectedProject.value = "unknown";
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

    detectedProject.value = "unknown";
    parseState.value = "parsing";
    statusMessage.value = "解析中…";
    parseProgress.value = 0;
    logger.info("开始解析日志", {
      fileCount: selectedFiles.value.length,
      files: selectedFiles.value.map((f) => ({ name: f.name, size: f.size })),
    });

    try {
      const baseDir = _config.baseDir ? _config.baseDir() : undefined;

      const workerResult = await worker.parse(
        selectedFiles.value,
        baseDir,
        (progress) => {
          parseProgress.value = progress.percentage;
          statusMessage.value = progress.message || `解析中… ${progress.percentage}%`;
        }
      );

      detectedProject.value = workerResult.detectedProjectType;
      rawLines.value = workerResult.rawLines;
      tasks.value = workerResult.tasks;
      const auxEntries = workerResult.auxEntries;
      const logDir = workerResult.logDir;

      logger.info("Worker 解析完成，开始关联截图", {
        tasksCount: tasks.value.length,
        logDir: logDir || baseDir || "无",
      });

      const screenshotStartTime = performance.now();
      await attachScreenshotsToParsedTasks(tasks.value, [], baseDir || logDir);
      logger.debug("截图关联完成", {
        durationMs: Math.round(performance.now() - screenshotStartTime),
      });

      logger.info("开始关联辅助日志", {
        auxEntriesCount: auxEntries.length,
        tasksCount: tasks.value.length,
      });

      const correlationStartTime = performance.now();
      auxLogs.value = correlateAuxLogs(auxEntries, tasks.value);
      logCorrelationStats(auxLogs.value);
      logger.debug("辅助日志关联完成", {
        durationMs: Math.round(performance.now() - correlationStartTime),
      });

      parseState.value = "done";

      const totalDuration = performance.now() - totalStartTime;
      statusMessage.value = buildStatusMessage(tasks.value.length, auxLogs.value.length);
      logger.info("日志解析完成", {
        tasksCount: tasks.value.length,
        auxLogsCount: auxLogs.value.length,
        rawLinesCount: rawLines.value.length,
        detectedProject: detectedProject.value,
        workerDurationMs: Math.round(workerResult.duration),
        totalDurationMs: Math.round(totalDuration),
      });
    } catch (error) {
      parseState.value = "ready";
      statusMessage.value = "解析失败，请检查日志内容";
      parseProgress.value = 0;
      logger.error("解析失败", {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
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
    expectedParams,
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
