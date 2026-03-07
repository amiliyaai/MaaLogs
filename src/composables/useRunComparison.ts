/**
 * 运行对比功能 Composable
 *
 * 提供两次运行日志的对比分析能力，包括：
 * - 快照管理：加载、清空基准/候选运行快照
 * - 任务选择：选择要对比的具体任务
 * - 差异计算：自动计算对比结果
 *
 * @module composables/useRunComparison
 */
import { computed, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import type { CompareResult, ParsedRunSnapshot, TaskInfo } from "@/types/logTypes";
import { computeOverview, detectKeyDiffs } from "@/utils/diffDetection";

/** API 接口定义 */
export interface RunComparisonAPI {
  /** 基准运行快照 */
  baselineSnapshot: Ref<ParsedRunSnapshot | null>;
  /** 候选运行快照 */
  candidateSnapshot: Ref<ParsedRunSnapshot | null>;
  /** 选中的基准任务 */
  selectedTaskA: Ref<TaskInfo | null>;
  /** 选中的候选任务 */
  selectedTaskB: Ref<TaskInfo | null>;
  /** 是否可以进行对比 */
  compareReady: ComputedRef<boolean>;
  /** 对比结果 */
  compareResult: Ref<CompareResult | null>;
  /** 基准任务列表 */
  baselineTasks: ComputedRef<TaskInfo[]>;
  /** 候选任务列表 */
  candidateTasks: ComputedRef<TaskInfo[]>;
  /** 同名任务列表（用于快捷匹配，已废弃但保留接口兼容性） */
  matchedTaskNames: ComputedRef<string[]>;
  /** 设置基准快照 */
  setBaselineSnapshot: (snapshot: ParsedRunSnapshot | null) => void;
  /** 设置候选快照 */
  setCandidateSnapshot: (snapshot: ParsedRunSnapshot | null) => void;
  /** 选择基准任务 */
  selectTaskA: (task: TaskInfo | null) => void;
  /** 选择候选任务 */
  selectTaskB: (task: TaskInfo | null) => void;
  /** 快捷匹配同名任务（已废弃但保留接口兼容性） */
  quickMatchTask: (taskName: string) => void;
  /** 清空基准快照 */
  clearBaselineSnapshot: () => void;
  /** 清空候选快照 */
  clearCandidateSnapshot: () => void;
  /** 将基准快照复制为候选快照 */
  useBaselineAsCandidate: () => void;
  /** 重置所有状态 */
  resetComparison: () => void;
}

/**
 * 运行对比 Composable
 *
 * @example
 * ```ts
 * const comparison = useRunComparison();
 * comparison.setBaselineSnapshot(snapshotA);
 * comparison.setCandidateSnapshot(snapshotB);
 * comparison.selectTaskA(taskA);
 * comparison.selectTaskB(taskB);
 * // compareResult 会自动更新
 * ```
 */
export function useRunComparison(): RunComparisonAPI {
  // ============================================
  // 状态定义 - 使用 shallowRef 优化大对象性能
  // ============================================

  /** 基准运行快照 */
  const baselineSnapshot = shallowRef<ParsedRunSnapshot | null>(null);
  /** 候选运行快照 */
  const candidateSnapshot = shallowRef<ParsedRunSnapshot | null>(null);
  /** 选中的基准任务 */
  const selectedTaskA = shallowRef<TaskInfo | null>(null);
  /** 选中的候选任务 */
  const selectedTaskB = shallowRef<TaskInfo | null>(null);
  /** 对比结果缓存 */
  const compareResult = shallowRef<CompareResult | null>(null);

  // ============================================
  // 计算属性 - 使用缓存避免重复计算
  // ============================================

  /** 基准任务列表 */
  const baselineTasks = computed(() => baselineSnapshot.value?.tasks ?? []);

  /** 候选任务列表 */
  const candidateTasks = computed(() => candidateSnapshot.value?.tasks ?? []);

  /**
   * 同名任务列表
   * 使用 Set 优化查找性能，避免 O(n²) 复杂度
   */
  const matchedTaskNames = computed(() => {
    const baseline = baselineSnapshot.value;
    const candidate = candidateSnapshot.value;
    if (!baseline || !candidate) return [];

    const baselineNames = new Set<string>();
    for (const task of baseline.tasks) {
      baselineNames.add(task.entry);
    }

    const matched: string[] = [];
    for (const task of candidate.tasks) {
      if (baselineNames.has(task.entry)) {
        matched.push(task.entry);
      }
    }
    return matched;
  });

  /**
   * 是否可以进行对比
   * 四个条件必须同时满足
   */
  const compareReady = computed(
    () =>
      !!baselineSnapshot.value &&
      !!candidateSnapshot.value &&
      !!selectedTaskA.value &&
      !!selectedTaskB.value
  );

  // ============================================
  // 核心计算函数
  // ============================================

  /**
   * 同步对比结果
   * 当选中的任务变化时，重新计算对比结果
   *
   * 性能优化：
   * - 使用浅比较避免深度遍历
   * - 结果直接赋值，利用 shallowRef 的浅比较特性
   */
  function syncCompareResult(): void {
    const taskA = selectedTaskA.value;
    const taskB = selectedTaskB.value;

    if (!taskA || !taskB) {
      compareResult.value = null;
      return;
    }

    // 一次性计算所有结果，减少多次调用开销
    compareResult.value = {
      overview: computeOverview(taskA, taskB),
      keyDiffs: detectKeyDiffs(taskA, taskB),
      baselineNodes: taskA.nodes,
      candidateNodes: taskB.nodes,
      matchedTasks: matchedTaskNames.value,
    };
  }

  // ============================================
  // 快照管理函数
  // ============================================

  /**
   * 设置基准快照
   *
   * 行为：
   * - 如果当前选中的任务在新快照中存在，保持选中状态
   * - 否则自动选择第一个任务
   * - 如果快照为空，清空选中状态
   */
  function setBaselineSnapshot(snapshot: ParsedRunSnapshot | null): void {
    baselineSnapshot.value = snapshot;

    if (!snapshot) {
      selectedTaskA.value = null;
      compareResult.value = null;
      return;
    }

    // 尝试保持当前选中状态
    if (selectedTaskA.value) {
      const currentKey = selectedTaskA.value.key;
      const found = snapshot.tasks.find((task) => task.key === currentKey);
      if (found) {
        // 任务仍然存在，需要重新计算结果（因为快照可能变化）
        syncCompareResult();
        return;
      }
    }

    // 自动选择第一个任务
    selectedTaskA.value = snapshot.tasks[0] ?? null;
    syncCompareResult();
  }

  /**
   * 设置候选快照
   *
   * 行为同 setBaselineSnapshot
   */
  function setCandidateSnapshot(snapshot: ParsedRunSnapshot | null): void {
    candidateSnapshot.value = snapshot;

    if (!snapshot) {
      selectedTaskB.value = null;
      compareResult.value = null;
      return;
    }

    // 尝试保持当前选中状态
    if (selectedTaskB.value) {
      const currentKey = selectedTaskB.value.key;
      const found = snapshot.tasks.find((task) => task.key === currentKey);
      if (found) {
        syncCompareResult();
        return;
      }
    }

    // 自动选择第一个任务
    selectedTaskB.value = snapshot.tasks[0] ?? null;
    syncCompareResult();
  }

  // ============================================
  // 任务选择函数
  // ============================================

  /**
   * 选择基准任务
   */
  function selectTaskA(task: TaskInfo | null): void {
    selectedTaskA.value = task;
    syncCompareResult();
  }

  /**
   * 选择候选任务
   */
  function selectTaskB(task: TaskInfo | null): void {
    selectedTaskB.value = task;
    syncCompareResult();
  }

  /**
   * 快捷匹配同名任务
   *
   * @deprecated 此功能已从 UI 移除，但保留接口兼容性
   */
  function quickMatchTask(taskName: string): void {
    const baseline = baselineSnapshot.value?.tasks;
    const candidate = candidateSnapshot.value?.tasks;
    if (!baseline || !candidate) return;

    // 使用 find 提前退出，避免完整遍历
    const taskA = baseline.find((task) => task.entry === taskName) ?? null;
    const taskB = candidate.find((task) => task.entry === taskName) ?? null;

    selectedTaskA.value = taskA;
    selectedTaskB.value = taskB;
    syncCompareResult();
  }

  // ============================================
  // 清理函数
  // ============================================

  /**
   * 清空基准快照
   */
  function clearBaselineSnapshot(): void {
    baselineSnapshot.value = null;
    selectedTaskA.value = null;
    compareResult.value = null;
  }

  /**
   * 清空候选快照
   */
  function clearCandidateSnapshot(): void {
    candidateSnapshot.value = null;
    selectedTaskB.value = null;
    compareResult.value = null;
  }

  /**
   * 将基准快照复制为候选快照
   */
  function useBaselineAsCandidate(): void {
    if (!baselineSnapshot.value) {
      return;
    }
    setCandidateSnapshot(baselineSnapshot.value);
  }

  /**
   * 重置所有状态
   */
  function resetComparison(): void {
    baselineSnapshot.value = null;
    candidateSnapshot.value = null;
    selectedTaskA.value = null;
    selectedTaskB.value = null;
    compareResult.value = null;
  }

  // ============================================
  // 自动同步逻辑
  // ============================================

  /**
   * 监听同名任务变化
   * 当两个快照都只有一个任务且同名时，自动匹配
   */
  watch(matchedTaskNames, (names) => {
    const baseline = baselineSnapshot.value;
    const candidate = candidateSnapshot.value;

    // 只在特定条件下自动匹配
    if (
      names.length === 1 &&
      baseline?.tasks.length === 1 &&
      candidate?.tasks.length === 1
    ) {
      quickMatchTask(names[0]);
    }
  });

  return {
    baselineSnapshot,
    candidateSnapshot,
    selectedTaskA,
    selectedTaskB,
    compareReady,
    compareResult,
    baselineTasks,
    candidateTasks,
    matchedTaskNames,
    setBaselineSnapshot,
    setCandidateSnapshot,
    selectTaskA,
    selectTaskB,
    quickMatchTask,
    clearBaselineSnapshot,
    clearCandidateSnapshot,
    useBaselineAsCandidate,
    resetComparison,
  };
}
