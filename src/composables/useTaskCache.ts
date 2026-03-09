/**
 * @fileoverview 任务缓存 Composable
 *
 * 本文件实现了任务缓存功能的 Vue Composable，负责：
 * - 缓存正在运行的任务事件
 * - 检测任务完成状态（Succeeded/Failed）
 * - 关联辅助日志条目
 *
 * 工作原理：
 * 1. 接收 Tasker.Task.Starting 事件创建新任务
 * 2. 接收 Tasker.Task.Stopped 事件标记任务完成
 * 3. 通过 addAuxEntry 累积辅助日志条目
 * 4. getCompletedTasks 返回已完成任务，getAuxEntries 返回关联后的辅助日志
 *
 * @module composables/useTaskCache
 */

import { ref } from "vue";
import type { EventNotification, AuxLogEntry, TaskInfo } from "@/types/logTypes";
import { createLogger } from "@/utils/logger";

const logger = createLogger("TaskCache");

/**
 * 缓存中的任务结构
 *
 * @property taskId - 任务唯一标识
 * @property entry - 任务入口名称
 * @property uuid - Maa 生成的 UUID
 * @property hash - 任务配置哈希
 * @property processId - 进程 ID
 * @property threadId - 线程 ID
 * @property startTime - 任务开始时间
 * @property events - 事件列表（用于后续分析）
 * @property status - 任务状态
 */
export interface CachedTask {
  taskId: number;
  entry: string;
  uuid: string;
  hash: string;
  processId: string;
  threadId: string;
  startTime: string;
  events: EventNotification[];
  status: "running" | "succeeded" | "failed";
}

/**
 * 任务缓存结果接口
 */
export interface TaskCacheResult {
  /** 任务缓存（Map<taskId, CachedTask>） */
  taskCache: ReturnType<typeof ref<Map<number, CachedTask>>>;
  /** 辅助日志条目缓存 */
  auxCache: ReturnType<typeof ref<AuxLogEntry[]>>;
  /** 添加事件通知 */
  addEvent: (event: EventNotification) => void;
  /** 添加辅助日志条目 */
  addAuxEntry: (entry: AuxLogEntry) => void;
  /** 获取已完成任务（消费性调用，返回后清空内部缓存） */
  getCompletedTasks: () => TaskInfo[];
  /** 获取辅助日志条目（消费性调用，返回后清空内部缓存） */
  getAuxEntries: () => AuxLogEntry[];
  /** 清空辅助日志缓存 */
  clearAuxCache: () => void;
  /** 清空所有缓存 */
  clear: () => void;
}

/**
 * 创建任务缓存管理器
 *
 * @returns 任务缓存管理器接口
 *
 * @example
 * const cache = useTaskCache();
 *
 * // 处理任务开始
 * cache.addEvent(startEvent);
 *
 * // 处理任务结束
 * cache.addEvent(stopEvent);
 *
 * // 获取已完成任务
 * const completed = cache.getCompletedTasks();
 */
export function useTaskCache(): TaskCacheResult {
  const taskCache = ref<Map<number, CachedTask>>(new Map());
  const auxCache = ref<AuxLogEntry[]>([]);

  /**
   * 添加事件通知
   *
   * 支持的事件类型：
   * - Tasker.Task.Starting：任务开始
   * - Tasker.Task.Stopped：任务结束
   * - 其他事件：追加到任务的 events 列表
   *
   * @param event - 事件通知
   */
  function addEvent(event: EventNotification): void {
    const message = event.message;
    const details = event.details;

    /** 任务开始事件 */
    if (message === "Tasker.Task.Starting") {
      const taskId = details.task_id as number;
      const task: CachedTask = {
        taskId,
        entry: details.entry as string,
        uuid: details.uuid as string,
        hash: details.hash as string,
        processId: event.processId,
        threadId: event.threadId,
        startTime: event.timestamp,
        events: [event],
        status: "running",
      };
      taskCache.value.set(taskId, task);
      logger.debug(`Task started: ${taskId}, entry: ${task.entry}`);
      return;
    }

    /** 任务结束事件 */
    if (message === "Tasker.Task.Stopped") {
      const taskId = details.task_id as number;
      const cached = taskCache.value.get(taskId);
      if (cached) {
        cached.events.push(event);
        
        /** 判断任务成功或失败 */
        const success = details.success as boolean;
        cached.status = success ? "succeeded" : "failed";
        logger.debug(`Task stopped: ${taskId}, status: ${cached.status}`);
      }
      return;
    }

    /** 其他事件：追加到对应任务 */
    const taskId = details.task_id as number;
    const cached = taskCache.value.get(taskId);
    if (cached) {
      cached.events.push(event);
    }
  }

  /**
   * 添加辅助日志条目
   *
   * 辅助日志条目包括截图等信息
   * 会在 getAuxEntries 时与任务关联
   *
   * @param entry - 辅助日志条目
   */
  function addAuxEntry(entry: AuxLogEntry): void {
    auxCache.value.push(entry);
  }

  /**
   * 获取已完成任务
   *
   * 消费性操作：调用后清空内部已完成任务缓存
   *
   * @returns 已完成的任务列表
   */
  function getCompletedTasks(): TaskInfo[] {
    const completed: TaskInfo[] = [];
    const tasksToRemove: number[] = [];

    /** 遍历所有任务，找出已完成的 */
    for (const [taskId, cached] of taskCache.value) {
      if (cached.status !== "running") {
        /** 转换为 TaskInfo 格式 */
        completed.push({
          key: `${cached.uuid}-${cached.taskId}`,
          fileName: "",
          task_id: cached.taskId,
          entry: cached.entry,
          uuid: cached.uuid,
          hash: cached.hash,
          start_time: cached.startTime,
          end_time: cached.events[cached.events.length - 1]?.timestamp ?? cached.startTime,
          status: cached.status,
          nodes: [],
          processId: cached.processId,
          threadId: cached.threadId,
        });
        tasksToRemove.push(taskId);
      }
    }

    /** 从缓存中移除已完成的任务 */
    for (const taskId of tasksToRemove) {
      taskCache.value.delete(taskId);
    }

    if (completed.length > 0) {
      logger.debug(`Returning ${completed.length} completed tasks`);
    }
    return completed;
  }

  /**
   * 获取辅助日志条目
   *
   * 消费性操作：调用后清空内部缓存
   *
   * @returns 辅助日志条目列表
   */
  function getAuxEntries(): AuxLogEntry[] {
    const entries = [...auxCache.value];
    auxCache.value = [];
    return entries;
  }

  /**
   * 清空辅助日志缓存
   */
  function clearAuxCache(): void {
    auxCache.value = [];
  }

  /**
   * 清空所有缓存
   */
  function clear(): void {
    taskCache.value.clear();
    auxCache.value = [];
    logger.debug("Cache cleared");
  }

  return {
    taskCache,
    auxCache,
    addEvent,
    addAuxEntry,
    getCompletedTasks,
    getAuxEntries,
    clearAuxCache,
    clear,
  };
}
