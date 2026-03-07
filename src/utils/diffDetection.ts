/**
 * 差异检测模块
 *
 * 提供两次运行日志的差异分析能力，包括：
 * - 失败节点检测
 * - 耗时异常检测
 * - 路径分歧检测
 * - 识别算法变化检测
 * - 动作变化检测
 * - 节点数量变化检测
 *
 * @module utils/diffDetection
 */
import { compareConfig } from "@/config/compare";
import type {
  CompareResult,
  KeyDiff,
  KeyDiffSeverity,
  NodeInfo,
  NodeStat,
  ParsedRunSnapshot,
  TaskInfo,
} from "@/types/logTypes";
import { computeNodeStatistics } from "@/utils/parse";
import { createLogger } from "@/utils/logger";

const logger = createLogger("DiffDetection");

/** 严重程度权重映射，用于排序 */
const SEVERITY_WEIGHT: Record<KeyDiffSeverity, number> = Object.fromEntries(
  compareConfig.diffSeverityOrder.map((value, index) => [value, index])
) as Record<KeyDiffSeverity, number>;

/** 快照构建输入类型 */
type SnapshotBuildInput = {
  tasks: TaskInfo[];
  sourceName: string;
  detectedProject: string;
  label: string;
  nodeStatistics?: NodeStat[];
  nodeSummary?: ParsedRunSnapshot["nodeSummary"];
};

// ============================================
// 快照构建
// ============================================

/**
 * 构建解析后的运行快照
 *
 * @param input 快照输入数据
 * @returns 完整的运行快照对象
 */
export function buildParsedRunSnapshot(input: SnapshotBuildInput): ParsedRunSnapshot {
  const taskList = input.tasks ?? [];
  const nodeStatistics = input.nodeStatistics ?? computeNodeStatistics(taskList);

  // 优化：单次遍历计算汇总数据
  const nodeSummary =
    input.nodeSummary ??
    (nodeStatistics.length > 0 ? computeNodeSummary(nodeStatistics) : null);

  return {
    id: createSnapshotId(),
    label: input.label,
    sourceName: input.sourceName,
    parsedAt: new Date().toISOString(),
    tasks: taskList,
    nodeStatistics,
    nodeSummary,
    detectedProject: input.detectedProject,
    totalTaskCount: taskList.length,
    failedTaskCount: taskList.filter((task) => task.status === "failed").length,
  };
}

/**
 * 计算节点汇总信息
 * 单次遍历优化版本
 */
function computeNodeSummary(stats: NodeStat[]): ParsedRunSnapshot["nodeSummary"] {
  let totalNodes = 0;
  let totalDuration = 0;
  let slowestNode: NodeStat | null = null;
  let maxAvgDuration = -1;

  for (const item of stats) {
    totalNodes += item.count;
    totalDuration += item.totalDuration;
    if (item.avgDuration > maxAvgDuration) {
      maxAvgDuration = item.avgDuration;
      slowestNode = item;
    }
  }

  return {
    totalNodes,
    totalDuration,
    avgDuration: totalDuration / Math.max(1, totalNodes),
    slowestNode,
    uniqueNodes: stats.length,
  };
}

// ============================================
// 对比计算
// ============================================

/**
 * 计算任务对比概览
 *
 * @param taskA 基准任务
 * @param taskB 候选任务
 * @returns 对比概览数据
 */
export function computeOverview(taskA: TaskInfo, taskB: TaskInfo): CompareResult["overview"] {
  const baselineDuration = getTaskDuration(taskA);
  const candidateDuration = getTaskDuration(taskB);
  const baselineNodeCount = taskA.nodes.length;
  const candidateNodeCount = taskB.nodes.length;

  return {
    baselineStatus: taskA.status,
    candidateStatus: taskB.status,
    baselineDuration,
    candidateDuration,
    baselineNodeCount,
    candidateNodeCount,
    durationChange:
      baselineDuration > 0 ? (candidateDuration - baselineDuration) / baselineDuration : 0,
    nodeCountChange:
      baselineNodeCount > 0 ? (candidateNodeCount - baselineNodeCount) / baselineNodeCount : 0,
  };
}

/**
 * 检测关键差异
 *
 * 性能优化：
 * - 合并多次遍历为单次遍历
 * - 使用 Map 缓存节点匹配结果
 * - 提前退出条件判断
 *
 * @param taskA 基准任务
 * @param taskB 候选任务
 * @returns 关键差异列表
 */
export function detectKeyDiffs(taskA: TaskInfo | null, taskB: TaskInfo | null): KeyDiff[] {
  if (!taskA || !taskB) return [];

  const diffs: KeyDiff[] = [];

  // 预计算节点匹配，避免重复计算
  const nodeMatchCache = buildNodeMatchCache(taskA.nodes, taskB.nodes);

  // 失败节点检测
  diffs.push(...detectFailedNodes(taskA.nodes, taskB.nodes));

  // 合并遍历：耗时异常 + 路径分歧（都需要按顺序遍历）
  diffs.push(...detectSequentialDiffs(taskA.nodes, taskB.nodes));

  // 基于匹配缓存的检测
  diffs.push(...detectRecognitionDiffsCached(nodeMatchCache));
  diffs.push(...detectActionDiffsCached(nodeMatchCache));

  // 节点数量变化
  diffs.push(...detectNodeCountDiff(taskA, taskB));

  return sortDiffsBySeverity(diffs);
}

// ============================================
// 节点匹配
// ============================================

/** 节点匹配缓存项 */
type NodeMatchCacheItem = {
  nodeA: NodeInfo;
  nodeB: NodeInfo;
};

/**
 * 构建节点匹配缓存
 * 使用 Map 提高查找效率
 */
function buildNodeMatchCache(
  nodesA: NodeInfo[],
  nodesB: NodeInfo[]
): Map<string, NodeMatchCacheItem> {
  const cache = new Map<string, NodeMatchCacheItem>();
  const usedB = new Set<number>();

  for (const nodeA of nodesA) {
    const nodeIndexA = getNodeIndex(nodeA);
    const cacheKey = `${nodeA.name}-${nodeIndexA}`;

    // 优先匹配同名同索引
    let matchedIndex = -1;
    for (let i = 0; i < nodesB.length; i++) {
      if (usedB.has(i)) continue;
      const nodeB = nodesB[i];
      if (nodeA.name === nodeB.name && getNodeIndex(nodeB) === nodeIndexA) {
        matchedIndex = i;
        break;
      }
    }

    // 回退到同名匹配
    if (matchedIndex < 0) {
      for (let i = 0; i < nodesB.length; i++) {
        if (usedB.has(i)) continue;
        if (nodesB[i].name === nodeA.name) {
          matchedIndex = i;
          break;
        }
      }
    }

    if (matchedIndex >= 0) {
      usedB.add(matchedIndex);
      cache.set(cacheKey, { nodeA, nodeB: nodesB[matchedIndex] });
    }
  }

  return cache;
}

/**
 * 匹配节点（公开 API，保持向后兼容）
 *
 * @deprecated 内部已使用缓存优化，此函数保留用于外部调用
 */
export function matchNodes(
  nodesA: NodeInfo[],
  nodesB: NodeInfo[]
): Array<{ nodeA: NodeInfo; nodeB: NodeInfo }> {
  const cache = buildNodeMatchCache(nodesA, nodesB);
  return Array.from(cache.values());
}

// ============================================
// 差异检测函数
// ============================================

/**
 * 检测失败节点
 * 使用 Set 优化查找性能
 */
function detectFailedNodes(nodesA: NodeInfo[], nodesB: NodeInfo[]): KeyDiff[] {
  const result: KeyDiff[] = [];

  // 单次遍历构建失败节点集合
  const failedA = new Map<string, NodeInfo>();
  const failedB = new Map<string, NodeInfo>();

  for (const node of nodesA) {
    if (node.status === "failed") {
      failedA.set(node.name, node);
    }
  }

  for (const node of nodesB) {
    if (node.status === "failed") {
      failedB.set(node.name, node);
    }
  }

  // 新增失败或持续失败
  for (const [name, nodeB] of failedB) {
    const nodeA = failedA.get(name);
    result.push({
      id: `failed-${name}`,
      type: "failed",
      severity: nodeA ? "warning" : "critical",
      nodeName: name,
      description: nodeA ? "仍然失败" : "新增失败",
      baselineNode: nodeA,
      candidateNode: nodeB,
    });
  }

  // 失败已修复
  for (const [name, nodeA] of failedA) {
    if (!failedB.has(name)) {
      result.push({
        id: `failed-fixed-${name}`,
        type: "failed",
        severity: "info",
        nodeName: name,
        description: "失败已修复",
        baselineNode: nodeA,
        candidateNode: nodesB.find((n) => n.name === name),
      });
    }
  }

  return result;
}

/**
 * 检测顺序相关差异（耗时异常 + 路径分歧）
 * 合并为单次遍历优化性能
 */
function detectSequentialDiffs(nodesA: NodeInfo[], nodesB: NodeInfo[]): KeyDiff[] {
  const result: KeyDiff[] = [];
  const len = Math.min(nodesA.length, nodesB.length);
  const threshold = compareConfig.durationChangeThreshold;
  const reportFirstOnly = compareConfig.reportFirstPathDivergenceOnly;
  let pathDivergenceFound = false;

  for (let i = 0; i < len; i++) {
    const nodeA = nodesA[i];
    const nodeB = nodesB[i];

    // 耗时异常检测（仅同名节点）
    if (nodeA.name === nodeB.name) {
      const durationA = getNodeDuration(nodeA);
      const durationB = getNodeDuration(nodeB);

      if (durationA > 0 && durationB > 0) {
        const change = (durationB - durationA) / durationA;
        if (Math.abs(change) > threshold) {
          result.push({
            id: `duration-${nodeA.name}-${i}`,
            type: "duration",
            severity: change > 0 ? "warning" : "info",
            nodeName: nodeA.name,
            description: `耗时变化: ${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`,
            baselineNode: nodeA,
            candidateNode: nodeB,
            baselineValue: durationA,
            candidateValue: durationB,
          });
        }
      }
    }

    // 路径分歧检测（从第二个节点开始）
    if (i > 0 && !pathDivergenceFound) {
      const prevA = nodesA[i - 1];
      const prevB = nodesB[i - 1];

      if (prevA.name === prevB.name && nodeA.name !== nodeB.name) {
        result.push({
          id: `path-${prevA.name}-${i}`,
          type: "path",
          severity: "info",
          nodeName: prevA.name,
          description: `路径分歧: 基准任务走 ${nodeA.name} / 本次任务走 ${nodeB.name}`,
          baselineNode: nodeA,
          candidateNode: nodeB,
        });
        if (reportFirstOnly) {
          pathDivergenceFound = true;
        }
      }
    }
  }

  return result;
}

/**
 * 检测识别算法变化（使用缓存）
 */
function detectRecognitionDiffsCached(cache: Map<string, NodeMatchCacheItem>): KeyDiff[] {
  const result: KeyDiff[] = [];

  for (const [cacheKey, { nodeA, nodeB }] of cache) {
    const algorithmA = nodeA.reco_details?.algorithm;
    const algorithmB = nodeB.reco_details?.algorithm;

    if (algorithmA !== algorithmB) {
      result.push({
        id: `reco-algo-${cacheKey}`,
        type: "recognition",
        severity: "warning",
        nodeName: nodeA.name,
        description: `识别算法变化: ${algorithmA || "未知"} → ${algorithmB || "未知"}`,
        baselineNode: nodeA,
        candidateNode: nodeB,
        baselineValue: algorithmA || "未知",
        candidateValue: algorithmB || "未知",
      });
    }
  }

  return result;
}

/**
 * 检测动作变化（使用缓存）
 */
function detectActionDiffsCached(cache: Map<string, NodeMatchCacheItem>): KeyDiff[] {
  const result: KeyDiff[] = [];

  for (const [cacheKey, { nodeA, nodeB }] of cache) {
    const actionA = nodeA.action_details?.action;
    const actionB = nodeB.action_details?.action;

    if (actionA !== actionB) {
      result.push({
        id: `action-${cacheKey}`,
        type: "action",
        severity: "info",
        nodeName: nodeA.name,
        description: `动作变化: ${actionA || "未知"} → ${actionB || "未知"}`,
        baselineNode: nodeA,
        candidateNode: nodeB,
        baselineValue: actionA || "未知",
        candidateValue: actionB || "未知",
      });
    }
  }

  return result;
}

/**
 * 检测节点数量变化
 */
function detectNodeCountDiff(taskA: TaskInfo, taskB: TaskInfo): KeyDiff[] {
  const countA = taskA.nodes.length;
  const countB = taskB.nodes.length;

  if (countA === countB) return [];

  return [
    {
      id: `node-count-${taskA.task_id}-${taskB.task_id}`,
      type: "node_count",
      severity: "warning",
      nodeName: taskA.entry,
      description: `节点数量变化: ${countA} → ${countB}`,
      baselineValue: countA,
      candidateValue: countB,
    },
  ];
}

// ============================================
// 公开 API（保持向后兼容）
// ============================================

export {
  detectFailedNodes as _detectFailedNodes,
  detectDurationAnomalies,
  detectPathDivergence,
  detectRecognitionDiffs,
  detectActionDiffs,
  detectNodeCountDiff,
};

/**
 * 检测耗时异常（公开 API）
 * @deprecated 内部已合并到 detectSequentialDiffs
 */
function detectDurationAnomalies(taskA: TaskInfo, taskB: TaskInfo): KeyDiff[] {
  const result: KeyDiff[] = [];
  const len = Math.min(taskA.nodes.length, taskB.nodes.length);
  const threshold = compareConfig.durationChangeThreshold;

  for (let i = 0; i < len; i++) {
    const nodeA = taskA.nodes[i];
    const nodeB = taskB.nodes[i];

    if (nodeA.name !== nodeB.name) continue;

    const durationA = getNodeDuration(nodeA);
    const durationB = getNodeDuration(nodeB);

    if (durationA <= 0 || durationB <= 0) continue;

    const change = (durationB - durationA) / durationA;
    if (Math.abs(change) <= threshold) continue;

    result.push({
      id: `duration-${nodeA.name}-${i}`,
      type: "duration",
      severity: change > 0 ? "warning" : "info",
      nodeName: nodeA.name,
      description: `耗时变化: ${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`,
      baselineNode: nodeA,
      candidateNode: nodeB,
      baselineValue: durationA,
      candidateValue: durationB,
    });
  }

  return result;
}

/**
 * 检测路径分歧（公开 API）
 * @deprecated 内部已合并到 detectSequentialDiffs
 */
function detectPathDivergence(taskA: TaskInfo, taskB: TaskInfo): KeyDiff[] {
  const result: KeyDiff[] = [];
  const len = Math.min(taskA.nodes.length, taskB.nodes.length);

  for (let i = 1; i < len; i++) {
    const prevA = taskA.nodes[i - 1];
    const prevB = taskB.nodes[i - 1];
    const currA = taskA.nodes[i];
    const currB = taskB.nodes[i];

    if (prevA.name !== prevB.name || currA.name === currB.name) continue;

    result.push({
      id: `path-${prevA.name}-${i}`,
      type: "path",
      severity: "info",
      nodeName: prevA.name,
      description: `路径分歧: 基准任务走 ${currA.name} / 本次任务走 ${currB.name}`,
      baselineNode: currA,
      candidateNode: currB,
    });

    if (compareConfig.reportFirstPathDivergenceOnly) break;
  }

  return result;
}

/**
 * 检测识别算法变化（公开 API）
 * @deprecated 内部已使用缓存优化
 */
function detectRecognitionDiffs(taskA: TaskInfo, taskB: TaskInfo): KeyDiff[] {
  const result: KeyDiff[] = [];
  const matched = matchNodes(taskA.nodes, taskB.nodes);

  for (const { nodeA, nodeB } of matched) {
    const algorithmA = nodeA.reco_details?.algorithm;
    const algorithmB = nodeB.reco_details?.algorithm;

    if (algorithmA === algorithmB) continue;

    result.push({
      id: `reco-algo-${nodeA.name}-${getNodeIndex(nodeA)}`,
      type: "recognition",
      severity: "warning",
      nodeName: nodeA.name,
      description: `识别算法变化: ${algorithmA || "未知"} → ${algorithmB || "未知"}`,
      baselineNode: nodeA,
      candidateNode: nodeB,
      baselineValue: algorithmA || "未知",
      candidateValue: algorithmB || "未知",
    });
  }

  return result;
}

/**
 * 检测动作变化（公开 API）
 * @deprecated 内部已使用缓存优化
 */
function detectActionDiffs(taskA: TaskInfo, taskB: TaskInfo): KeyDiff[] {
  const result: KeyDiff[] = [];
  const matched = matchNodes(taskA.nodes, taskB.nodes);

  for (const { nodeA, nodeB } of matched) {
    const actionA = nodeA.action_details?.action;
    const actionB = nodeB.action_details?.action;

    if (actionA === actionB) continue;

    result.push({
      id: `action-${nodeA.name}-${getNodeIndex(nodeA)}`,
      type: "action",
      severity: "info",
      nodeName: nodeA.name,
      description: `动作变化: ${actionA || "未知"} → ${actionB || "未知"}`,
      baselineNode: nodeA,
      candidateNode: nodeB,
      baselineValue: actionA || "未知",
      candidateValue: actionB || "未知",
    });
  }

  return result;
}

// ============================================
// 排序函数
// ============================================

/**
 * 按严重程度排序差异
 */
export function sortDiffsBySeverity(diffs: KeyDiff[]): KeyDiff[] {
  return [...diffs].sort((a, b) => {
    const severity = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (severity !== 0) return severity;
    return a.nodeName.localeCompare(b.nodeName);
  });
}

// ============================================
// 工具函数
// ============================================

/**
 * 获取任务总耗时
 */
function getTaskDuration(task: TaskInfo): number {
  // 优先使用已有耗时
  if (typeof task.duration === "number" && task.duration > 0) {
    return task.duration;
  }

  // 计算时间戳差值
  const start = parseTimestamp(task.start_time);
  const end = parseTimestamp(task.end_time);
  if (start !== null && end !== null && end >= start) {
    return end - start;
  }

  // 回退到节点耗时累加
  let sum = 0;
  for (const node of task.nodes) {
    sum += Math.max(0, getNodeDuration(node));
  }
  return sum;
}

/**
 * 获取节点耗时
 */
function getNodeDuration(node: NodeInfo): number {
  // 尝试从 action_details.detail.cost 获取
  const detailCost = node.action_details?.detail;
  if (detailCost && typeof detailCost === "object" && !Array.isArray(detailCost)) {
    const maybeCost = (detailCost as Record<string, unknown>).cost;
    if (typeof maybeCost === "number" && Number.isFinite(maybeCost) && maybeCost >= 0) {
      return maybeCost;
    }
  }

  // 计算时间戳差值
  const start = parseTimestamp(node.start_time);
  const end = parseTimestamp(node.end_time);
  if (start !== null && end !== null && end >= start) {
    return end - start;
  }

  return 0;
}

/** 时间戳解析缓存 */
const timestampCache = new Map<string, number>();

/**
 * 解析时间戳
 * 带缓存优化
 */
function parseTimestamp(value?: string): number | null {
  if (!value) return null;

  // 检查缓存
  const cached = timestampCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const date = new Date(value.replace(" ", "T"));
  const time = date.getTime();

  if (Number.isNaN(time)) {
    logger.warn("时间戳解析失败", { value });
    return null;
  }

  // 缓存结果（限制缓存大小）
  if (timestampCache.size < 1000) {
    timestampCache.set(value, time);
  }

  return time;
}

/**
 * 获取节点索引
 */
function getNodeIndex(node: NodeInfo): number {
  return node.node_details?.node_id ?? node.node_id;
}

/**
 * 创建快照 ID
 */
function createSnapshotId(): string {
  const cryptoObj = globalThis.crypto;

  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }

  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(12);
    cryptoObj.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${Date.now()}-${token}`;
  }

  return `${Date.now()}-snapshot`;
}
