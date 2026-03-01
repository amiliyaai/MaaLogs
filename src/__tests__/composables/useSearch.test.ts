import { describe, it, expect, vi } from "vitest";
import { useSearch } from "../../composables/useSearch";
import type { RawLine, SearchResult } from "../../types/logTypes";

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../utils/parse", () => ({
  normalizeSearchLine: (line: string) => line,
}));

function createMockRawLines(): RawLine[] {
  return [
    { fileName: "maa.log", lineNumber: 1, line: "[INF] Task started successfully" },
    { fileName: "maa.log", lineNumber: 2, line: "[ERR] Error occurred in processing" },
    { fileName: "maa.log", lineNumber: 3, line: "[INF] Task completed" },
    { fileName: "maa.log", lineNumber: 4, line: "[DBG] Debug information here" },
    { fileName: "maa.log", lineNumber: 5, line: "[WRN] Warning message" },
  ];
}

describe("useSearch", () => {
  it("should initialize with default values", () => {
    const searcher = useSearch();

    expect(searcher.searchText.value).toBe("");
    expect(searcher.searchCaseSensitive.value).toBe(false);
    expect(searcher.searchUseRegex.value).toBe(false);
    expect(searcher.hideDebugInfo.value).toBe(true);
    expect(searcher.searchMaxResults.value).toBe(500);
    expect(searcher.searchResults.value).toEqual([]);
    expect(searcher.searchMessage.value).toBe("");
    expect(searcher.searchHistory.value).toEqual([]);
  });

  it("should show message for empty search text", () => {
    const searcher = useSearch();
    const rawLines = createMockRawLines();

    searcher.performSearch(rawLines);

    expect(searcher.searchMessage.value).toBe("请输入搜索内容");
    expect(searcher.searchResults.value).toEqual([]);
  });

  it("should show message for empty raw lines", () => {
    const searcher = useSearch();
    searcher.searchText.value = "test";

    searcher.performSearch([]);

    expect(searcher.searchMessage.value).toBe("请先解析日志");
  });

  it("should find matching results", () => {
    const searcher = useSearch();
    searcher.searchText.value = "Error";
    const rawLines = createMockRawLines();

    searcher.performSearch(rawLines);

    expect(searcher.searchResults.value.length).toBe(1);
    expect(searcher.searchResults.value[0].line).toContain("Error");
    expect(searcher.searchMessage.value).toBe("找到 1 条结果");
  });

  it("should be case insensitive by default", () => {
    const searcher = useSearch();
    searcher.searchText.value = "error";
    const rawLines = createMockRawLines();

    searcher.performSearch(rawLines);

    expect(searcher.searchResults.value.length).toBe(1);
  });

  it("should be case sensitive when enabled", () => {
    const searcher = useSearch();
    searcher.searchText.value = "error";
    searcher.searchCaseSensitive.value = true;
    const rawLines = createMockRawLines();

    searcher.performSearch(rawLines);

    expect(searcher.searchResults.value.length).toBe(0);
  });

  it("should support regex search", () => {
    const searcher = useSearch();
    searcher.searchText.value = "\\[ERR\\]";
    searcher.searchUseRegex.value = true;
    const rawLines = createMockRawLines();

    searcher.performSearch(rawLines);

    expect(searcher.searchResults.value.length).toBe(1);
  });

  it("should handle invalid regex", () => {
    const searcher = useSearch();
    searcher.searchText.value = "[invalid";
    searcher.searchUseRegex.value = true;
    const rawLines = createMockRawLines();

    searcher.performSearch(rawLines);

    expect(searcher.searchMessage.value).toBe("正则表达式无效");
  });

  it("should respect max results limit", () => {
    const searcher = useSearch();
    searcher.searchText.value = "a";
    searcher.searchMaxResults.value = 2;
    const rawLines = createMockRawLines();

    searcher.performSearch(rawLines);

    expect(searcher.searchResults.value.length).toBe(2);
    expect(searcher.searchMessage.value).toContain("已达上限");
  });

  it("should reset search state", () => {
    const searcher = useSearch();
    searcher.searchText.value = "test";
    searcher.searchResults.value = [{} as SearchResult];
    searcher.searchMessage.value = "test message";

    searcher.resetSearch();

    expect(searcher.searchText.value).toBe("");
    expect(searcher.searchResults.value).toEqual([]);
    expect(searcher.searchMessage.value).toBe("");
  });

  it("should add to search history", () => {
    const searcher = useSearch();

    searcher.addToHistory("keyword1");
    searcher.addToHistory("keyword2");

    expect(searcher.searchHistory.value).toEqual(["keyword2", "keyword1"]);
  });

  it("should move existing keyword to front", () => {
    const searcher = useSearch();
    searcher.addToHistory("keyword1");
    searcher.addToHistory("keyword2");
    searcher.addToHistory("keyword1");

    expect(searcher.searchHistory.value).toEqual(["keyword1", "keyword2"]);
  });

  it("should limit history size", () => {
    const searcher = useSearch();

    for (let i = 0; i < 15; i++) {
      searcher.addToHistory(`keyword${i}`);
    }

    expect(searcher.searchHistory.value.length).toBe(10);
    expect(searcher.searchHistory.value[0]).toBe("keyword14");
  });

  it("should ignore empty keyword", () => {
    const searcher = useSearch();
    searcher.addToHistory("");
    searcher.addToHistory("   ");

    expect(searcher.searchHistory.value).toEqual([]);
  });

  it("should clear history", () => {
    const searcher = useSearch();
    searcher.addToHistory("keyword1");
    searcher.addToHistory("keyword2");

    searcher.clearHistory();

    expect(searcher.searchHistory.value).toEqual([]);
  });
});
