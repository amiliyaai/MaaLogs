/**
 * @fileoverview 统计分析 Composable
 *
 * 本文件实现了节点统计分析功能的 Vue Composable，封装了：
 * - 节点耗时统计
 * - 成功率计算
 * - 排序和过滤
 * - 汇总数据计算
 *
 * @module composables/useStatistics
 * @author MaaLogs Team
 * @license MIT
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";
import type { TaskInfo, NodeStat } from "../types/logTypes";
import { computeNodeStatistics } from "../utils/parse";

/**
 * 统计排序类型
 *
 * - avgDuration: 按平均耗时排序
 * - count: 按执行次数排序
 * - failRate: 按失败率排序
 */
export type StatSort = "avgDuration" | "count" | "failRate";

/**
 * 统计器返回值
 *
 * 包含统计分析的所有状态和计算属性。
 *
 * @property {Ref<StatSort>} statSort - 当前排序方式
 * @property {Ref<string>} statKeyword - 过滤关键词
 * @property {ComputedRef<NodeStat[]>} nodeStatistics - 节点统计数据
 * @property {ComputedRef<Object|null>} nodeSummary - 节点汇总数据
 * @property {function} resetStatistics - 重置统计状态
 */
export interface StatisticsResult {
  /** 当前排序方式 */
  statSort: Ref<StatSort>;
  /** 过滤关键词 */
  statKeyword: Ref<string>;
  /** 节点统计数据 */
  nodeStatistics: ComputedRef<NodeStat[]>;
  /** 节点汇总数据 */
  nodeSummary: ComputedRef<{
    /** 总节点执行次数 */
    totalNodes: number;
    /** 总耗时（毫秒） */
    totalDuration: number;
    /** 平均耗时（毫秒） */
    avgDuration: number;
    /** 最慢的节点 */
    slowestNode: NodeStat;
    /** 唯一节点数量 */
    uniqueNodes: number;
  } | null>;
  /** 重置统计状态 */
  resetStatistics: () => void;
}

/**
 * 统计器 Composable
 *
 * 封装节点统计的核心逻辑，提供排序和过滤功能。
 *
 * @param {function} tasks - 获取任务列表的函数
 * @returns {StatisticsResult} 统计器的状态和方法
 *
 * @example
 * const {
 *   nodeStatistics,
 *   nodeSummary,
 *   statSort
 * } = useStatistics(() => tasks.value);
 *
 * // 切换排序方式
 * statSort.value = 'count';
 */
export function useStatistics(tasks: () => TaskInfo[]): StatisticsResult {
  // ============================================
  // 响应式状态
  // ============================================

  /** 当前排序方式 */
  const statSort = ref<StatSort>("avgDuration");
  /** 过滤关键词 */
  const statKeyword = ref("");

  // ============================================
  // 计算属性
  // ============================================

  /**
   * 节点统计数据
   *
   * 计算所有节点的统计指标，支持关键词过滤和排序。
   */
  const nodeStatistics = computed(() => {
    // 计算基础统计
    let stats = computeNodeStatistics(tasks());

    // 应用关键词过滤
    if (statKeyword.value.trim()) {
      const keyword = statKeyword.value.trim().toLowerCase();
      stats = stats.filter((item) => item.name.toLowerCase().includes(keyword));
    }

    // 应用排序
    if (statSort.value === "count") {
      stats.sort((a, b) => b.count - a.count);
    } else if (statSort.value === "failRate") {
      stats.sort((a, b) => b.failCount / b.count - a.failCount / a.count);
    } else {
      stats.sort((a, b) => b.avgDuration - a.avgDuration);
    }

    return stats;
  });

  /**
   * 节点汇总数据
   *
   * 计算所有节点的汇总统计信息。
   */
  const nodeSummary = computed(() => {
    if (nodeStatistics.value.length === 0) return null;

    // 计算汇总数据
    const totalNodes = nodeStatistics.value.reduce((sum, s) => sum + s.count, 0);
    const totalDuration = nodeStatistics.value.reduce((sum, s) => sum + s.totalDuration, 0);
    const avgDuration = totalDuration / totalNodes;
    const slowestNode = nodeStatistics.value[0];

    return {
      totalNodes,
      totalDuration,
      avgDuration,
      slowestNode,
      uniqueNodes: nodeStatistics.value.length,
    };
  });

  // ============================================
  // 方法
  // ============================================

  /**
   * 重置统计状态
   *
   * 恢复默认排序和清空过滤关键词。
   */
  function resetStatistics(): void {
    statSort.value = "avgDuration";
    statKeyword.value = "";
  }

  return {
    statSort,
    statKeyword,
    nodeStatistics,
    nodeSummary,
    resetStatistics,
  };
}
