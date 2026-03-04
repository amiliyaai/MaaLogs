/**
 * @fileoverview parse.ts 解析工具函数单元测试
 *
 * 测试覆盖：
 * - parseAdbScreencapMethods/parseAdbInputMethods: ADB 方式解析
 * - parseWin32ScreencapMethod/parseWin32InputMethod: Win32 方式解析
 * - StringPool: 字符串池
 * - normalizeId: ID 标准化
 * - parseTimestampToMs: 时间戳解析
 * - extractIdentifierFromLine: identifier 提取
 * - buildIdentifierRanges: identifier 范围构建
 * - parseLine/parseEventNotification: 日志行解析
 * - buildFocusLogEntries: 焦点日志构建
 * - normalizeSearchLine: 搜索行标准化
 * - computeNodeStatistics: 节点统计计算
 *
 * @module __tests__/utils/parse.test
 * @author MaaLogs Team
 * @license MIT
 */

import { describe, it, expect } from "vitest";
import {
  parseAdbScreencapMethods,
  parseAdbInputMethods,
  parseWin32ScreencapMethod,
  parseWin32InputMethod,
  StringPool,
  normalizeId,
  parseTimestampToMs,
  extractIdentifierFromLine,
  buildIdentifierRanges,
  parseLine,
  parseEventNotification,
  buildFocusLogEntries,
  normalizeSearchLine,
  computeNodeStatistics,
} from "@/utils/parse";
import type { EventNotification } from "@/types/logTypes";

describe("parseAdbScreencapMethods", () => {
  it("should parse single method", () => {
    expect(parseAdbScreencapMethods(1)).toEqual(["EncodeToFileAndPull"]);
    expect(parseAdbScreencapMethods(2)).toEqual(["Encode"]);
    expect(parseAdbScreencapMethods(64)).toEqual(["EmulatorExtras"]);
  });

  it("should parse combined methods", () => {
    const result = parseAdbScreencapMethods(1 | 2 | 4);
    expect(result).toContain("EncodeToFileAndPull");
    expect(result).toContain("Encode");
    expect(result).toContain("RawWithGzip");
  });

  it("should return Unknown for zero", () => {
    expect(parseAdbScreencapMethods(0)).toEqual(["Unknown"]);
  });

  it("should handle all bits set - boundary value", () => {
    const result = parseAdbScreencapMethods(0xffffffff);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle negative values - boundary value", () => {
    const result = parseAdbScreencapMethods(-1);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("parseAdbInputMethods", () => {
  it("should parse single method", () => {
    expect(parseAdbInputMethods(1)).toEqual(["AdbShell"]);
    expect(parseAdbInputMethods(2)).toEqual(["MinitouchAndAdbKey"]);
    expect(parseAdbInputMethods(4)).toEqual(["Maatouch"]);
  });

  it("should parse combined methods", () => {
    const result = parseAdbInputMethods(1 | 2);
    expect(result).toContain("AdbShell");
    expect(result).toContain("MinitouchAndAdbKey");
  });

  it("should handle bigint input", () => {
    expect(parseAdbInputMethods(BigInt(2))).toEqual(["MinitouchAndAdbKey"]);
  });

  it("should return Unknown for zero", () => {
    expect(parseAdbInputMethods(0)).toEqual(["Unknown"]);
  });
});

describe("parseWin32ScreencapMethod", () => {
  it("should parse valid values", () => {
    expect(parseWin32ScreencapMethod(1)).toBe("GDI");
    expect(parseWin32ScreencapMethod(2)).toBe("FramePool");
    expect(parseWin32ScreencapMethod(4)).toBe("DXGI_DesktopDup");
  });

  it("should return Unknown for invalid value", () => {
    expect(parseWin32ScreencapMethod(999)).toBe("Unknown");
    expect(parseWin32ScreencapMethod(0)).toBe("Unknown");
  });
});

describe("parseWin32InputMethod", () => {
  it("should parse valid values", () => {
    expect(parseWin32InputMethod(1)).toBe("Seize");
    expect(parseWin32InputMethod(2)).toBe("SendMessage");
    expect(parseWin32InputMethod(4)).toBe("PostMessage");
  });

  it("should return Unknown for invalid value", () => {
    expect(parseWin32InputMethod(999)).toBe("Unknown");
  });
});

describe("StringPool", () => {
  it("should intern strings", () => {
    const pool = new StringPool();
    const s1 = pool.intern("test");
    const s2 = pool.intern("test");
    expect(s1).toBe(s2);
  });

  it("should handle null and undefined", () => {
    const pool = new StringPool();
    expect(pool.intern(null)).toBe("");
    expect(pool.intern(undefined)).toBe("");
  });

  it("should clear pool", () => {
    const pool = new StringPool();
    pool.intern("test");
    pool.clear();
    const s = pool.intern("test");
    expect(s).toBe("test");
  });
});

describe("normalizeId", () => {
  it("should normalize number", () => {
    expect(normalizeId(123)).toBe(123);
    expect(normalizeId(0)).toBe(0);
  });

  it("should normalize string number", () => {
    expect(normalizeId("456")).toBe(456);
    expect(normalizeId("  789  ")).toBe(789);
  });

  it("should return undefined for invalid", () => {
    expect(normalizeId("abc")).toBeUndefined();
    expect(normalizeId(null)).toBeUndefined();
    expect(normalizeId(undefined)).toBeUndefined();
    expect(normalizeId(NaN)).toBeUndefined();
  });

  it("should handle boundary numbers - boundary value", () => {
    expect(normalizeId(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(normalizeId(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER);
    expect(normalizeId(-1)).toBe(-1);
  });

  it("should handle string with special characters - equivalence class", () => {
    expect(normalizeId("123abc")).toBeUndefined();
    expect(normalizeId("12.34")).toBeUndefined();
    expect(normalizeId("12e5")).toBeUndefined();
  });

  it("should handle empty and whitespace strings - boundary value", () => {
    expect(normalizeId("")).toBeUndefined();
    expect(normalizeId("   ")).toBeUndefined();
    expect(normalizeId("\t\n")).toBeUndefined();
  });

  it("should handle very large string numbers - boundary value", () => {
    const result = normalizeId("999999999999999999999");
    expect(typeof result).toBe("number");
  });
});

describe("parseTimestampToMs", () => {
  it("should parse valid timestamp", () => {
    const result = parseTimestampToMs("2025-06-14 11:37:29.601");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("number");
  });

  it("should parse ISO format", () => {
    const result = parseTimestampToMs("2025-06-14T11:37:29.601Z");
    expect(result).not.toBeNull();
  });

  it("should return null for invalid", () => {
    expect(parseTimestampToMs("")).toBeNull();
    expect(parseTimestampToMs("invalid")).toBeNull();
    expect(parseTimestampToMs(undefined)).toBeNull();
  });

  it("should handle leap year - boundary value", () => {
    const result = parseTimestampToMs("2024-02-29 12:00:00.000");
    expect(result).not.toBeNull();
  });

  it("should handle invalid leap year - boundary value", () => {
    const result = parseTimestampToMs("2023-02-29 12:00:00.000");
    expect(typeof result).toBe("number");
  });

  it("should handle year boundary - boundary value", () => {
    const result1 = parseTimestampToMs("2025-01-01 00:00:00.000");
    expect(result1).not.toBeNull();

    const result2 = parseTimestampToMs("2025-12-31 23:59:59.999");
    expect(result2).not.toBeNull();
  });

  it("should handle invalid month - boundary value", () => {
    expect(parseTimestampToMs("2025-00-01 12:00:00")).toBeNull();
    expect(parseTimestampToMs("2025-13-01 12:00:00")).toBeNull();
  });

  it("should handle invalid day - boundary value", () => {
    expect(parseTimestampToMs("2025-06-00 12:00:00")).toBeNull();
    expect(parseTimestampToMs("2025-06-32 12:00:00")).toBeNull();
  });

  it("should handle invalid hour - boundary value", () => {
    expect(typeof parseTimestampToMs("2025-06-14 24:00:00")).toBe("number");
    expect(parseTimestampToMs("2025-06-14 -1:00:00")).toBeNull();
  });

  it("should handle invalid minute - boundary value", () => {
    expect(parseTimestampToMs("2025-06-14 12:60:00")).toBeNull();
    expect(parseTimestampToMs("2025-06-14 12:-1:00")).not.toBeNull();
  });

  it("should handle null input - boundary value", () => {
    expect(parseTimestampToMs(null as unknown as string)).toBeNull();
  });

  it("should handle timestamp without milliseconds - equivalence class", () => {
    const result = parseTimestampToMs("2025-06-14 11:37:29");
    expect(result).not.toBeNull();
  });

  it("should handle timestamp with timezone - equivalence class", () => {
    const result = parseTimestampToMs("2025-06-14T11:37:29+08:00");
    expect(result).not.toBeNull();
  });
});

describe("extractIdentifierFromLine", () => {
  it("should extract valid identifier", () => {
    const line =
      "[2025-06-14 11:37:25.619][identifier=abc12345-def6-7890-abcd-ef1234567890] Task started";
    const result = extractIdentifierFromLine(line);
    expect(result).toBe("abc12345-def6-7890-abcd-ef1234567890");
  });

  it("should extract identifier with underscore format", () => {
    const line =
      "[2025-06-14 11:37:25.619][identifier_abc12345-def6-7890-abcd-ef1234567890] Task started";
    const result = extractIdentifierFromLine(line);
    expect(result).toBe("abc12345-def6-7890-abcd-ef1234567890");
  });

  it("should return null for no identifier", () => {
    expect(extractIdentifierFromLine("No identifier here")).toBeNull();
  });

  it("should return null for invalid identifier format", () => {
    expect(extractIdentifierFromLine("[identifier=invalid]")).toBeNull();
  });

  it("should handle empty line - boundary value", () => {
    expect(extractIdentifierFromLine("")).toBeNull();
  });

  it("should handle identifier at end of line - boundary value", () => {
    const line = "Some text [identifier=abc12345-def6-7890-abcd-ef1234567890]";
    const result = extractIdentifierFromLine(line);
    expect(result).toBe("abc12345-def6-7890-abcd-ef1234567890");
  });

  it("should reject malformed UUID - boundary value", () => {
    expect(extractIdentifierFromLine("[identifier=not-a-valid-uuid]")).toBeNull();
    expect(extractIdentifierFromLine("[identifier=12345]")).toBeNull();
  });

  it("should extract first identifier when multiple present - equivalence class", () => {
    const line =
      "[identifier=abc12345-def6-7890-abcd-ef1234567890] [identifier=fed98765-4321-dcba-fedc-ba9876543210]";
    const result = extractIdentifierFromLine(line);
    expect(result).toBe("abc12345-def6-7890-abcd-ef1234567890");
  });
});

describe("buildIdentifierRanges", () => {
  it("should build ranges from map", () => {
    const map = new Map<number, string>();
    map.set(0, "id1");
    map.set(5, "id2");

    const ranges = buildIdentifierRanges(map, 10);

    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ identifier: "id1", startIndex: 0, endIndex: 4 });
    expect(ranges[1]).toEqual({ identifier: "id2", startIndex: 5, endIndex: 9 });
  });

  it("should return empty array for empty map", () => {
    const ranges = buildIdentifierRanges(new Map(), 10);
    expect(ranges).toEqual([]);
  });
});

describe("parseLine", () => {
  it("should parse valid log line", () => {
    const line =
      "[2025-06-14 11:37:29.601][INF][Px4224][Tx33237][TaskBase.cpp][L131] node hit [result.name=TheAlarm]";
    const result = parseLine(line, 1);

    expect(result).not.toBeNull();
    expect(result?.timestamp).toBe("2025-06-14 11:37:29.601");
    expect(result?.level).toBe("INF");
    expect(result?.processId).toBe("Px4224");
    expect(result?.threadId).toBe("Tx33237");
    expect(result?.sourceFile).toBe("TaskBase.cpp");
    expect(result?.lineNumber).toBe("L131");
    expect(result?.message).toContain("node hit");
  });

  it("should return null for invalid line", () => {
    expect(parseLine("invalid line", 1)).toBeNull();
  });

  it("should return null for line with too few tokens", () => {
    expect(parseLine("[only][three][tokens]", 1)).toBeNull();
  });

  it("should parse line without source file", () => {
    const line = "[2025-06-14 11:37:29.601][INF][Px4224][Tx33237] simple message";
    const result = parseLine(line, 1);

    expect(result).not.toBeNull();
    expect(result?.message).toBe("simple message");
  });
});

describe("parseEventNotification", () => {
  it("should parse OnEventNotify message", () => {
    const line = `[2025-06-14 11:37:29.601][INF][Px4224][Tx33237][EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.PipelineNode.Succeeded] [details={"name":"TestNode"}]`;
    const parsed = parseLine(line, 1);
    const result = parsed ? parseEventNotification(parsed, "maa.log") : null;

    expect(result).not.toBeNull();
    expect(result?.message).toBe("Node.PipelineNode.Succeeded");
    expect(result?.details.name).toBe("TestNode");
  });

  it("should return null for non-OnEventNotify message", () => {
    const line = `[2025-06-14 11:37:29.601][INF][Px4224][Tx33237][TaskBase.cpp][L131] node hit`;
    const parsed = parseLine(line, 1);
    const result = parsed ? parseEventNotification(parsed, "maa.log") : null;
    expect(result).toBeNull();
  });
});

describe("buildFocusLogEntries", () => {
  it("should build focus log entries with template", () => {
    const events: EventNotification[] = [
      {
        timestamp: "2026-03-02 12:11:42.551",
        level: "INF",
        processId: "Px1",
        threadId: "Tx1",
        message: "Node.Recognition.Starting",
        details: {
          task_id: 1,
          entry: "MainTask",
          name: "TestNode",
          focus: {
            "Node.Recognition.Starting": "Focus {name} #{task_id}",
          },
        },
        fileName: "maa.log",
        _lineNumber: 10,
      },
    ];

    const entries = buildFocusLogEntries(events);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("Focus TestNode #1");
    expect(entries[0].level).toBe("info");
    expect(entries[0].task_id).toBe(1);
    expect(entries[0].entry).toBe("MainTask");
  });

  it("should build focus log entries from PipelineNode events (real-world scenario)", () => {
    const events: EventNotification[] = [
      {
        timestamp: "2026-03-02 12:11:42.000",
        level: "INF",
        processId: "Px1",
        threadId: "Tx1",
        message: "Node.PipelineNode.Starting",
        details: {
          name: "SeizeEntrustTaskFound7.31wMoney",
          focus: {
            "Node.Recognition.Failed": "不对不对，不是武陵订单！",
            "Node.Recognition.Starting": "再看一眼~",
            "Node.Recognition.Succeeded": "确定就是你啦~",
          },
        },
        fileName: "maa.log",
        _lineNumber: 1,
      },
      {
        timestamp: "2026-03-02 12:11:42.551",
        level: "INF",
        processId: "Px1",
        threadId: "Tx1",
        message: "Node.Recognition.Starting",
        details: {
          task_id: 1,
          entry: "MainTask",
          name: "SeizeEntrustTaskFound7.31wMoney",
        },
        fileName: "maa.log",
        _lineNumber: 10,
      },
      {
        timestamp: "2026-03-02 12:11:42.800",
        level: "INF",
        processId: "Px1",
        threadId: "Tx1",
        message: "Node.Recognition.Failed",
        details: {
          task_id: 1,
          entry: "MainTask",
          name: "SeizeEntrustTaskFound7.31wMoney",
        },
        fileName: "maa.log",
        _lineNumber: 15,
      },
      {
        timestamp: "2026-03-02 12:11:43.000",
        level: "INF",
        processId: "Px1",
        threadId: "Tx1",
        message: "Node.Recognition.Starting",
        details: {
          task_id: 1,
          entry: "MainTask",
          name: "SeizeEntrustTaskFound7.31wMoney",
        },
        fileName: "maa.log",
        _lineNumber: 20,
      },
      {
        timestamp: "2026-03-02 12:11:43.500",
        level: "INF",
        processId: "Px1",
        threadId: "Tx1",
        message: "Node.Recognition.Succeeded",
        details: {
          task_id: 1,
          entry: "MainTask",
          name: "SeizeEntrustTaskFound7.31wMoney",
        },
        fileName: "maa.log",
        _lineNumber: 25,
      },
    ];

    const entries = buildFocusLogEntries(events);
    expect(entries).toHaveLength(4);
    expect(entries[0].message).toBe("再看一眼~");
    expect(entries[1].message).toBe("不对不对，不是武陵订单！");
    expect(entries[2].message).toBe("再看一眼~");
    expect(entries[3].message).toBe("确定就是你啦~");
  });

  it("should skip focus logs when display excludes log", () => {
    const events: EventNotification[] = [
      {
        timestamp: "2026-03-02 12:11:42.551",
        level: "INF",
        processId: "Px1",
        threadId: "Tx1",
        message: "Node.PipelineNode.Succeeded",
        details: {
          focus: {
            "Node.PipelineNode.Succeeded": { content: "Skip", display: ["toast"] },
          },
        },
        fileName: "maa.log",
        _lineNumber: 12,
      },
    ];

    const entries = buildFocusLogEntries(events);
    expect(entries).toHaveLength(0);
  });

  it("should build focus log entries from real MaaEnd log data", () => {
    const events: EventNotification[] = [
      {
        timestamp: "2026-03-03 03:07:04.015",
        level: "INF",
        processId: "Px3220",
        threadId: "Tx64911",
        message: "Node.Recognition.Starting",
        details: {
          focus: {
            "Node.Recognition.Succeeded": "好友列表已满，结束任务",
          },
          name: "BatchAddFriendsFriendListFullToast",
          reco_id: 400000060,
          task_id: 200000004,
        },
        fileName: "maa.log",
        _lineNumber: 35666,
      },
      {
        timestamp: "2026-03-03 03:07:04.123",
        level: "INF",
        processId: "Px3220",
        threadId: "Tx64911",
        message: "Node.Recognition.Succeeded",
        details: {
          focus: {
            "Node.Recognition.Succeeded": "好友列表已满，结束任务",
          },
          name: "BatchAddFriendsFriendListFullToast",
          reco_details: {
            algorithm: "OCR",
            box: [526, 114, 221, 15],
            detail: {
              all: [
                {
                  box: [526, 114, 221, 15],
                  score: 0.996005,
                  text: "你的好友列表已满，无法再发送申请",
                },
              ],
              best: {
                box: [526, 114, 221, 15],
                score: 0.996005,
                text: "你的好友列表已满，无法再发送申请",
              },
              filtered: [
                {
                  box: [526, 114, 221, 15],
                  score: 0.996005,
                  text: "你的好友列表已满，无法再发送申请",
                },
              ],
            },
            name: "BatchAddFriendsFriendListFullToast",
            reco_id: 400000060,
          },
          reco_id: 400000060,
          task_id: 200000004,
        },
        fileName: "maa.log",
        _lineNumber: 35671,
      },
    ];

    const entries = buildFocusLogEntries(events);
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe("好友列表已满，结束任务");
    expect(entries[0].details?.event).toBe("Node.Recognition.Starting");
    expect(entries[0].details?.nodeName).toBe("BatchAddFriendsFriendListFullToast");
    expect(entries[1].message).toBe("好友列表已满，结束任务");
    expect(entries[1].details?.event).toBe("Node.Recognition.Succeeded");
    expect(entries[1].details?.nodeName).toBe("BatchAddFriendsFriendListFullToast");
  });

  it("should build focus log entries using first template when event type doesn't match (PriorStealGateProductionAndClueCheck)", () => {
    const events: EventNotification[] = [
      {
        timestamp: "2026-03-02 12:11:42.551",
        level: "INF",
        processId: "Px32112",
        threadId: "Tx32177",
        message: "Node.Recognition.Starting",
        details: {
          focus: {
            "Node.Recognition.Succeeded": "助力生产和线索交流剩余次数均大于0,进入偷菜模式",
          },
          name: "PriorStealGateProductionAndClueCheck",
          reco_id: 400000012,
          task_id: 200000001,
        },
        fileName: "maa.log",
        _lineNumber: 2235,
      },
      {
        timestamp: "2026-03-02 12:11:43.827",
        level: "INF",
        processId: "Px32112",
        threadId: "Tx32177",
        message: "Node.Recognition.Failed",
        details: {
          focus: {
            "Node.Recognition.Succeeded": "助力生产和线索交流剩余次数均大于0,进入偷菜模式",
          },
          name: "PriorStealGateProductionAndClueCheck",
          reco_id: 400000012,
          task_id: 200000001,
        },
        fileName: "maa.log",
        _lineNumber: 2255,
      },
    ];

    const entries = buildFocusLogEntries(events);
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe("助力生产和线索交流剩余次数均大于0,进入偷菜模式");
    expect(entries[0].details?.event).toBe("Node.Recognition.Starting");
    expect(entries[1].message).toBe("助力生产和线索交流剩余次数均大于0,进入偷菜模式");
    expect(entries[1].details?.event).toBe("Node.Recognition.Failed");
  });
});

describe("normalizeSearchLine", () => {
  it("should return original line when hideDebugInfo is false", () => {
    const line = "[Px1][Tx2][main.cpp] Task started";
    expect(normalizeSearchLine(line, false)).toBe(line);
  });

  it("should remove debug info when hideDebugInfo is true", () => {
    const line = "[Px1][Tx2][main.cpp] Task started";
    const result = normalizeSearchLine(line, true);
    expect(result).toBe("Task started");
  });

  it("should handle multiple debug patterns", () => {
    const line = "[Px1][Tx2][L123][test.cpp][Px3] Message";
    const result = normalizeSearchLine(line, true);
    expect(result).toBe("Message");
  });

  it("should handle line with no debug info", () => {
    const line = "Simple message without debug info";
    expect(normalizeSearchLine(line, true)).toBe(line);
  });
});

describe("computeNodeStatistics", () => {
  it("should return empty array for empty tasks", () => {
    expect(computeNodeStatistics([])).toEqual([]);
  });

  it("should compute statistics for tasks with nodes", () => {
    const tasks = [
      {
        task_id: 1,
        key: "task-1",
        entry: "MainTask",
        status: "succeeded" as const,
        start_time: "2025-06-14 11:37:00.000",
        end_time: "2025-06-14 11:37:30.000",
        nodes: [
          {
            node_id: 1,
            name: "NodeA",
            timestamp: "2025-06-14 11:37:10.000",
            status: "success" as const,
            task_id: 1,
            next_list: [],
            recognition_attempts: [],
          },
          {
            node_id: 2,
            name: "NodeA",
            timestamp: "2025-06-14 11:37:15.000",
            status: "failed" as const,
            task_id: 1,
            next_list: [],
            recognition_attempts: [],
          },
        ],
        processId: "Px1",
        threadId: "Tx1",
        fileName: "maa.log",
        hash: "abc",
        uuid: "uuid-1",
      },
    ];

    const result = computeNodeStatistics(tasks);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe("NodeA");
    expect(result[0].count).toBe(2);
    expect(result[0].successCount).toBe(1);
    expect(result[0].failCount).toBe(1);
  });
});
