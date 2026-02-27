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

import { ref, computed, type Ref, type ComputedRef } from "vue";
import type {
  TaskInfo,
  RawLine,
  AuxLogEntry,
  PipelineCustomActionInfo,
  SelectedFile,
  EventNotification,
  ControllerInfo,
} from "../types/logTypes";
import { projectParserRegistry, correlateAuxLogs } from "../parsers";
import type { AuxLogParserInfo } from "../parsers/types";
import {
  StringPool,
  parseLine,
  parseEventNotification,
  extractIdentifierFromLine,
  buildIdentifierRanges,
  buildTasks,
  parseControllerInfo,
  associateControllersToTasks,
} from "../utils/parse";
import { parsePipelineFile, isGoServiceLog, extractDateFromTimestamp } from "../utils/file";
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
 * 日志解析器配置
 *
 * @property {number} [chunkSize] - 分块解析的块大小（行数）
 */
export interface LogParserConfig {
  /** 分块解析的块大小，默认 1000 行 */
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
 * @property {Ref<Record<string, PipelineCustomActionInfo[]>>} pipelineCustomActions - Pipeline Custom Action 映射
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
  /** Pipeline Custom Action 映射 */
  pipelineCustomActions: Ref<Record<string, PipelineCustomActionInfo[]>>;
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
export function useLogParser(config: LogParserConfig = {}): LogParserResult {
  const { chunkSize = 1000 } = config;

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
  const tasks = ref<TaskInfo[]>([]);
  /** 原始行数据 */
  const rawLines = ref<RawLine[]>([]);
  /** 辅助日志条目 */
  const auxLogs = ref<AuxLogEntry[]>([]);
  /** Pipeline Custom Action 映射 */
  const pipelineCustomActions = ref<Record<string, PipelineCustomActionInfo[]>>({});
  /** 当前选择的解析器 ID */
  const selectedParserId = ref<string>("maaend");
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
    const ids = Array.from(new Set(tasks.value.map((task) => task.processId).filter(Boolean)));
    return [{ label: "全部进程", value: "all" }, ...ids.map((id) => ({ label: id, value: id }))];
  });

  /**
   * 线程选项列表
   *
   * 从所有任务中提取唯一的线程 ID，生成下拉选项。
   */
  const threadOptions = computed(() => {
    const ids = Array.from(new Set(tasks.value.map((task) => task.threadId).filter(Boolean)));
    return [{ label: "全部线程", value: "all" }, ...ids.map((id) => ({ label: id, value: id }))];
  });

  /**
   * 过滤后的任务列表
   *
   * 根据选择的进程和线程 ID 过滤任务。
   */
  const filteredTasks = computed(() => {
    return tasks.value.filter((task) => {
      const matchesProcess =
        selectedProcessId.value === "all" || task.processId === selectedProcessId.value;
      const matchesThread =
        selectedThreadId.value === "all" || task.threadId === selectedThreadId.value;
      return matchesProcess && matchesThread;
    });
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
    pipelineCustomActions.value = {};
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
      // 初始化数据结构
      const events: EventNotification[] = [];
      const allLines: RawLine[] = [];
      const auxEntries: AuxLogEntry[] = [];
      const controllerInfos: ControllerInfo[] = [];
      const eventIdentifierMap = new Map<number, string>();
      let lastIdentifierForEvent: string | null = null;
      const pipelineActions: Record<string, PipelineCustomActionInfo[]> = {};
      const pipelineKeywords: Record<string, string[]> = {};
      let totalLines = 0;
      const fileLines: { file: SelectedFile; lines: string[] }[] = [];

      // 读取所有文件内容
      for (const file of selectedFiles.value) {
        const text = await file.file.text();
        const rawLines = text.split(/\r?\n/);
        const lines = mergeMultilineLogs(rawLines);
        fileLines.push({ file, lines });
        totalLines += lines.length;
      }

      let processed = 0;
      let baseDate: string | null = null;

      // 处理每个文件
      for (const entry of fileLines) {
        const { file, lines } = entry;
        const lowerName = file.name.toLowerCase();

        // 处理 JSON 配置文件
        if (lowerName.endsWith(".json") || lowerName.endsWith(".jsonc")) {
          const content = lines.join("\n");
          const parsed = parsePipelineFile(content, file.name);

          // 合并 Custom Actions
          for (const [key, value] of Object.entries(parsed.actions)) {
            if (!pipelineActions[key]) {
              pipelineActions[key] = [];
            }
            pipelineActions[key] = pipelineActions[key].concat(value);
          }

          // 合并关键词
          for (const [key, value] of Object.entries(parsed.keywords)) {
            if (!pipelineKeywords[key]) {
              pipelineKeywords[key] = [];
            }
            pipelineKeywords[key] = pipelineKeywords[key].concat(value);
          }

          processed += lines.length;
          const percentage = totalLines > 0 ? Math.round((processed / totalLines) * 100) : 0;
          parseProgress.value = percentage;
          statusMessage.value = `解析中… ${percentage}%`;
          await new Promise((resolve) => setTimeout(resolve, 0));
          continue;
        }

        // 判断是否需要解析辅助日志
        const shouldParseAuxLogs = isGoServiceLog(file.name);

        // 使用用户选择的项目解析器
        const projectParser = projectParserRegistry.get(selectedParserId.value);
        if (!projectParser) {
          logger.warn("未找到选择的解析器", { parserId: selectedParserId.value });
        }

        // 分块处理日志文件
        for (let startIdx = 0; startIdx < lines.length; startIdx += chunkSize) {
          const endIdx = Math.min(startIdx + chunkSize, lines.length);

          for (let i = startIdx; i < endIdx; i++) {
            const originalLine = lines[i];
            const lineNumber = i + 1;
            allLines.push({ fileName: file.name, lineNumber, line: originalLine });

            const rawLine = originalLine.trim();
            if (!rawLine) continue;

            const parsed = parseLine(rawLine, lineNumber);
            if (!parsed) continue;

            // 提取基准日期
            if (baseDate === null && parsed.timestamp) {
              baseDate = extractDateFromTimestamp(parsed.timestamp);
              if (baseDate) {
                logger.debug("从 maa.log 提取基准日期", { baseDate, from: parsed.timestamp });
              }
            }

            // 处理事件通知（支持原始格式和 M9A 格式）
            const event = parseEventNotification(parsed, file.name);
            if (event) {
              events.push(event);
              const identifier = extractIdentifierFromLine(rawLine);
              if (identifier) {
                lastIdentifierForEvent = identifier;
              }
              if (lastIdentifierForEvent) {
                eventIdentifierMap.set(events.length - 1, lastIdentifierForEvent);
              }
            } else {
              // 提取 identifier
              const identifier = extractIdentifierFromLine(rawLine);
              if (identifier) {
                lastIdentifierForEvent = identifier;
              }
              // 提取控制器信息
              const controllerInfo = parseControllerInfo(parsed, file.name);
              if (controllerInfo) {
                controllerInfos.push(controllerInfo);
              }
            }
          }

          // 解析辅助日志
          if (shouldParseAuxLogs && projectParser) {
            const chunkLines = lines.slice(startIdx, endIdx);
            const parseResult = projectParser.parseAuxLog(chunkLines, { baseDate, fileName: file.name });
            for (const auxLog of parseResult.entries) {
              auxLog.lineNumber = startIdx + auxLog.lineNumber;
              auxEntries.push(auxLog);
            }
          }

          // 更新进度
          processed += endIdx - startIdx;
          const percentage = totalLines > 0 ? Math.round((processed / totalLines) * 100) : 0;
          parseProgress.value = percentage;
          statusMessage.value = `解析中… ${percentage}%`;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // 构建最终结果
      rawLines.value = allLines;
      const identifierRanges = buildIdentifierRanges(eventIdentifierMap, events.length);
      logger.debug("identifier 范围", {
        count: identifierRanges.length,
        samples: identifierRanges.slice(0, 5),
      });

      // 构建任务列表
      const stringPool = new StringPool();
      tasks.value = buildTasks(events, stringPool, identifierRanges);
      stringPool.clear();

      // 关联控制器信息到任务
      associateControllersToTasks(tasks.value, controllerInfos);

      // 关联辅助日志
      auxLogs.value = correlateAuxLogs(auxEntries, tasks.value, pipelineKeywords);
      logger.info("Custom日志关联完成", {
        total: auxLogs.value.length,
        matched: auxLogs.value.filter((item) => item.correlation?.status === "matched").length,
        unmatched: auxLogs.value.filter((item) => item.correlation?.status === "unmatched").length,
        failed: auxLogs.value.filter((item) => item.correlation?.status === "failed").length,
      });

      pipelineCustomActions.value = pipelineActions;
      parseState.value = "done";

      // 生成状态消息
      const taskMessage =
        tasks.value.length > 0
          ? `解析完成，共 ${tasks.value.length} 个任务`
          : "解析完成，未识别到任务";
      statusMessage.value =
        auxLogs.value.length > 0
          ? `${taskMessage}，Custom日志 ${auxLogs.value.length} 条`
          : taskMessage;
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
    pipelineCustomActions,
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
