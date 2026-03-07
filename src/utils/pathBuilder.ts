/**
 * @fileoverview 任务路径对比模块
 *
 * 提供两次任务执行的路径对比能力，包括：
 * - 使用 Needleman-Wunsch 算法进行全局序列对齐
 * - 检测循环节点（连续出现 3 次以上的节点）
 * - 检测路径分歧点
 * - 构建差异分组（状态变化、节点独有、路径分歧、耗时变化）
 *
 * @module utils/pathBuilder
 */
import type { TaskInfo, PathNode, PathComparison, PathBranch, PathLoop, CompareStatus, RecognitionSummary, ActionSummary, NextListItem, NextListAttempt, DiffGroup, DiffItem, DiffType } from "@/types/logTypes";

/**
 * 耗时变化阈值
 * 当节点耗时变化超过此比例时，标记为耗时异常
 */
const DURATION_THRESHOLD = 0.5;

/**
 * 构建两个任务的路径对比结果
 *
 * 核心流程：
 * 1. 提取两个任务的节点路径
 * 2. 使用 Needleman-Wunsch 算法进行全局序列对齐
 * 3. 检测循环和分支
 * 4. 统计各种差异类型
 *
 * @param taskA - 基准任务
 * @param taskB - 本次任务
 * @returns 完整的路径对比结果
 */
export function buildPathComparison(taskA: TaskInfo, taskB: TaskInfo): PathComparison {
  const nodesA = extractNodePath(taskA);
  const nodesB = extractNodePath(taskB);

  const aligned = lcsAlign(nodesA, nodesB, taskA, taskB);
  const loops = detectLoops(aligned);
  const branches = detectBranches(aligned);

  const equalCount = aligned.filter((n) => n.compareStatus === "equal").length;
  const aOnlyCount = aligned.filter((n) => n.compareStatus === "a_only").length;
  const bOnlyCount = aligned.filter((n) => n.compareStatus === "b_only").length;
  const divergedCount = aligned.filter((n) => n.compareStatus === "diverged").length;
  const diffGroups = buildDiffGroups(aligned);

  const statusChangedCount = diffGroups.find((g) => g.type === "status_changed")?.items.length ?? 0;
  const durationChangedCount = diffGroups.find((g) => g.type === "duration_changed")?.items.length ?? 0;

  return {
    nodes: aligned,
    branches,
    loops,
    summary: {
      totalA: nodesA.length,
      totalB: nodesB.length,
      equalCount,
      aOnlyCount,
      bOnlyCount,
      divergedCount,
      statusChangedCount,
      durationChangedCount,
      loopCount: loops.length,
    },
  };
}

/**
 * 构建差异分组
 *
 * 将对齐后的节点按差异类型分组：
 * - status_changed: 状态变化（成功→失败等）
 * - a_only: 基准任务独有的节点
 * - b_only: 本次任务独有的节点
 * - diverged: 路径分歧（同一位置不同节点）
 * - duration_changed: 耗时变化超过阈值
 *
 * @param alignedNodes - 对齐后的节点数组
 * @returns 按优先级排序的差异分组
 */
export function buildDiffGroups(alignedNodes: PathNode[]): DiffGroup[] {
  const itemsByType = new Map<string, DiffItem[]>();

  alignedNodes.forEach((node, i) => {
    const context = getNodeContext(alignedNodes, i);
    const baseItem = { index: i, name: node.name, context };

    switch (node.compareStatus) {
      case "a_only": {
        const item: DiffItem = { type: "a_only", ...baseItem, nodeA: node, description: `基准任务独有节点: ${node.name}` };
        if (itemsByType.has("a_only")) {
          itemsByType.get("a_only")!.push(item);
        } else {
          itemsByType.set("a_only", [item]);
        }
        break;
      }
      case "b_only": {
        const item: DiffItem = { type: "b_only", ...baseItem, nodeB: node, description: `本次任务独有节点: ${node.name}` };
        if (itemsByType.has("b_only")) {
          itemsByType.get("b_only")!.push(item);
        } else {
          itemsByType.set("b_only", [item]);
        }
        break;
      }
      case "diverged": {
        const item: DiffItem = { type: "diverged", ...baseItem, nodeA: node.taskA ? { ...node } : undefined, nodeB: node.taskB ? { ...node } : undefined, description: `执行路径分歧: ${node.name}` };
        if (itemsByType.has("diverged")) {
          itemsByType.get("diverged")!.push(item);
        } else {
          itemsByType.set("diverged", [item]);
        }
        break;
      }
      case "equal":
        if (node.taskA && node.taskB && node.taskA.duration > 0) {
          const durationB = node.taskB?.duration ?? 0;
          if (durationB > 0) {
            const change = Math.abs(durationB - node.taskA.duration) / node.taskA.duration;
            if (change >= DURATION_THRESHOLD) {
              const direction = durationB > node.taskA.duration ? "↑" : "↓";
              const item: DiffItem = {
                type: "duration_changed",
                ...baseItem,
                nodeA: node,
                nodeB: node.taskB ? { ...node } : undefined,
                description: `耗时变化: ${formatDuration(node.taskA.duration)} → ${formatDuration(durationB)} (${direction}${Math.round(change * 100)}%)`,
              };
              if (itemsByType.has("duration_changed")) {
                itemsByType.get("duration_changed")!.push(item);
              } else {
                itemsByType.set("duration_changed", [item]);
              }
            }
          }
        }
        break;
    }
  });

  const groupConfig: { type: DiffType; label: string; icon: string; priority: number }[] = [
    { type: "status_changed", label: "状态变化", icon: "🔴", priority: 1 },
    { type: "a_only", label: "基准独有", icon: "🔴", priority: 2 },
    { type: "b_only", label: "本次独有", icon: "🔴", priority: 3 },
    { type: "diverged", label: "分歧", icon: "🟡", priority: 4 },
    { type: "duration_changed", label: "耗时异常", icon: "🟡", priority: 5 },
  ];

  return groupConfig
    .filter((g) => itemsByType.has(g.type))
    .map((g) => ({ ...g, items: itemsByType.get(g.type)! }))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * 获取节点的上下文信息
 *
 * 返回指定位置前后各 2 个节点名称，用于在差异详情中显示
 *
 * @param alignedNodes - 对齐后的节点数组
 * @param index - 目标节点索引
 * @returns 前后各 2 个节点名称
 */
function getNodeContext(alignedNodes: PathNode[], index: number): { before: string[]; after: string[] } {
  const before: string[] = [];
  const after: string[] = [];

  for (let i = Math.max(0, index - 2); i < index; i++) {
    if (alignedNodes[i]) {
      before.push(alignedNodes[i].name);
    }
  }

  for (let i = index + 1; i <= Math.min(index + 2, alignedNodes.length - 1); i++) {
    if (alignedNodes[i]) {
      after.push(alignedNodes[i].name);
    }
  }

  return { before, after };
}

/**
 * 格式化耗时显示
 *
 * @param ms - 毫秒数
 * @returns 格式化后的耗时字符串
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m${remainSeconds}s`;
}

/**
 * 提取任务的节点名称序列
 *
 * @param task - 任务信息
 * @returns 节点名称数组
 */
function extractNodePath(task: TaskInfo): string[] {
  if (!task.nodes) return [];
  return task.nodes.map((n) => n.name);
}

/**
 * 提取节点的详细信息
 *
 * 从任务中查找指定名称的节点，提取其识别信息、动作信息和耗时
 *
 * @param nodeName - 节点名称
 * @param task - 任务信息
 * @returns 节点详情对象，包含识别信息、动作信息和耗时
 */
function extractNodeDetails(
  nodeName: string,
  task: TaskInfo
): { recognition?: RecognitionSummary; action?: ActionSummary; duration: number } | undefined {
  const node = task.nodes?.find((n) => n.name === nodeName);
  if (!node) return undefined;

  const duration = node.end_time && node.start_time
    ? new Date(node.end_time).getTime() - new Date(node.start_time).getTime()
    : 0;

  const recognition = node.reco_details ? {
    algorithm: node.reco_details.algorithm ?? "Unknown",
    confidence: undefined,
    box: node.reco_details.box ?? undefined,
    ...(node.reco_details.detail && typeof node.reco_details.detail === "object"
      ? { expected: (node.reco_details.detail as Record<string, unknown>).expected
          ? ((node.reco_details.detail as Record<string, unknown>).expected as string[]).join(", ")
          : undefined }
      : {}),
  } : undefined;

  const action = node.action_details ? {
    type: node.action_details.action ?? "Unknown",
    params: node.action_details.detail as Record<string, unknown> ?? {},
  } : undefined;

  return { recognition, action, duration };
}

/**
 * LCS 对齐（实际调用 Needleman-Wunsch 算法）
 *
 * 为保持 API 一致性，内部使用 Needleman-Wunsch 算法进行全局序列对齐
 *
 * @param nodesA - 基准任务节点名称数组
 * @param nodesB - 本次任务节点名称数组
 * @param taskA - 基准任务
 * @param taskB - 本次任务
 * @returns 对齐后的 PathNode 数组
 */
function lcsAlign(nodesA: string[], nodesB: string[], taskA: TaskInfo, taskB: TaskInfo): PathNode[] {
  return needlemanWunsch(nodesA, nodesB, taskA, taskB);
}

/**
 * Needleman-Wunsch 全局序列对齐算法
 *
 * 这是一种用于全局序列比对的动态规划算法，能够：
 * - 找到两个序列之间的最优对齐
 * - 允许插入和删除（gap）
 * - 给匹配高分、错配和空位罚分
 *
 * 算法步骤：
 * 1. 构建得分矩阵：dp[i][j] 表示序列A前i个元素和序列B前j个元素的最大得分
 * 2. 初始化：边界设为 gap 罚分之和
 * 3. 填表：对于每个位置，选择三种操作中的最优者
 *    - 对角线：匹配/错配
 *    - 上方：序列A插入 gap
 *    - 左方：序列B插入 gap
 * 4. 回溯：从右下角开始，根据方向矩阵重建最优路径
 *
 * @param nodesA - 基准任务节点名称数组
 * @param nodesB - 本次任务节点名称数组
 * @param taskA - 基准任务
 * @param taskB - 本次任务
 * @returns 对齐后的 PathNode 数组
 */
function needlemanWunsch(nodesA: string[], nodesB: string[], taskA: TaskInfo, taskB: TaskInfo): PathNode[] {
  const m = nodesA.length;
  const n = nodesB.length;

  /**
   * 得分设置
   * - MATCH_SCORE: 匹配得分（相同节点名）
   * - MISMATCH_PENALTY: 错配罚分（不同节点名）
   * - GAP_PENALTY: 空位罚分（插入或删除）
   */
  const MATCH_SCORE = 2;
  const MISMATCH_PENALTY = -1;
  const GAP_PENALTY = -1;

  /**
   * dp 得分矩阵
   * dp[i][j] 表示 A[0..i-1] 和 B[0..j-1] 对齐的最大得分
   */
  const score: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  /**
   * 方向矩阵，记录每个位置的最优操作
   * - "diag": 匹配/错配（从左上角来）
   * - "up": 插入 gap（从上方来）
   * - "left": 插入 gap（从左方来）
   * - "none": 初始状态
   */
  const direction: ("diag" | "up" | "left" | "none")[][] = Array(m + 1).fill(null)
    .map(() => Array(n + 1).fill("none"));

  // 初始化第一列：序列B为空，序列A只能通过插入 gap 对齐
  for (let i = 1; i <= m; i++) {
    score[i][0] = i * GAP_PENALTY;
    direction[i][0] = "up";
  }
  // 初始化第一行：序列A为空，序列B只能通过插入 gap 对齐
  for (let j = 1; j <= n; j++) {
    score[0][j] = j * GAP_PENALTY;
    direction[0][j] = "left";
  }
  direction[0][0] = "none";

  // 填表：计算每个位置的最大得分和方向
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      // 三种可能的操作
      const match = score[i - 1][j - 1] + (nodesA[i - 1] === nodesB[j - 1] ? MATCH_SCORE : MISMATCH_PENALTY);
      const del = score[i - 1][j] + GAP_PENALTY;  // 从上方来：在序列A中插入 gap
      const insert = score[i][j - 1] + GAP_PENALTY;  // 从左方来：在序列B中插入 gap

      // 选择得分最高的操作
      if (match >= del && match >= insert) {
        score[i][j] = match;
        direction[i][j] = "diag";
      } else if (del >= insert) {
        score[i][j] = del;
        direction[i][j] = "up";
      } else {
        score[i][j] = insert;
        direction[i][j] = "left";
      }
    }
  }

  // 回溯得到对齐结果
  const aligned = backtrackNW(nodesA, nodesB, direction);
  return buildPathNodes(aligned, taskA, taskB);
}

/**
 * 回溯 Needleman-Wunsch 方向矩阵，重建最优对齐路径
 *
 * @param nodesA - 基准任务节点名称数组
 * @param nodesB - 本次任务节点名称数组
 * @param direction - 方向矩阵
 * @returns 对齐结果，每项包含节点在两个序列中的索引
 */
function backtrackNW(
  nodesA: string[],
  nodesB: string[],
  direction: ("diag" | "up" | "left" | "none")[][]
): { nameA?: string; nameB?: string; indexA?: number; indexB?: number }[] {
  const result: { nameA?: string; nameB?: string; indexA?: number; indexB?: number }[] = [];
  let i = nodesA.length;
  let j = nodesB.length;

  // 从右下角开始回溯
  while (i > 0 || j > 0) {
    const dir = direction[i][j];

    // 根据方向决定如何回溯
    if (dir === "diag" && i > 0 && j > 0) {
      // 对角线：两个序列都有节点
      result.push({ nameA: nodesA[i - 1], nameB: nodesB[j - 1], indexA: i - 1, indexB: j - 1 });
      i--;
      j--;
    } else if (dir === "up" && i > 0) {
      // 上方：从序列A来，序列B插入 gap（基准任务独有节点）
      result.push({ nameA: nodesA[i - 1], indexA: i - 1 });
      i--;
    } else if (dir === "left" && j > 0) {
      // 左方：从序列B来，序列A插入 gap（本次任务独有节点）
      result.push({ nameB: nodesB[j - 1], indexB: j - 1 });
      j--;
    } else {
      // 边界情况处理
      if (i > 0) {
        result.push({ nameA: nodesA[i - 1], indexA: i - 1 });
        i--;
      } else if (j > 0) {
        result.push({ nameB: nodesB[j - 1], indexB: j - 1 });
        j--;
      }
    }
  }

  // 反转得到正确顺序
  result.reverse();
  return result;
}

/**
 * 将对齐结果转换为 PathNode 数组
 *
 * @param aligned - 对齐结果
 * @param taskA - 基准任务
 * @param taskB - 本次任务
 * @returns PathNode 数组
 */
function buildPathNodes(
  aligned: { nameA?: string; nameB?: string; indexA?: number; indexB?: number }[],
  taskA: TaskInfo,
  taskB: TaskInfo
): PathNode[] {
  const result: PathNode[] = [];
  let execIndex = 1;

  for (const item of aligned) {
    const hasA = item.nameA !== undefined;
    const hasB = item.nameB !== undefined;

    let compareStatus: CompareStatus;
    if (hasA && hasB && item.nameA === item.nameB) {
      compareStatus = "equal";
    } else if (hasA && !hasB) {
      compareStatus = "a_only";
    } else if (!hasA && hasB) {
      compareStatus = "b_only";
    } else {
      compareStatus = "diverged";
    }

    const nodeName = item.nameA ?? item.nameB ?? "";

    const taskNodeA = item.indexA !== undefined ? taskA.nodes?.[item.indexA] : undefined;
    const taskNodeB = item.indexB !== undefined ? taskB.nodes?.[item.indexB] : undefined;

    const nextListA = taskNodeA?.next_list ?? [];
    const nextListB = taskNodeB?.next_list ?? [];
    const nextList: NextListItem[] = nextListA.length > 0 ? nextListA : nextListB;

    const nextListAttemptsA = taskNodeA?.next_list_attempts ?? [];
    const nextListAttemptsB = taskNodeB?.next_list_attempts ?? [];
    const nextListAttempts: NextListAttempt[] = nextListAttemptsB.length > 0 ? nextListAttemptsB : nextListAttemptsA;

    result.push({
      id: `node-${execIndex - 1}`,
      name: nodeName,
      status: taskNodeB?.status ?? taskNodeA?.status ?? "skipped",
      executionIndex: execIndex,
      compareStatus,
      nextList: nextList.length > 0 ? nextList : undefined,
      nextListAttempts: nextListAttempts.length > 0 ? nextListAttempts : undefined,
      taskA: hasA && item.nameA ? extractNodeDetails(item.nameA, taskA) : undefined,
      taskB: hasB && item.nameB ? extractNodeDetails(item.nameB, taskB) : undefined,
    });

    execIndex++;
  }

  return result;
}

/**
 * 检测循环节点
 *
 * 循环节点定义：同一节点名称连续出现 3 次或以上
 *
 * 检测算法：
 * 1. 收集每个节点名称出现的所有位置索引
 * 2. 检查连续位置是否形成连续序列
 * 3. 如果连续出现次数 >= 3，则标记为循环
 *
 * @param alignedNodes - 对齐后的节点数组
 * @returns 检测到的循环节点列表
 */
function detectLoops(alignedNodes: PathNode[]): PathLoop[] {
  const loops: PathLoop[] = [];
  const nodePositions = new Map<string, number[]>();

  // 收集每个节点名称的所有位置
  alignedNodes.forEach((node, index) => {
    if (!nodePositions.has(node.name)) {
      nodePositions.set(node.name, []);
    }
    nodePositions.get(node.name)!.push(index);
  });

  // 检查每个节点名称是否存在连续循环
  nodePositions.forEach((positions, name) => {
    if (positions.length >= 3) {
      let consecutiveCount = 1;
      let startIdx = positions[0];

      for (let i = 1; i < positions.length; i++) {
        if (positions[i] === positions[i - 1] + 1) {
          consecutiveCount++;
        } else {
          // 连续序列中断，检查是否满足循环条件
          if (consecutiveCount >= 3) {
            loops.push({
              name,
              startIndex: startIdx,
              endIndex: positions[i - 1],
              count: consecutiveCount,
            });
          }
          consecutiveCount = 1;
          startIdx = positions[i];
        }
      }

      // 检查最后一段连续序列
      if (consecutiveCount >= 3) {
        loops.push({
          name,
          startIndex: startIdx,
          endIndex: positions[positions.length - 1],
          count: consecutiveCount,
        });
      }
    }
  });

  return loops;
}

/**
 * 检测路径分歧点
 *
 * 分歧点定义：两个任务从某个位置开始走不同的路径
 *
 * 检测逻辑：
 * 1. 找到第一个出现 compareStatus 为 diverged/a_only/b_only 的位置
 * 2. 从该位置开始，分别收集两个任务的路径
 *
 * @param alignedNodes - 对齐后的节点数组
 * @returns 分支信息，包含分歧位置和两条路径
 */
function detectBranches(alignedNodes: PathNode[]): PathBranch[] {
  const branches: PathBranch[] = [];
  const divergeIndex = alignedNodes.findIndex(
    (n) => n.compareStatus === "diverged" || n.compareStatus === "a_only" || n.compareStatus === "b_only"
  );

  if (divergeIndex >= 0) {
    const divergeFromNode = divergeIndex > 0 ? alignedNodes[divergeIndex - 1].name : "Start";

    const pathA: string[] = [];
    const pathB: string[] = [];

    for (let i = divergeIndex; i < alignedNodes.length; i++) {
      const node = alignedNodes[i];
      const status = node.compareStatus;
      if ((status === "equal" || status === "a_only" || status === "diverged") && node.taskA) {
        pathA.push(node.name);
      }
      if ((status === "equal" || status === "b_only" || status === "diverged") && node.taskB) {
        pathB.push(node.name);
      }
    }

    branches.push({
      index: divergeIndex,
      divergeFromNode,
      pathA,
      pathB,
    });
  }

  return branches;
}

/**
 * 获取指定位置的分支信息
 *
 * @param branches - 分支数组
 * @param index - 节点索引
 * @returns 该位置的分支列表
 */
export function getBranchesAtIndex(branches: PathBranch[], index: number): PathBranch[] {
  return branches.filter((b) => b.index === index);
}

/**
 * getBranchesAtIndex 的别名
 */
export const getBranchesAt = getBranchesAtIndex;

/**
 * 获取指定位置的节点
 *
 * @param nodes - 节点数组
 * @param index - 节点索引
 * @returns 节点对象，如果索引越界则返回 undefined
 */
export function getNodeAtIndex(nodes: PathNode[], index: number): PathNode | undefined {
  return nodes[index];
}

/**
 * 获取包含指定位置的循环信息
 *
 * @param loops - 循环数组
 * @param index - 节点索引
 * @returns 包含该位置的循环对象，如果不存在则返回 undefined
 */
export function getLoopAtIndex(loops: PathLoop[], index: number): PathLoop | undefined {
  return loops.find((l) => index >= l.startIndex && index <= l.endIndex);
}
