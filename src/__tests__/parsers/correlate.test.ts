import { describe, it, expect } from "vitest";
import {
  correlateAuxLogsWithTasks,
  DEFAULT_CORRELATION_CONFIG,
} from "../../parsers/correlate";
import type { AuxLogEntry, TaskInfo } from "../../types/logTypes";

function createMockTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    task_id: 1,
    key: "task-1",
    entry: "MainTask",
    status: "succeeded",
    start_time: "2025-06-14T11:37:00.000",
    end_time: "2025-06-14T11:37:30.000",
    nodes: [],
    processId: "Px1234",
    threadId: "Tx5678",
    fileName: "maa.log",
    hash: "abc123",
    uuid: "uuid-1234-5678",
    ...overrides,
  };
}

function createMockAuxLog(overrides: Partial<AuxLogEntry> = {}): AuxLogEntry {
  return {
    key: "log-1",
    source: "go-service",
    timestamp: "2025-06-14T11:37:15.000",
    timestampMs: new Date("2025-06-14T11:37:15.000").getTime(),
    level: "INFO",
    message: "Recognition started",
    fileName: "go-service.log",
    lineNumber: 1,
    ...overrides,
  };
}

describe("DEFAULT_CORRELATION_CONFIG", () => {
  it("should have default values", () => {
    expect(DEFAULT_CORRELATION_CONFIG.timeWindowMs).toBe(5000);
    expect(DEFAULT_CORRELATION_CONFIG.enableIdentifierMatch).toBe(true);
    expect(DEFAULT_CORRELATION_CONFIG.enableTaskIdMatch).toBe(true);
    expect(DEFAULT_CORRELATION_CONFIG.enableTimeWindowMatch).toBe(true);
    expect(DEFAULT_CORRELATION_CONFIG.enableKeywordMatch).toBe(true);
  });
});

describe("correlateAuxLogsWithTasks", () => {
  it("should return empty array for empty entries", () => {
    const tasks = [createMockTask()];
    const result = correlateAuxLogsWithTasks([], tasks);
    expect(result).toEqual([]);
  });

  it("should return entries for empty tasks", () => {
    const entry = createMockAuxLog();
    const result = correlateAuxLogsWithTasks([entry], []);
    expect(result).toHaveLength(1);
    expect(result[0].correlation).toBeUndefined();
  });

  it("should correlate by task_id", () => {
    const task = createMockTask({ task_id: 1 });
    const entry = createMockAuxLog({ task_id: 1 });

    const result = correlateAuxLogsWithTasks([entry], [task]);

    expect(result[0].correlation).toBeDefined();
    expect(result[0].correlation?.status).toBe("matched");
    expect(result[0].correlation?.taskKey).toBe("task-1");
  });

  it("should correlate by identifier", () => {
    const task = createMockTask({ identifier: "abc12345-def6-7890-abcd-ef1234567890" });
    const entry = createMockAuxLog({ identifier: "abc12345-def6-7890-abcd-ef1234567890" });

    const result = correlateAuxLogsWithTasks([entry], [task]);

    expect(result[0].correlation?.status).toBe("matched");
  });

  it("should correlate by time window within task range", () => {
    const task = createMockTask({
      start_time: "2025-06-14T11:37:00.000",
      end_time: "2025-06-14T11:37:30.000",
    });
    const entry = createMockAuxLog({
      timestamp: "2025-06-14T11:37:02.000",
      timestampMs: new Date("2025-06-14T11:37:02.000").getTime(),
    });

    const result = correlateAuxLogsWithTasks([entry], [task]);

    expect(result[0].correlation?.status).toBe("matched");
  });

  it("should mark as unmatched when no correlation found", () => {
    const task = createMockTask({ task_id: 1 });
    const entry = createMockAuxLog({
      task_id: 999,
      timestampMs: new Date("2025-06-14T12:00:00.000").getTime(),
    });

    const result = correlateAuxLogsWithTasks([entry], [task]);

    expect(result[0].correlation?.status).toBe("unmatched");
  });

  it("should handle multiple tasks", () => {
    const task1 = createMockTask({ task_id: 1, key: "task-1" });
    const task2 = createMockTask({ task_id: 2, key: "task-2" });
    const entry1 = createMockAuxLog({ task_id: 1, key: "log-1" });
    const entry2 = createMockAuxLog({ task_id: 2, key: "log-2" });

    const result = correlateAuxLogsWithTasks([entry1, entry2], [task1, task2]);

    expect(result[0].correlation?.taskKey).toBe("task-1");
    expect(result[1].correlation?.taskKey).toBe("task-2");
  });

  it("should respect custom config", () => {
    const task = createMockTask({ task_id: 1 });
    const entry = createMockAuxLog({ task_id: 1 });

    const config = {
      ...DEFAULT_CORRELATION_CONFIG,
      enableTaskIdMatch: false,
    };

    const result = correlateAuxLogsWithTasks([entry], [task], config);

    expect(result[0].correlation?.status).toBe("unmatched");
  });
});
