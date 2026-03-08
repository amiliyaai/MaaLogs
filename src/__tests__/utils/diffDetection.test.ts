import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeInfo, TaskInfo } from "@/types/logTypes";

const testState = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: testState.loggerWarn,
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/parse", () => ({
  computeNodeStatistics: vi.fn(() => [
    {
      name: "NodeA",
      count: 2,
      totalDuration: 1200,
      avgDuration: 600,
      minDuration: 500,
      maxDuration: 700,
      successCount: 2,
      failCount: 0,
      successRate: 100,
    },
  ]),
}));

import {
  buildParsedRunSnapshot,
  computeOverview,
  detectActionDiffs,
  detectDurationAnomalies,
  _detectFailedNodes as detectFailedNodes,
  detectKeyDiffs,
  detectNodeCountDiff,
  detectPathDivergence,
  detectRecognitionDiffs,
  matchNodes,
  sortDiffsBySeverity,
} from "@/utils/diffDetection";

function createNode(overrides: Partial<NodeInfo> = {}): NodeInfo {
  return {
    node_id: 1,
    name: "NodeA",
    timestamp: "2026-03-06 00:00:05.000",
    start_time: "2026-03-06 00:00:05.000",
    end_time: "2026-03-06 00:00:06.000",
    status: "success",
    task_id: 1,
    next_list: [],
    next_list_attempts: [],
    recognition_attempts: [],
    ...overrides,
  };
}

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    task_id: 1,
    key: "task-1",
    entry: "MainTask",
    status: "succeeded",
    start_time: "2026-03-06 00:00:00.000",
    end_time: "2026-03-06 00:00:10.000",
    nodes: [createNode()],
    processId: "Px1",
    threadId: "Tx1",
    fileName: "maa.log",
    hash: "hash",
    uuid: "uuid",
    ...overrides,
  };
}

describe("diffDetection", () => {
  beforeEach(() => {
    testState.loggerWarn.mockReset();
  });

  it("buildParsedRunSnapshot should aggregate task metadata", () => {
    const snapshot = buildParsedRunSnapshot({
      tasks: [createTask(), createTask({ key: "task-2", task_id: 2, status: "failed" })],
      sourceName: "run-a.log",
      detectedProject: "maaend",
      label: "基准运行",
    });

    expect(snapshot.sourceName).toBe("run-a.log");
    expect(snapshot.totalTaskCount).toBe(2);
    expect(snapshot.failedTaskCount).toBe(1);
    expect(snapshot.nodeSummary?.uniqueNodes).toBe(1);
  });

  it("computeOverview should calculate duration and node deltas", () => {
    const overview = computeOverview(
      createTask({ duration: 1000, nodes: [createNode(), createNode({ node_id: 2 })] }),
      createTask({ duration: 1500, nodes: [createNode()] })
    );

    expect(overview.durationChange).toBe(0.5);
    expect(overview.nodeCountChange).toBe(-0.5);
  });

  it("detectFailedNodes should report added and fixed failures", () => {
    const taskA = createTask({
      nodes: [createNode({ name: "A", status: "failed" }), createNode({ node_id: 2, name: "B" })],
    });
    const taskB = createTask({
      nodes: [createNode({ name: "B", status: "failed" }), createNode({ node_id: 2, name: "A" })],
    });
    const diffs = detectFailedNodes(taskA.nodes, taskB.nodes);

    expect(diffs.map((item: { description: string }) => item.description)).toEqual(
      expect.arrayContaining(["新增失败", "失败已修复"])
    );
  });

  it("detectDurationAnomalies should report significant node duration changes", () => {
    const taskA = createTask({
      nodes: [
        createNode({
          name: "NodeA",
          start_time: "2026-03-06 00:00:00.000",
          end_time: "2026-03-06 00:00:01.000",
        }),
      ],
    });
    const taskB = createTask({
      nodes: [
        createNode({
          name: "NodeA",
          start_time: "2026-03-06 00:00:00.000",
          end_time: "2026-03-06 00:00:03.000",
        }),
      ],
    });
    const diffs = detectDurationAnomalies(taskA, taskB);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe("duration");
  });

  it("detectPathDivergence should report first path mismatch", () => {
    const taskA = createTask({
      nodes: [createNode({ name: "Start" }), createNode({ node_id: 2, name: "PathA" })],
    });
    const taskB = createTask({
      nodes: [createNode({ name: "Start" }), createNode({ node_id: 2, name: "PathB" })],
    });
    const diffs = detectPathDivergence(taskA, taskB);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe("path");
  });

  it("detectRecognitionDiffs and detectActionDiffs should identify behavior changes", () => {
    const taskA = createTask({
      nodes: [
        createNode({
          name: "NodeA",
          reco_details: { reco_id: 1, algorithm: "OCR", box: null, detail: null, name: "NodeA" },
          action_details: {
            action_id: 1,
            action: "Click",
            box: [0, 0, 10, 10],
            detail: {},
            name: "NodeA",
            success: true,
          },
        }),
      ],
    });
    const taskB = createTask({
      nodes: [
        createNode({
          name: "NodeA",
          reco_details: {
            reco_id: 1,
            algorithm: "TemplateMatch",
            box: null,
            detail: null,
            name: "NodeA",
          },
          action_details: {
            action_id: 1,
            action: "Swipe",
            box: [0, 0, 10, 10],
            detail: {},
            name: "NodeA",
            success: true,
          },
        }),
      ],
    });

    expect(detectRecognitionDiffs(taskA, taskB)).toHaveLength(1);
    expect(detectActionDiffs(taskA, taskB)).toHaveLength(1);
  });

  it("detectNodeCountDiff should report node list length changes", () => {
    const diffs = detectNodeCountDiff(
      createTask({ nodes: [createNode()] }),
      createTask({ nodes: [createNode(), createNode({ node_id: 2 })] })
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe("node_count");
  });

  it("matchNodes should prefer same index then fallback to same name", () => {
    const nodesA = [createNode({ name: "A", node_id: 1 }), createNode({ name: "B", node_id: 2 })];
    const nodesB = [createNode({ name: "B", node_id: 10 }), createNode({ name: "A", node_id: 1 })];
    const matched = matchNodes(nodesA, nodesB);

    expect(matched).toHaveLength(2);
    expect(matched[0].nodeB.name).toBe("A");
  });

  it("detectKeyDiffs should return sorted combined diffs", () => {
    const taskA = createTask({
      nodes: [
        createNode({
          name: "NodeA",
          status: "success",
          start_time: "2026-03-06 00:00:00.000",
          end_time: "2026-03-06 00:00:01.000",
        }),
      ],
    });
    const taskB = createTask({
      status: "failed",
      nodes: [
        createNode({
          name: "NodeA",
          status: "failed",
          start_time: "2026-03-06 00:00:00.000",
          end_time: "2026-03-06 00:00:03.000",
        }),
        createNode({ node_id: 2, name: "NodeB" }),
      ],
    });
    const diffs = detectKeyDiffs(taskA, taskB);

    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs[0].severity).toBe("critical");
  });

  it("sortDiffsBySeverity should apply severity ordering", () => {
    const sorted = sortDiffsBySeverity([
      { id: "1", type: "action", severity: "info", nodeName: "Z", description: "" },
      { id: "2", type: "failed", severity: "critical", nodeName: "A", description: "" },
      { id: "3", type: "duration", severity: "warning", nodeName: "B", description: "" },
    ]);
    expect(sorted.map((item) => item.severity)).toEqual(["critical", "warning", "info"]);
  });

  it("should emit warning when timestamp parsing fails", () => {
    const overview = computeOverview(
      createTask({
        duration: undefined,
        start_time: "invalid-time",
        end_time: "invalid-time",
        nodes: [],
      }),
      createTask({
        duration: undefined,
        start_time: "invalid-time",
        end_time: "invalid-time",
        nodes: [],
      })
    );
    expect(overview.baselineDuration).toBe(0);
    expect(testState.loggerWarn).toHaveBeenCalled();
  });

  it("should use action detail cost when calculating node duration anomaly", () => {
    const taskA = createTask({
      nodes: [
        createNode({
          name: "CostNode",
          start_time: undefined,
          end_time: undefined,
          action_details: {
            action_id: 1,
            action: "Click",
            box: [0, 0, 0, 0],
            detail: { cost: 100 },
            name: "CostNode",
            success: true,
          },
        }),
      ],
    });
    const taskB = createTask({
      nodes: [
        createNode({
          name: "CostNode",
          start_time: undefined,
          end_time: undefined,
          action_details: {
            action_id: 2,
            action: "Click",
            box: [0, 0, 0, 0],
            detail: { cost: 300 },
            name: "CostNode",
            success: true,
          },
        }),
      ],
    });
    const diffs = detectDurationAnomalies(taskA, taskB);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].baselineValue).toBe(100);
    expect(diffs[0].candidateValue).toBe(300);
  });

  it("should fallback snapshot id with random bytes when randomUUID unavailable", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (arr: Uint8Array) => {
          arr.fill(10);
          return arr;
        },
      },
    });

    const snapshot = buildParsedRunSnapshot({
      tasks: [createTask()],
      sourceName: "run-fallback.log",
      detectedProject: "maaend",
      label: "fallback",
    });

    expect(snapshot.id).toMatch(/^\d+-[0-9a-f]+$/);
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  });

  it("should fallback snapshot id with timestamp suffix when crypto is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });

    const snapshot = buildParsedRunSnapshot({
      tasks: [createTask()],
      sourceName: "run-no-crypto.log",
      detectedProject: "maaend",
      label: "no-crypto",
    });

    expect(snapshot.id).toMatch(/^\d+-snapshot$/);
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  });
});
