import { describe, expect, it } from "vitest";
import { useRunComparison } from "@/composables/useRunComparison";
import type { ParsedRunSnapshot, TaskInfo, NodeInfo } from "@/types/logTypes";

function createNode(overrides: Partial<NodeInfo> = {}): NodeInfo {
  return {
    node_id: 1,
    name: "NodeA",
    timestamp: "2026-03-06 00:00:05.000",
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
    end_time: "2026-03-06 00:00:01.000",
    nodes: [createNode()],
    processId: "Px1",
    threadId: "Tx1",
    fileName: "maa.log",
    hash: "hash",
    uuid: "uuid",
    ...overrides,
  };
}

function createSnapshot(id: string, tasks: TaskInfo[]): ParsedRunSnapshot {
  return {
    id,
    label: id,
    sourceName: `${id}.log`,
    parsedAt: "2026-03-06T00:00:00.000Z",
    tasks,
    nodeStatistics: [],
    nodeSummary: null,
    detectedProject: "maaend",
    totalTaskCount: tasks.length,
    failedTaskCount: tasks.filter((task) => task.status === "failed").length,
  };
}

describe("useRunComparison", () => {
  it("should initialize empty comparison state", () => {
    const state = useRunComparison();
    expect(state.baselineSnapshot.value).toBeNull();
    expect(state.candidateSnapshot.value).toBeNull();
    expect(state.compareReady.value).toBe(false);
    expect(state.compareResult.value).toBeNull();
  });

  it("should set snapshots and auto-select first tasks", () => {
    const state = useRunComparison();
    const baseline = createSnapshot("baseline", [createTask()]);
    const candidate = createSnapshot("candidate", [createTask({ key: "task-2", task_id: 2 })]);

    state.setBaselineSnapshot(baseline);
    state.setCandidateSnapshot(candidate);

    expect(state.selectedTaskA.value?.key).toBe("task-1");
    expect(state.selectedTaskB.value?.key).toBe("task-2");
  });

  it("should quick-match tasks by entry name", () => {
    const state = useRunComparison();
    const baseline = createSnapshot("baseline", [createTask({ key: "a", entry: "SharedTask" })]);
    const candidate = createSnapshot("candidate", [createTask({ key: "b", task_id: 2, entry: "SharedTask" })]);

    state.setBaselineSnapshot(baseline);
    state.setCandidateSnapshot(candidate);
    state.quickMatchTask("SharedTask");

    expect(state.selectedTaskA.value?.entry).toBe("SharedTask");
    expect(state.selectedTaskB.value?.entry).toBe("SharedTask");
    expect(state.compareReady.value).toBe(true);
  });

  it("should compute compare result with overview and diffs", () => {
    const state = useRunComparison();
    const baseline = createSnapshot("baseline", [
      createTask({
        key: "task-a",
        duration: 1000,
        nodes: [createNode({ name: "NodeA", status: "success" })],
      }),
    ]);
    const candidate = createSnapshot("candidate", [
      createTask({
        key: "task-b",
        task_id: 2,
        status: "failed",
        duration: 1800,
        nodes: [createNode({ name: "NodeA", status: "failed" }), createNode({ node_id: 2, name: "NodeB" })],
      }),
    ]);

    state.setBaselineSnapshot(baseline);
    state.setCandidateSnapshot(candidate);
    state.quickMatchTask("MainTask");

    expect(state.compareResult.value).not.toBeNull();
    expect(state.compareResult.value?.overview.durationChange).toBeGreaterThan(0);
    expect(state.compareResult.value?.keyDiffs.length).toBeGreaterThan(0);
  });

  it("should clear snapshot and reset selected task", () => {
    const state = useRunComparison();
    state.setBaselineSnapshot(createSnapshot("baseline", [createTask()]));
    state.clearBaselineSnapshot();
    expect(state.baselineSnapshot.value).toBeNull();
    expect(state.selectedTaskA.value).toBeNull();
  });

  it("should clear candidate snapshot and reset selected task B", () => {
    const state = useRunComparison();
    state.setCandidateSnapshot(createSnapshot("candidate", [createTask({ key: "task-b", task_id: 2 })]));
    state.clearCandidateSnapshot();
    expect(state.candidateSnapshot.value).toBeNull();
    expect(state.selectedTaskB.value).toBeNull();
  });

  it("should keep selected tasks when replacing snapshots with same keys", () => {
    const state = useRunComparison();
    const baselineTask = createTask({ key: "keep-a", task_id: 10 });
    const candidateTask = createTask({ key: "keep-b", task_id: 11 });
    state.setBaselineSnapshot(createSnapshot("baseline-1", [baselineTask]));
    state.setCandidateSnapshot(createSnapshot("candidate-1", [candidateTask]));
    state.selectTaskA(baselineTask);
    state.selectTaskB(candidateTask);

    state.setBaselineSnapshot(
      createSnapshot("baseline-2", [createTask({ key: "keep-a", task_id: 20, entry: "MainTask" })])
    );
    state.setCandidateSnapshot(
      createSnapshot("candidate-2", [createTask({ key: "keep-b", task_id: 21, entry: "MainTask" })])
    );

    expect(state.selectedTaskA.value?.key).toBe("keep-a");
    expect(state.selectedTaskB.value?.key).toBe("keep-b");
  });

  it("should clear selected tasks when snapshots are set to null", () => {
    const state = useRunComparison();
    state.setBaselineSnapshot(createSnapshot("baseline", [createTask({ key: "a" })]));
    state.setCandidateSnapshot(createSnapshot("candidate", [createTask({ key: "b", task_id: 2 })]));
    state.setBaselineSnapshot(null);
    state.setCandidateSnapshot(null);
    expect(state.selectedTaskA.value).toBeNull();
    expect(state.selectedTaskB.value).toBeNull();
    expect(state.compareResult.value).toBeNull();
  });

  it("should allow manual selection update and handle unmatched quick match", () => {
    const state = useRunComparison();
    state.setBaselineSnapshot(createSnapshot("baseline", [createTask({ key: "a", entry: "TaskA" })]));
    state.setCandidateSnapshot(createSnapshot("candidate", [createTask({ key: "b", task_id: 2, entry: "TaskB" })]));
    state.selectTaskA(state.baselineTasks.value[0]);
    state.selectTaskB(state.candidateTasks.value[0]);
    expect(state.compareResult.value).not.toBeNull();

    state.quickMatchTask("NotExists");
    expect(state.selectedTaskA.value).toBeNull();
    expect(state.selectedTaskB.value).toBeNull();
    expect(state.compareResult.value).toBeNull();
  });

  it("should reset all comparison state", () => {
    const state = useRunComparison();
    state.setBaselineSnapshot(createSnapshot("baseline", [createTask()]));
    state.setCandidateSnapshot(createSnapshot("candidate", [createTask({ key: "other", task_id: 2 })]));

    state.resetComparison();

    expect(state.baselineSnapshot.value).toBeNull();
    expect(state.candidateSnapshot.value).toBeNull();
    expect(state.selectedTaskA.value).toBeNull();
    expect(state.selectedTaskB.value).toBeNull();
  });
});
