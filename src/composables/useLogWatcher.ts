/**
 * @fileoverview 日志监控 Composable
 *
 * 本文件实现了完整的日志监控管理器，负责：
 * - 初始化文件监控
 * - 增量解析日志变更
 * - 任务缓存和完成检测
 * - 关联辅助日志和截图
 *
 * 性能优化：
 * - 使用 for 循环替代 forEach（减少函数调用开销）
 * - 预编译正则表达式 NEWLINE_REGEX
 * - 复用解析上下文 createMainLogContext()
 * - 增量处理减少内存分配
 * - 缓存 parser 实例避免重复查找
 *
 * @module composables/useLogWatcher
 */

import { ref, triggerRef } from "vue";
import type { TaskInfo, AuxLogEntry } from "@/types/logTypes";
import { projectParserRegistry, correlateAuxLogs } from "@/parsers";
import {
  parseBracketLine,
  handleMainLogLine,
  createMainLogContext,
  type MainLogParseContext,
  type ProjectType,
} from "@/parsers/baseParser";
import { buildTasks, StringPool } from "@/utils/parse";
import { useFileWatcher, type FileChange } from "./useFileWatcher";
import { useTaskCache } from "./useTaskCache";
import { LOG_WATCHER_CONFIG } from "@/config/logFiles";
import { createLogger } from "@/utils/logger";

const logger = createLogger("LogWatcher");

/** 预编译换行符正则，避免重复创建 */
const NEWLINE_REGEX = /\r?\n/;

/**
 * 日志监控器
 *
 * 整合文件监控、任务缓存和日志解析的完整解决方案
 *
 * @example
 * const watcher = useLogWatcher();
 * await watcher.init("/path/to/logs", "m9a");
 * watcher.startWatching();
 *
 * // 监听任务完成
 * watch(watcher.completedTasks, (tasks) => {
 *   console.log("New completed tasks:", tasks);
 * });
 */
function useLogWatcher() {
  /** 是否正在监控 */
  const isWatching = ref(false);
  /** 是否正在初始化 */
  const isInitializing = ref(false);
  /** 已完成任务列表（内部数组，用于性能优化） */
  const completedTasksList: TaskInfo[] = [];
  /** 已完成任务（响应式） */
  const completedTasks = ref(completedTasksList);
  /** 辅助日志条目列表（内部数组） */
  const auxEntriesList: AuxLogEntry[] = [];
  /** 辅助日志条目（响应式） */
  const auxEntries = ref(auxEntriesList);
  /** 当前监控目录 */
  const dirPath = ref("");
  /** 当前项目类型 */
  const projectType = ref<ProjectType>("");

  /** 文件监控器实例 */
  const fileWatcher = useFileWatcher();
  /** 任务缓存实例 */
  const taskCache = useTaskCache();

  /** 监控定时器 */
  let watchInterval: ReturnType<typeof setInterval> | null = null;
  /** 缓存的任务列表（用于日志关联） */
  let cachedTasks: TaskInfo[] = [];
  /** 缓存的 parser 实例（避免重复查找） */
  let lastParser: ReturnType<typeof projectParserRegistry.get> | null = null;

  /**
   * 处理文件变更
   *
   * 核心处理流程：
   * 1. 解析主日志内容，提取事件通知
   * 2. 解析辅助日志，提取截图等信息
   * 3. 更新任务缓存，检测完成的任务
   * 4. 关联辅助日志和任务
   *
   * @param changes - 文件变更列表
   */
  async function processChanges(changes: FileChange[]): Promise<void> {
    const changeCount = changes.length;
    logger.debug(`正在处理 ${changeCount} 个文件变更`);

    /** 创建解析上下文（复用比每次创建更高效） */
    const mainLogContext: MainLogParseContext = createMainLogContext();

    const projectTypeValue = projectType.value;
    let parser = lastParser;

    /** 缓存 parser，只在项目类型变化时重新获取 */
    if (!parser || projectType.value !== projectTypeValue) {
      parser = projectParserRegistry.get(projectTypeValue) || projectParserRegistry.getDefault();
      lastParser = parser;
    }

    if (!parser) {
      logger.warn(`No parser found for project type: ${projectTypeValue}`);
    }

    /** 遍历所有变更文件 */
    for (let c = 0; c < changeCount; c++) {
      const change = changes[c];
      const content = change.newContent;
      /** 预计算行数，避免重复计算 */
      const lines = content.split(NEWLINE_REGEX);
      const lineCount = lines.length;

      logger.debug(
        `正在处理 ${lineCount} 行 from ${change.file.filename}, isMainLog: ${change.isMainLog}`
      );

      /** 处理主日志 */
      if (change.isMainLog) {
        let parsedCount = 0;

        /** 使用 for 循环替代 forEach，减少函数调用开销 */
        for (let i = 0; i < lineCount; i++) {
          const line = lines[i];
          if (!line.trim()) continue;

          const parsed = parseBracketLine(line);
          if (parsed) {
            handleMainLogLine(mainLogContext, line, parsed, change.file.filename, 0);
            parsedCount++;
          }
        }
        logger.debug(`已解析 ${parsedCount} 行主日志`);

        /** 批量添加事件到缓存 */
        const eventCount = mainLogContext.events.length;
        logger.debug(`解析到 ${eventCount} 个事件`);

        for (let i = 0; i < eventCount; i++) {
          const event = mainLogContext.events[i];
          if (event) {
            taskCache.addEvent(event);
          }
        }
      } else if (parser && projectTypeValue && projectTypeValue !== "unknown") {
      /** 处理辅助日志（只在项目类型已知时处理） */
        try {
          const result = parser.parseAuxLog(lines, {
            fileName: change.file.filename,
          });
          logger.debug(`已解析辅助日志: ${result.entries.length} 条`);

          /** 批量添加辅助日志条目 */
          const entryCount = result.entries.length;
          for (let i = 0; i < entryCount; i++) {
            taskCache.addAuxEntry(result.entries[i]);
          }
        } catch (err) {
          logger.warn(`Error parsing aux log ${change.file.filename}: ${err}`);
        }
      }
    }

    /** 获取所有事件 */
    const allEvents = taskCache.getAllEvents();

    /** 获取已完成的任务（不删除缓存） */
    const newCompleted = taskCache.getCompletedTasks();
    const newCompletedCount = newCompleted.length;

    if (newCompletedCount > 0) {
      /** 构建节点 */
      const stringPool = new StringPool();
      const builtTasks = buildTasks(allEvents, stringPool);

      /** 构建任务映射（按 taskId 索引） */
      const builtTaskMap = new Map<number, TaskInfo[]>();
      for (const task of builtTasks) {
        const existing = builtTaskMap.get(task.task_id) || [];
        existing.push(task);
        builtTaskMap.set(task.task_id, existing);
      }

      /** 合并任务：使用 builtTask 的节点 + origTask 的 processId/threadId */
      for (let i = 0; i < newCompletedCount; i++) {
        const origTask = newCompleted[i];
        const builtList = builtTaskMap.get(origTask.task_id);
        const builtTask = builtList?.[0];

        if (builtTask) {
          /** 合并：使用 origTask 的 key 和 builtTask 的节点和耗时，但使用 origTask 的 processId 和 threadId */
          const mergedTask: TaskInfo = {
            ...builtTask,
            key: origTask.key,
            processId: origTask.processId || builtTask.processId,
            threadId: origTask.threadId || builtTask.threadId,
          };
          completedTasksList.push(mergedTask);
        } else {
          /** 使用 origTask 的 key */
          const mergedTask: TaskInfo = {
            ...origTask,
          };
          completedTasksList.push(mergedTask);
        }
      }

      /** 触发响应式更新 */
      completedTasks.value = [...completedTasksList];
      triggerRef(completedTasks);
      cachedTasks = completedTasksList.slice();
      logger.info(
        `Added ${newCompletedCount} completed tasks with nodes, total: ${completedTasksList.length}`
      );

      /** 清理已完成任务的缓存 */
      taskCache.clearCompletedTasks();
    } else {
      /** 即使没有新任务，也强制触发响应式更新以确保UI同步 */
      completedTasks.value = [...completedTasksList];
      triggerRef(completedTasks);
    }

    /** 获取新的辅助日志条目并关联 */
    const newAuxEntries = taskCache.getAuxEntries();
    const auxEntryCount = newAuxEntries.length;

    if (auxEntryCount > 0) {
      const correlated = correlateAuxLogs(newAuxEntries, cachedTasks);
      for (let i = 0; i < correlated.length; i++) {
        auxEntriesList.push(correlated[i]);
      }
      /** 触发响应式更新 */
      auxEntries.value = [...auxEntriesList];
      logger.debug(`已添加 ${correlated.length} 条辅助日志，总计: ${auxEntriesList.length}`);
    }
  }

  /**
   * 监控循环
   *
   * 定时检查文件变更并处理
   */
  async function watchLoop(): Promise<void> {
    if (!isWatching.value) return;

    const changes = fileWatcher.getChanges();
    if (changes.length > 0) {
      await processChanges(changes);
      fileWatcher.updateFilePositions();
    }
  }

  /**
   * 初始化日志监控
   *
   * 1. 初始化文件监控器
   * 2. 首次加载时处理现有日志内容
   *
   * @param newDirPath - 日志目录路径
   * @param newProjectType - 项目类型（m9a / maaend / unknown）
   */
  async function init(newDirPath: string, newProjectType: ProjectType): Promise<void> {
    logger.info(`Initializing log watcher: dir=${newDirPath}, project=${newProjectType}`);
    isInitializing.value = true;

    dirPath.value = newDirPath;
    projectType.value = newProjectType;
    lastParser = null;

    /** 清空内部数组而非重新赋值（避免内存重分配） */
    completedTasksList.length = 0;
    auxEntriesList.length = 0;
    cachedTasks = [];
    taskCache.clear();
    taskCache.resetReturnedKeys();

    /** 初始化文件监控 */
    await fileWatcher.init(newDirPath, newProjectType);

    /** 首次加载处理现有内容 */
    const changes = fileWatcher.getChanges();
    if (changes.length > 0) {
      await processChanges(changes);
    }

    isInitializing.value = false;
    fileWatcher.updateFilePositions();
    logger.info(`Log watcher initialized, initial tasks: ${completedTasksList.length}`);
  }

  /**
   * 开始日志监控
   *
   * 启动定时器，定期检查文件变更
   */
  function startWatching(): void {
    if (isWatching.value) return;

    fileWatcher.startWatching();
    isWatching.value = true;
    watchInterval = setInterval(watchLoop, LOG_WATCHER_CONFIG.POLL_INTERVAL_MS);
    logger.info("Log watching started");
  }

  /**
   * 停止日志监控
   *
   * 清除定时器，停止文件监控
   */
  function stopWatching(): void {
    if (!isWatching.value) return;

    isWatching.value = false;
    if (watchInterval) {
      clearInterval(watchInterval);
      watchInterval = null;
    }

    fileWatcher.stopWatching();
    logger.info("Log watching stopped");
  }

  /**
   * 重置日志监控状态
   *
   * 停止监控并清空所有数据
   */
  function reset(): void {
    stopWatching();
    completedTasksList.length = 0;
    auxEntriesList.length = 0;
    cachedTasks = [];
    lastParser = null;
    taskCache.clear();
    taskCache.resetReturnedKeys();
    fileWatcher.reset();
    dirPath.value = "";
    projectType.value = "";
    logger.info("Log watcher reset");
  }

  return {
    isWatching,
    isInitializing,
    completedTasks,
    auxEntries,
    dirPath,
    projectType,
    init,
    startWatching,
    stopWatching,
    reset,
  };
}

export { useLogWatcher };
