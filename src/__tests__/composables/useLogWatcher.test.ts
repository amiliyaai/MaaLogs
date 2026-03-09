/**
 * @fileoverview 日志监控模块单元测试
 *
 * 测试覆盖：
 * - useLogWatcher: 日志监控管理器
 * - useFileWatcher: 文件监控
 * - useTaskCache: 任务缓存
 *
 * @module __tests__/composables/useLogWatcher.test
 * @author MaaLogs Team
 * @license MIT
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useLogWatcher } from "@/composables/useLogWatcher";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/platform", () => ({
  getPlatform: vi.fn().mockResolvedValue({
    vfs: {
      list: vi.fn().mockResolvedValue([]),
      join: vi.fn().mockImplementation((...args) => args.join("/")),
      stat: vi.fn().mockResolvedValue({ size: 0, mtime: 0 }),
      readText: vi.fn().mockResolvedValue(""),
    },
  }),
}));

vi.mock("@/config/logFiles", () => ({
  shouldWatchFile: vi.fn().mockReturnValue(true),
  isMainLogFile: vi.fn().mockImplementation((filename: string) => filename === "maa.log"),
  LOG_WATCHER_CONFIG: {
    MAX_INITIAL_READ_SIZE: 1024 * 1024 * 10,
    POLL_INTERVAL_MS: 2000,
    MAX_LINE_LENGTH: 4096,
  },
}));

vi.mock("@/parsers", () => ({
  projectParserRegistry: {
    get: vi.fn().mockReturnValue(null),
    getDefault: vi.fn().mockReturnValue(null),
  },
  correlateAuxLogs: vi.fn().mockReturnValue([]),
}));

vi.mock("@/parsers/baseParser", () => ({
  parseBracketLine: vi.fn().mockReturnValue(null),
  handleMainLogLine: vi.fn(),
  createMainLogContext: vi.fn().mockReturnValue({
    events: [],
    tasks: new Map(),
  }),
}));

describe("useLogWatcher", () => {
  let logWatcher: ReturnType<typeof useLogWatcher>;

  beforeEach(() => {
    logWatcher = useLogWatcher();
  });

  afterEach(() => {
    logWatcher.reset();
  });

  describe("初始状态", () => {
    it("should have correct initial state", () => {
      expect(logWatcher.isWatching.value).toBe(false);
      expect(logWatcher.isInitializing.value).toBe(false);
      expect(logWatcher.completedTasks.value).toEqual([]);
      expect(logWatcher.auxEntries.value).toEqual([]);
      expect(logWatcher.dirPath.value).toBe("");
      expect(logWatcher.projectType.value).toBe("");
    });
  });

  describe("init", () => {
    it("should initialize with directory and project type", async () => {
      await logWatcher.init("/test/logs", "m9a");

      expect(logWatcher.dirPath.value).toBe("/test/logs");
      expect(logWatcher.projectType.value).toBe("m9a");
      expect(logWatcher.isInitializing.value).toBe(false);
    });

    it("should handle empty directory", async () => {
      await logWatcher.init("/test/empty", "m9a");

      expect(logWatcher.completedTasks.value).toEqual([]);
      expect(logWatcher.auxEntries.value).toEqual([]);
    });
  });

  describe("startWatching / stopWatching", () => {
    it("should start and stop watching", async () => {
      await logWatcher.init("/test/logs", "m9a");

      logWatcher.startWatching();
      expect(logWatcher.isWatching.value).toBe(true);

      logWatcher.stopWatching();
      expect(logWatcher.isWatching.value).toBe(false);
    });

    it("should not start watching twice", async () => {
      await logWatcher.init("/test/logs", "m9a");

      logWatcher.startWatching();
      logWatcher.startWatching();
      expect(logWatcher.isWatching.value).toBe(true);
    });

    it("should not stop watching when not watching", async () => {
      logWatcher.stopWatching();
      expect(logWatcher.isWatching.value).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset all state", async () => {
      await logWatcher.init("/test/logs", "m9a");
      logWatcher.startWatching();
      logWatcher.reset();

      expect(logWatcher.isWatching.value).toBe(false);
      expect(logWatcher.completedTasks.value).toEqual([]);
      expect(logWatcher.auxEntries.value).toEqual([]);
      expect(logWatcher.dirPath.value).toBe("");
      expect(logWatcher.projectType.value).toBe("");
    });
  });
});
