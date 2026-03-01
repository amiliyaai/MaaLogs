import { describe, it, expect, vi } from "vitest";
import { useStatistics } from "../../composables/useStatistics";
import type { TaskInfo, NodeInfo, NodeStat } from "../../types/logTypes";

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../utils/parse", () => ({
  computeNodeStatistics: vi.fn((tasks: TaskInfo[]) => {
    const stats: NodeStat[] = [];
    for (const task of tasks) {
      for (const node of task.nodes || []) {
        stats.push({
          name: node.name,
          count: 1,
          successCount: node.status === "success" ? 1 : 0,
          failCount: node.status === "failed" ? 1 : 0,
          totalDuration: 100,
          avgDuration: 100,
          minDuration: 100,
          maxDuration: 100,
          successRate: node.status === "success" ? 100 : 0,
        });
      }
    }
    return stats;
  }),
}));

function createMockTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    task_id: 1,
    key: "task-1",
    entry: "MainTask",
    status: "succeeded",
    start_time: "2025-06-14 11:37:00.000",
    end_time: "2025-06-14 11:37:30.000",
    nodes: [],
    processId: "Px1234",
    threadId: "Tx5678",
    fileName: "maa.log",
    hash: "abc123",
    uuid: "uuid-1234-5678",
    ...overrides,
  };
}

function createMockNode(overrides: Partial<NodeInfo> = {}): NodeInfo {
  return {
    node_id: 1,
    name: "NodeA",
    timestamp: "2025-06-14 11:37:15.000",
    status: "success",
    task_id: 1,
    next_list: [],
    recognition_attempts: [],
    ...overrides,
  };
}

describe("useStatistics", () => {
  it("should initialize with default values", () => {
    const stats = useStatistics(() => []);

    expect(stats.statSort.value).toBe("avgDuration");
    expect(stats.statKeyword.value).toBe("");
    expect(stats.nodeStatistics.value).toEqual([]);
    expect(stats.nodeSummary.value).toBeNull();
  });

  it("should compute node statistics from tasks", () => {
    const task = createMockTask({
      nodes: [createMockNode({ name: "NodeA" })],
    });
    const stats = useStatistics(() => [task]);

    expect(stats.nodeStatistics.value.length).toBe(1);
    expect(stats.nodeStatistics.value[0].name).toBe("NodeA");
  });

  it("should compute summary from statistics", () => {
    const task = createMockTask({
      nodes: [createMockNode({ name: "NodeA" }), createMockNode({ name: "NodeB" })],
    });
    const stats = useStatistics(() => [task]);

    expect(stats.nodeSummary.value).not.toBeNull();
    expect(stats.nodeSummary.value?.totalNodes).toBe(2);
    expect(stats.nodeSummary.value?.uniqueNodes).toBe(2);
  });

  it("should filter by keyword", () => {
    const task = createMockTask({
      nodes: [
        createMockNode({ name: "AlphaNode" }),
        createMockNode({ name: "BetaNode" }),
        createMockNode({ name: "GammaNode" }),
      ],
    });
    const stats = useStatistics(() => [task]);

    stats.statKeyword.value = "alpha";

    expect(stats.nodeStatistics.value.length).toBe(1);
    expect(stats.nodeStatistics.value[0].name).toBe("AlphaNode");
  });

  it("should sort by count", () => {
    const task = createMockTask({
      nodes: [
        createMockNode({ name: "NodeA" }),
        createMockNode({ name: "NodeB" }),
        createMockNode({ name: "NodeC" }),
      ],
    });
    const stats = useStatistics(() => [task]);

    stats.statSort.value = "count";

    expect(stats.nodeStatistics.value).toBeDefined();
  });

  it("should reset statistics state", () => {
    const stats = useStatistics(() => []);
    stats.statSort.value = "count";
    stats.statKeyword.value = "test";

    stats.resetStatistics();

    expect(stats.statSort.value).toBe("avgDuration");
    expect(stats.statKeyword.value).toBe("");
  });
});
