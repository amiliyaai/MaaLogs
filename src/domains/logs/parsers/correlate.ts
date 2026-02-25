/**
 * @fileoverview 日志关联模块
 *
 * 本文件实现了Custom日志与主任务的关联功能。
 * 通过时间窗口、identifier、task_id 等信息，将 go-service 日志
 * 与 maa.log 中的任务进行关联，提供更完整的执行上下文。
 *
 * 关联策略：
 * 1. 精确匹配：通过 identifier 或 task_id 直接关联
 * 2. 时间窗口：通过时间戳在任务执行时间范围内匹配
 * 3. 关键词匹配：通过节点名称、ROI 等关键词匹配
 *
 * @module parsers/correlate
 * @author MaaLogs Team
 * @license MIT
 */

import type { AuxLogEntry, TaskInfo } from "../types/logTypes";

/**
 * 关联配置
 *
 * 控制日志关联行为的参数。
 */
export interface CorrelationConfig {
  /** 时间窗口大小（毫秒），用于时间匹配 */
  timeWindowMs: number;
  /** 是否启用 identifier 匹配 */
  enableIdentifierMatch: boolean;
  /** 是否启用 task_id 匹配 */
  enableTaskIdMatch: boolean;
  /** 是否启用时间窗口匹配 */
  enableTimeWindowMatch: boolean;
  /** 是否启用关键词匹配 */
  enableKeywordMatch: boolean;
}

/**
 * 默认关联配置
 */
export const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  timeWindowMs: 5000,
  enableIdentifierMatch: true,
  enableTaskIdMatch: true,
  enableTimeWindowMatch: true,
  enableKeywordMatch: true
};

/**
 * 关联结果
 *
 * 表示单条Custom日志与任务的关联状态。
 */
export interface CorrelationResult {
  /** 关联状态 */
  status: "matched" | "unmatched" | "failed";
  /** 关联原因说明 */
  reason?: string;
  /** 匹配的任务键 */
  taskKey?: string;
  /** 匹配的节点 ID */
  nodeId?: number;
  /** 匹配分数（0-1） */
  score?: number;
  /** 匹配的关键词 */
  keys?: string[];
  /** 时间漂移（毫秒） */
  driftMs?: number;
}

/**
 * 将Custom日志与任务列表进行关联
 *
 * 这是关联功能的主入口函数，遍历所有Custom日志条目，
 * 尝试与任务列表中的任务建立关联。
 *
 * @param {AuxLogEntry[]} entries - Custom辅助日志条目列表
 * @param {TaskInfo[]} tasks - 任务列表
 * @param {CorrelationConfig} [config=DEFAULT_CORRELATION_CONFIG] - 关联配置
 * @returns {AuxLogEntry[]} 带有关联信息的日志条目列表
 *
 * @example
 * const correlatedEntries = correlateAuxLogsWithTasks(auxLogs, tasks);
 * console.log(correlatedEntries[0].correlation?.taskKey);
 */
export function correlateAuxLogsWithTasks(
  entries: AuxLogEntry[],
  tasks: TaskInfo[],
  config: CorrelationConfig = DEFAULT_CORRELATION_CONFIG
): AuxLogEntry[] {
  if (entries.length === 0 || tasks.length === 0) {
    return entries;
  }

  // 构建任务索引
  const taskByIdentifier = new Map<string, TaskInfo>();
  const taskByTaskId = new Map<number, TaskInfo[]>();

  for (const task of tasks) {
    // 按 identifier 索引
    if (task.identifier) {
      taskByIdentifier.set(task.identifier, task);
    }

    // 按 task_id 索引
    if (!taskByTaskId.has(task.task_id)) {
      taskByTaskId.set(task.task_id, []);
    }
    taskByTaskId.get(task.task_id)!.push(task);
  }

  // 处理每条日志
  return entries.map(entry => {
    const result = correlateEntry(entry, tasks, taskByIdentifier, taskByTaskId, config);
    if (result) {
      entry.correlation = result;
    }
    return entry;
  });
}

/**
 * 关联单条日志条目
 *
 * 按优先级尝试不同的关联策略：
 * 1. identifier 匹配（最精确）
 * 2. task_id 匹配
 * 3. 时间窗口匹配
 *
 * @param {AuxLogEntry} entry - 日志条目
 * @param {TaskInfo[]} tasks - 任务列表
 * @param {Map<string, TaskInfo>} taskByIdentifier - identifier 索引
 * @param {Map<number, TaskInfo[]>} taskByTaskId - task_id 索引
 * @param {CorrelationConfig} config - 关联配置
 * @returns {CorrelationResult | null} 关联结果
 */
function correlateEntry(
  entry: AuxLogEntry,
  tasks: TaskInfo[],
  taskByIdentifier: Map<string, TaskInfo>,
  taskByTaskId: Map<number, TaskInfo[]>,
  config: CorrelationConfig
): CorrelationResult | null {
  // 策略 1：identifier 匹配
  if (config.enableIdentifierMatch && entry.identifier) {
    const task = taskByIdentifier.get(entry.identifier);
    if (task) {
      return {
        status: "matched",
        reason: "identifier_match",
        taskKey: task.key,
        score: 1.0
      };
    }
  }

  // 策略 2：task_id 匹配
  if (config.enableTaskIdMatch && entry.task_id !== undefined) {
    const taskList = taskByTaskId.get(entry.task_id);
    if (taskList && taskList.length > 0) {
      // 如果有多个任务，尝试通过时间窗口进一步筛选
      if (taskList.length === 1) {
        return {
          status: "matched",
          reason: "task_id_match",
          taskKey: taskList[0].key,
          score: 0.9
        };
      }

      // 多个任务时，选择时间最接近的
      const bestMatch = findBestTimeMatch(entry, taskList, config.timeWindowMs);
      if (bestMatch) {
        return {
          status: "matched",
          reason: "task_id_time_match",
          taskKey: bestMatch.task.key,
          score: bestMatch.score,
          driftMs: bestMatch.driftMs
        };
      }
    }
  }

  // 策略 3：时间窗口匹配
  if (config.enableTimeWindowMatch && entry.timestampMs) {
    const bestMatch = findBestTimeMatch(entry, tasks, config.timeWindowMs);
    if (bestMatch && bestMatch.score > 0.5) {
      return {
        status: "matched",
        reason: "time_window_match",
        taskKey: bestMatch.task.key,
        score: bestMatch.score,
        driftMs: bestMatch.driftMs
      };
    }
  }

  // 未匹配
  return {
    status: "unmatched",
    reason: "no_matching_task"
  };
}

/**
 * 查找时间最匹配的任务
 *
 * 在给定的时间窗口内，找到与日志条目时间最接近的任务。
 *
 * @param {AuxLogEntry} entry - 日志条目
 * @param {TaskInfo[]} tasks - 任务列表
 * @param {number} timeWindowMs - 时间窗口（毫秒）
 * @returns {{task: TaskInfo, score: number, driftMs: number} | null} 最佳匹配
 */
function findBestTimeMatch(
  entry: AuxLogEntry,
  tasks: TaskInfo[],
  timeWindowMs: number
): { task: TaskInfo; score: number; driftMs: number } | null {
  if (!entry.timestampMs) return null;

  let bestMatch: { task: TaskInfo; score: number; driftMs: number } | null = null;
  let minDrift = Infinity;

  for (const task of tasks) {
    // 计算任务的时间范围
    const startTime = new Date(task.start_time).getTime();
    const endTime = task.end_time ? new Date(task.end_time).getTime() : startTime + 60000;

    // 检查日志时间是否在任务时间范围内
    if (entry.timestampMs >= startTime - timeWindowMs && entry.timestampMs <= endTime + timeWindowMs) {
      // 计算时间漂移
      const driftToStart = Math.abs(entry.timestampMs - startTime);
      const driftToEnd = Math.abs(entry.timestampMs - endTime);
      const drift = Math.min(driftToStart, driftToEnd);

      if (drift < minDrift) {
        minDrift = drift;
        // 计算匹配分数（漂移越小分数越高）
        const score = Math.max(0, 1 - drift / timeWindowMs);
        bestMatch = { task, score, driftMs: drift };
      }
    }
  }

  return bestMatch;
}

/**
 * 批量关联日志与任务
 *
 * 对大量日志进行分批处理，避免阻塞主线程。
 *
 * @param {AuxLogEntry[]} entries - 日志条目列表
 * @param {TaskInfo[]} tasks - 任务列表
 * @param {CorrelationConfig} [config] - 关联配置
 * @param {number} [batchSize=1000] - 批处理大小
 * @returns {Promise<AuxLogEntry[]>} 关联后的日志列表
 *
 * @example
 * const result = await batchCorrelate(auxLogs, tasks, config, 500);
 */
export async function batchCorrelate(
  entries: AuxLogEntry[],
  tasks: TaskInfo[],
  config: CorrelationConfig = DEFAULT_CORRELATION_CONFIG,
  batchSize: number = 1000
): Promise<AuxLogEntry[]> {
  const result: AuxLogEntry[] = [];

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const correlated = correlateAuxLogsWithTasks(batch, tasks, config);
    result.push(...correlated);

    // 让出主线程
    if (i + batchSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return result;
}

/**
 * 获取任务的关联日志
 *
 * 从已关联的日志列表中筛选出属于指定任务的日志。
 *
 * @param {AuxLogEntry[]} entries - 已关联的日志列表
 * @param {string} taskKey - 任务键
 * @returns {AuxLogEntry[]} 属于该任务的日志列表
 *
 * @example
 * const taskLogs = getLogsForTask(correlatedEntries, 'task-0');
 */
export function getLogsForTask(entries: AuxLogEntry[], taskKey: string): AuxLogEntry[] {
  return entries.filter(entry => entry.correlation?.taskKey === taskKey);
}

/**
 * 获取未关联的日志
 *
 * 从日志列表中筛选出未能关联到任何任务的日志。
 *
 * @param {AuxLogEntry[]} entries - 已关联的日志列表
 * @returns {AuxLogEntry[]} 未关联的日志列表
 *
 * @example
 * const unmatchedLogs = getUnmatchedLogs(correlatedEntries);
 */
export function getUnmatchedLogs(entries: AuxLogEntry[]): AuxLogEntry[] {
  return entries.filter(
    entry => !entry.correlation || entry.correlation.status === "unmatched"
  );
}

/**
 * 统计关联结果
 *
 * 计算关联成功、失败、未匹配的数量统计。
 *
 * @param {AuxLogEntry[]} entries - 已关联的日志列表
 * @returns {{matched: number, unmatched: number, failed: number, byReason: Record<string, number>}} 统计结果
 *
 * @example
 * const stats = getCorrelationStats(correlatedEntries);
 * console.log(`匹配成功: ${stats.matched}, 未匹配: ${stats.unmatched}`);
 */
export function getCorrelationStats(entries: AuxLogEntry[]): {
  matched: number;
  unmatched: number;
  failed: number;
  byReason: Record<string, number>;
} {
  const stats = {
    matched: 0,
    unmatched: 0,
    failed: 0,
    byReason: {} as Record<string, number>
  };

  for (const entry of entries) {
    if (!entry.correlation) {
      stats.unmatched++;
      continue;
    }

    switch (entry.correlation.status) {
      case "matched":
        stats.matched++;
        break;
      case "unmatched":
        stats.unmatched++;
        break;
      case "failed":
        stats.failed++;
        break;
    }

    if (entry.correlation.reason) {
      stats.byReason[entry.correlation.reason] = (stats.byReason[entry.correlation.reason] || 0) + 1;
    }
  }

  return stats;
}

/**
 * 关联Custom日志与任务
 *
 * 这是 correlateAuxLogsWithTasks 的简短别名，用于简化导入。
 *
 * @param {AuxLogEntry[]} entries - Custom日志条目列表
 * @param {TaskInfo[]} tasks - 任务列表
 * @param {Record<string, string[]>} [_pipelineKeywords] - Pipeline 关键词映射（未使用，保留用于未来扩展）
 * @returns {AuxLogEntry[]} 带有关联信息的日志条目列表
 */
export function correlateAuxLogs(
  entries: AuxLogEntry[],
  tasks: TaskInfo[],
  _pipelineKeywords?: Record<string, string[]>
): AuxLogEntry[] {
  return correlateAuxLogsWithTasks(entries, tasks);
}
