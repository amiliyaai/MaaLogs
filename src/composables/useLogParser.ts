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
import type { AuxLogParserInfo } from "../types/parserTypes";
import { projectParserRegistry, correlateAuxLogs } from "../parsers";
import {
  StringPool,
  buildIdentifierRanges,
  buildTasks,
  associateControllersToTasks,
} from "../utils/parse";
import { isMainLog } from "../utils/file";
import { createLogger, setLoggerContext } from "../utils/logger";
import { useStorage } from "./useStore";

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
};

async function readSelectedFiles(
  files: SelectedFile[]
): Promise<{ fileLines: FileLineEntry[]; totalLines: number }> {
  const fileLines: FileLineEntry[] = [];
  let totalLines = 0;
  for (const file of files) {
    const text = await file.file.text();
    const rawLines = text.split(/\r?\n/);
    const lines = mergeMultilineLogs(rawLines);
    fileLines.push({ file, lines });
    totalLines += lines.length;
  }
  return { fileLines, totalLines };
}

function collectRawLines(allLines: RawLine[], fileName: string, lines: string[]): void {
  for (let i = 0; i < lines.length; i++) {
    allLines.push({ fileName, lineNumber: i + 1, line: lines[i] });
  }
}

function mergeMainLogResult(
  collections: ParseCollections,
  result: { events: EventNotification[]; controllers: ControllerInfo[]; identifierMap: Map<number, string> }
): void {
  const startIndex = collections.events.length;
  collections.events.push(...result.events);
  collections.controllerInfos.push(...result.controllers);
  for (const [idx, identifier] of result.identifierMap) {
    collections.eventIdentifierMap.set(startIndex + idx, identifier);
  }
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
 * @property {Ref<string>} selectedParserId - 当前选择的解析器 ID
 * @property {Ref<AuxLogParserInfo[]>} parserOptions - 可用的解析器列表
 * @property {Ref<string>} selectedProcessId - 当前选择的进程 ID
 * @property {Ref<string>} selectedThreadId - 当前选择的线程 ID
 * @property {ComputedRef<{label: string, value: string}[]>} processOptions - 进程选项列表
 * @property {ComputedRef<{label: string, value: string}[]>} threadOptions - 线程选项列表
 * @property {ComputedRef<TaskInfo[]>} filteredTasks - 过滤后的任务列表
 * @property {function} handleParse - 执行解析
 * @property {function} resetParseState - 重置解析状态
 */
export interface LogParserResult {
  /** 解析状态 */
  parseState: Ref<ParseState>;
  /** 解析进度（百分比） */
  parseProgress: Ref<number>;
  /** 状态消息 */
  statusMessage: Ref<string>;
  /** 解析后的任务列表 */
  tasks: Ref<TaskInfo[]>;
  /** 原始行数据 */
  rawLines: Ref<RawLine[]>;
  /** 辅助日志条目 */
  auxLogs: Ref<AuxLogEntry[]>;
  /** 当前选择的解析器 ID */
  selectedParserId: Ref<string>;
  /** 可用的解析器列表 */
  parserOptions: Ref<AuxLogParserInfo[]>;
  /** 当前选择的进程 ID */
  selectedProcessId: Ref<string>;
  /** 当前选择的线程 ID */
  selectedThreadId: Ref<string>;
  /** 进程选项列表 */
  processOptions: ComputedRef<{ label: string; value: string }[]>;
  /** 线程选项列表 */
  threadOptions: ComputedRef<{ label: string; value: string }[]>;
  /** 过滤后的任务列表 */
  filteredTasks: ComputedRef<TaskInfo[]>;
  /** 执行解析 */
  handleParse: () => Promise<void>;
  /** 重置解析状态 */
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

  // ============================================
  // 响应式状态
  // ============================================

  /** 解析状态 */
  const parseState = ref<ParseState>("idle");
  /** 解析进度（百分比） */
  const parseProgress = ref(0);
  /** 状态消息 */
  const statusMessage = ref("请先选择日志文件");
  /** 解析后的任务列表 */
  const tasks = shallowRef<TaskInfo[]>([]);
  /** 原始行数据 */
  const rawLines = ref<RawLine[]>([]);
  /** 辅助日志条目 */
  const auxLogs = ref<AuxLogEntry[]>([]);
  /** 当前选择的解析器 ID（持久化） */
  const selectedParserId = useStorage<string>("selectedParserId", "maaend");
  /** 可用的解析器列表 */
  const parserOptions = ref<AuxLogParserInfo[]>(projectParserRegistry.getInfoList());
  /** 当前选择的进程 ID */
  const selectedProcessId = ref("all");
  /** 当前选择的线程 ID */
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

  /**
   * 执行日志解析主流程
   *
   * 这是解析的核心函数，处理流程：
   * 1. 读取所有选中的文件
   * 2. 解析 JSON 配置文件（Pipeline）
   * 3. 解析 maa.log 主日志，提取事件和任务
   * 4. 解析 go-service 辅助日志
   * 5. 关联辅助日志与任务
   *
   * 使用分块处理避免阻塞主线程。
   */
  async function handleParse(): Promise<void> {
    // 设置日志上下文
    setLoggerContext({
      threadId: selectedThreadId.value === "all" ? "ui" : selectedThreadId.value,
    });

    parseState.value = "parsing";
    statusMessage.value = "解析中…";
    parseProgress.value = 0;
    logger.info("开始解析日志");

    try {
      const collections: ParseCollections = {
        events: [],
        allLines: [],
        auxEntries: [],
        controllerInfos: [],
        eventIdentifierMap: new Map<number, string>(),
      };
      const { fileLines, totalLines } = await readSelectedFiles(selectedFiles.value);
      let processed = 0;

      for (const entry of fileLines) {
        const { file, lines } = entry;
        const projectParser = getProjectParser(selectedParserId.value);
        if (!projectParser) continue;
        collectRawLines(collections.allLines, file.name, lines);
        if (isMainLog(file.name)) {
          const result = projectParser.parseMainLog(lines, { fileName: file.name });
          mergeMainLogResult(collections, result);
        } else {
          const result = projectParser.parseAuxLog(lines, { fileName: file.name });
          collections.auxEntries.push(...result.entries);
        }

        processed += lines.length;
        const percentage = totalLines > 0 ? Math.round((processed / totalLines) * 100) : 0;
        parseProgress.value = percentage;
        statusMessage.value = `解析中… ${percentage}%`;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      rawLines.value = collections.allLines;
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

      associateControllersToTasks(tasks.value as TaskInfo[], collections.controllerInfos);

      auxLogs.value = correlateAuxLogs(collections.auxEntries, tasks.value);
      logger.info("Custom日志关联完成", {
        total: auxLogs.value.length,
        matched: auxLogs.value.filter((item) => item.correlation?.status === "matched").length,
        unmatched: auxLogs.value.filter((item) => item.correlation?.status === "unmatched").length,
        failed: auxLogs.value.filter((item) => item.correlation?.status === "failed").length,
      });

      parseState.value = "done";

      statusMessage.value = buildStatusMessage(tasks.value.length, auxLogs.value.length);
    } catch (error) {
      parseState.value = "ready";
      statusMessage.value = "解析失败，请检查日志内容";
      parseProgress.value = 0;
      logger.error("解析失败", { error: String(error) });
    }
  }

  return {
    parseState,
    parseProgress,
    statusMessage,
    tasks,
    rawLines,
    auxLogs,
    selectedParserId,
    parserOptions,
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
