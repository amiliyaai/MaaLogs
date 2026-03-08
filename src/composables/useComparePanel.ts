/**
 * 对比面板
 * - 任务选项计算
 * - 节点显示限制
 * - 格式化函数
 * - 差异类型文本映射
 *
 * @module composables/useComparePanel
 */
import { computed, type ComputedRef } from "vue";
import type { CompareResult, KeyDiff, TaskInfo } from "@/types/logTypes";
import type { SelectOption } from "naive-ui";

/** 任务选项类型（兼容 Naive UI SelectOption） */
export type TaskOption = SelectOption;

/** Composable 输入参数 */
export interface UseComparePanelOptions {
  /** 基准任务列表 */
  baselineTasks: ComputedRef<TaskInfo[]>;
  /** 候选任务列表 */
  candidateTasks: ComputedRef<TaskInfo[]>;
  /** 对比结果 */
  compareResult: ComputedRef<CompareResult | null>;
}

/** Composable 返回值 */
export interface UseComparePanelReturn {
  /** 基准任务选项 */
  baselineOptions: ComputedRef<TaskOption[]>;
  /** 候选任务选项 */
  candidateOptions: ComputedRef<TaskOption[]>;
  /** 格式化耗时 */
  formatDuration: (ms: number) => string;
  /** 获取差异类型文本 */
  getDiffTypeText: (type: KeyDiff["type"]) => string;
  /** 获取差异严重程度类型 */
  getDiffSeverityType: (severity: KeyDiff["severity"]) => TagType;
  /** 获取节点状态类型 */
  getNodeStatusType: (status: string) => TagType;
}

type TagType = "error" | "warning" | "success" | "default";

/** 差异类型文本映射（预计算） */
const DIFF_TYPE_TEXT_MAP: Record<KeyDiff["type"], string> = {
  failed: "失败",
  duration: "耗时",
  path: "路径",
  recognition: "识别",
  action: "动作",
  node_count: "节点数",
};

/** 差异严重程度类型映射 */
const DIFF_SEVERITY_TYPE_MAP: Record<
  KeyDiff["severity"],
  "error" | "warning" | "success" | "default"
> = {
  critical: "error",
  warning: "warning",
  info: "success",
};

/**
 * 对比面板 Composable
 *
 * @example
 * ```ts
 * const {
 *   baselineOptions,
 *   candidateOptions,
 *   formatDuration,
 *   getDiffTypeText,
 * } = useComparePanel({
 *   baselineTasks: computed(() => props.baselineTasks),
 *   candidateTasks: computed(() => props.candidateTasks),
 *   compareResult: computed(() => props.compareResult),
 * });
 * ```
 */
export function useComparePanel(options: UseComparePanelOptions): UseComparePanelReturn {
  const { baselineTasks, candidateTasks } = options;

  // ============================================
  // 计算属性
  // ============================================

  /**
   * 基准任务选项
   * 使用缓存避免重复计算
   */
  const baselineOptions = computed<TaskOption[]>(() => {
    const tasks = baselineTasks.value;
    if (tasks.length === 0) return [];

    return tasks.map((task) => ({
      label: `${task.start_time ?? ""} ${task.entry} (${task.status === "failed" ? "失败" : "成功"})`,
      value: task.key,
    }));
  });

  /**
   * 候选任务选项
   * 使用缓存避免重复计算
   */
  const candidateOptions = computed<TaskOption[]>(() => {
    const tasks = candidateTasks.value;
    if (tasks.length === 0) return [];

    return tasks.map((task) => ({
      label: `${task.start_time ?? ""} ${task.entry} (${task.status === "failed" ? "失败" : "成功"})`,
      value: task.key,
    }));
  });

  // ============================================
  // 工具函数
  // ============================================

  /**
   * 格式化耗时
   * 优化：减少字符串拼接次数
   */
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;

    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}秒`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  }

  /**
   * 获取差异类型文本
   * 使用预计算的映射表，避免多次条件判断
   */
  function getDiffTypeText(type: KeyDiff["type"]): string {
    return DIFF_TYPE_TEXT_MAP[type] ?? "未知";
  }

  /**
   * 获取差异严重程度类型
   */
  function getDiffSeverityType(
    severity: KeyDiff["severity"]
  ): "error" | "warning" | "success" | "default" {
    return DIFF_SEVERITY_TYPE_MAP[severity] ?? "default";
  }

  /**
   * 获取节点状态类型
   */
  function getNodeStatusType(status: string): "error" | "success" | "default" {
    if (status === "failed") return "error";
    if (status === "success") return "success";
    return "default";
  }

  return {
    baselineOptions,
    candidateOptions,
    formatDuration,
    getDiffTypeText,
    getDiffSeverityType,
    getNodeStatusType,
  };
}

/**
 * 创建任务选择处理器
 * 用于处理下拉选择事件
 */
export function createTaskSelectHandler(
  tasks: ComputedRef<TaskInfo[]>,
  emit: (event: string, task: TaskInfo | null) => void,
  eventName: string
): (taskKey: string | null) => void {
  return (taskKey: string | null) => {
    const task = taskKey ? (tasks.value.find((item) => item.key === taskKey) ?? null) : null;
    emit(eventName, task);
  };
}
