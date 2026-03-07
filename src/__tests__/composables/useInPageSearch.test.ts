/**
 * @fileoverview useInPageSearch composable 单元测试
 *
 * 测试覆盖：
 * - 默认搜索状态
 * - 任务搜索
 * - 辅助日志搜索
 *
 * @module __tests__/composables/useInPageSearch.test
 * @author MaaLogs Team
 * @license MIT
 */

import { describe, expect, it } from "vitest";
import { useInPageSearch } from "@/composables/useInPageSearch";
import type { AuxLogEntry, TaskInfo } from "@/types/logTypes";

function createMockTasks(): TaskInfo[] {
  return [
    {
      key: "task-1",
      fileName: "maa.log",
      task_id: 1001,
      entry: "MainTask",
      hash: "",
      uuid: "",
      start_time: "2026-03-06 10:00:00.000",
      status: "succeeded",
      nodes: [
        {
          node_id: 2001,
          name: "TraceNode",
          timestamp: "2026-03-06 10:00:02.000",
          status: "failed",
          task_id: 1001,
          next_list: [],
          next_list_attempts: [],
          action_details: {
            action: "Click",
            action_id: 4001,
            name: "TraceAction",
            success: false,
            box: [0, 0, 10, 10],
            detail: {},
          },
          recognition_attempts: [
            {
              reco_id: 3001,
              name: "TemplateReco",
              timestamp: "2026-03-06 10:00:02.100",
              status: "failed",
              reco_details: {
                reco_id: 3001,
                name: "TemplateReco",
                algorithm: "TemplateMatch",
                box: [0, 0, 10, 10],
                detail: null,
              },
            },
          ],
          nested_recognition_in_action: [],
          nested_action_nodes: [],
        },
      ],
      processId: "Px1",
      threadId: "Tx1",
    },
  ];
}

function createMockAuxLogs(): Map<string, AuxLogEntry[]> {
  return new Map([
    [
      "task-1",
      [
        {
          key: "aux-1",
          source: "custom",
          timestamp: "2026-03-06 10:00:01.000",
          level: "error",
          message: "network timeout while retrying request",
          task_id: 1001,
          entry: "",
          fileName: "go-service.log",
          lineNumber: 42,
        },
      ],
    ],
  ]);
}

describe("useInPageSearch", () => {
  it("should initialize with default values", () => {
    const searcher = useInPageSearch();

    expect(searcher.searchText.value).toBe("");
    expect(searcher.searchScope.value).toBe("all");
    expect(searcher.searchResults.value).toEqual([]);
    expect(searcher.showResults.value).toBe(false);
  });

  it("should search tasks without aux logs", () => {
    const searcher = useInPageSearch();

    searcher.searchText.value = "MainTask";
    searcher.performSearch(createMockTasks());

    expect(searcher.searchResults.value).toHaveLength(1);
    expect(searcher.searchResults.value[0].type).toBe("task");
    expect(searcher.showResults.value).toBe(true);
  });

  it("should search aux logs when aux log map is provided", () => {
    const searcher = useInPageSearch();

    searcher.searchScope.value = "auxlog";
    searcher.searchText.value = "timeout";
    searcher.performSearch(createMockTasks(), createMockAuxLogs());

    expect(searcher.searchResults.value).toHaveLength(1);
    expect(searcher.searchResults.value[0].type).toBe("auxlog");
    expect(searcher.searchResults.value[0].taskId).toBe(1001);
    expect(searcher.searchResults.value[0].taskKey).toBe("task-1");
    expect(searcher.searchResults.value[0].taskName).toBe("MainTask");
    expect(searcher.searchResults.value[0].auxLogKey).toBe("aux-1");
    expect(searcher.searchResults.value[0].value).toContain("network timeout");
    expect(searcher.showResults.value).toBe(true);
  });

  it("should include rich metadata for other result types", () => {
    const searcher = useInPageSearch();
    const tasks = createMockTasks();

    searcher.searchScope.value = "task";
    searcher.searchText.value = "1001";
    searcher.performSearch(tasks);
    expect(searcher.searchResults.value[0].extra).toMatchObject({
      status: "succeeded",
      processId: "Px1",
      threadId: "Tx1",
    });

    searcher.searchScope.value = "recognition";
    searcher.searchText.value = "TemplateMatch";
    searcher.performSearch(tasks);
    expect(searcher.searchResults.value[0].extra).toMatchObject({
      recoName: "TemplateReco",
      algorithm: "TemplateMatch",
      status: "failed",
    });

    searcher.searchScope.value = "action";
    searcher.searchText.value = "Click";
    searcher.performSearch(tasks);
    expect(searcher.searchResults.value[0].extra).toMatchObject({
      actionType: "Click",
      status: "failed",
    });
  });
});
