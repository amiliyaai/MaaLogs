/**
 * @fileoverview 文本搜索 Composable
 *
 * 本文件实现了文本搜索功能的 Vue Composable，封装了：
 * - 关键词搜索
 * - 正则表达式搜索
 * - 大小写敏感选项
 * - 调试信息隐藏
 * - 结果数量限制
 * - 搜索历史记录
 *
 * @module composables/useSearch
 * @author MaaLogs Team
 * @license MIT
 */

import { ref, type Ref } from "vue";
import type { RawLine, SearchResult } from "../types/logTypes";
import { normalizeSearchLine } from "../utils/parse";
import { createLogger } from "../utils/logger";

/**
 * 应用日志记录器
 */
const logger = createLogger("Search");

/**
 * 搜索历史最大数量
 */
const SEARCH_HISTORY_MAX = 10;

/**
 * 搜索器返回值
 *
 * 包含搜索的所有状态和操作方法。
 *
 * @property {Ref<string>} searchText - 搜索文本
 * @property {Ref<boolean>} searchCaseSensitive - 是否区分大小写
 * @property {Ref<boolean>} searchUseRegex - 是否使用正则表达式
 * @property {Ref<boolean>} hideDebugInfo - 是否隐藏调试信息
 * @property {Ref<number>} searchMaxResults - 最大结果数量
 * @property {Ref<SearchResult[]>} searchResults - 搜索结果列表
 * @property {Ref<string>} searchMessage - 搜索状态消息
 * @property {Ref<string[]>} searchHistory - 搜索历史列表
 * @property {function} performSearch - 执行搜索
 * @property {function} resetSearch - 重置搜索状态
 * @property {function} addToHistory - 添加到搜索历史
 * @property {function} clearHistory - 清空搜索历史
 */
export interface SearcherResult {
  /** 搜索文本 */
  searchText: Ref<string>;
  /** 是否区分大小写 */
  searchCaseSensitive: Ref<boolean>;
  /** 是否使用正则表达式 */
  searchUseRegex: Ref<boolean>;
  /** 是否隐藏调试信息 */
  hideDebugInfo: Ref<boolean>;
  /** 最大结果数量 */
  searchMaxResults: Ref<number>;
  /** 搜索结果列表 */
  searchResults: Ref<SearchResult[]>;
  /** 搜索状态消息 */
  searchMessage: Ref<string>;
  /** 搜索历史列表 */
  searchHistory: Ref<string[]>;
  /** 执行搜索 */
  performSearch: (rawLines: RawLine[]) => void;
  /** 重置搜索状态 */
  resetSearch: () => void;
  /** 添加到搜索历史 */
  addToHistory: (keyword: string) => void;
  /** 清空搜索历史 */
  clearHistory: () => void;
}

/**
 * 搜索器 Composable
 *
 * 封装文本搜索的核心逻辑，支持正则和大小写敏感。
 *
 * @returns {SearcherResult} 搜索器的状态和方法
 *
 * @example
 * const {
 *   searchText,
 *   searchResults,
 *   performSearch
 * } = useSearch();
 *
 * searchText.value = 'error';
 * performSearch(rawLines);
 */
export function useSearch(): SearcherResult {
  // ============================================
  // 响应式状态
  // ============================================

  /** 搜索文本 */
  const searchText = ref("");
  /** 是否区分大小写 */
  const searchCaseSensitive = ref(false);
  /** 是否使用正则表达式 */
  const searchUseRegex = ref(false);
  /** 是否隐藏调试信息 */
  const hideDebugInfo = ref(true);
  /** 最大结果数量 */
  const searchMaxResults = ref(500);
  /** 搜索结果列表 */
  const searchResults = ref<SearchResult[]>([]);
  /** 搜索状态消息 */
  const searchMessage = ref("");
  /** 搜索历史列表 */
  const searchHistory = ref<string[]>([]);

  // ============================================
  // 搜索方法
  // ============================================

  /**
   * 重置搜索状态
   *
   * 清空搜索文本和结果。
   */
  function resetSearch(): void {
    searchText.value = "";
    searchResults.value = [];
    searchMessage.value = "";
  }

  /**
   * 添加关键词到搜索历史
   *
   * 将搜索关键词添加到历史记录，自动去重并限制数量。
   *
   * @param {string} keyword - 要添加的关键词
   */
  function addToHistory(keyword: string): void {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    const history = searchHistory.value;
    const existingIndex = history.indexOf(trimmed);

    if (existingIndex !== -1) {
      history.splice(existingIndex, 1);
    }

    history.unshift(trimmed);

    if (history.length > SEARCH_HISTORY_MAX) {
      history.pop();
    }

    logger.debug("添加搜索历史", { keyword: trimmed, historyLength: history.length });
  }

  /**
   * 清空搜索历史
   */
  function clearHistory(): void {
    searchHistory.value = [];
    logger.debug("清空搜索历史");
  }

  /**
   * 执行文本搜索并更新结果列表
   *
   * 根据搜索选项在原始行数据中查找匹配项。
   * 支持普通文本搜索和正则表达式搜索。
   *
   * @param {RawLine[]} rawLines - 原始行数据
   *
   * @example
   * performSearch(rawLines);
   * console.log(searchResults.value.length);
   */
  function performSearch(rawLines: RawLine[]): void {
    // 验证搜索条件
    if (!searchText.value.trim()) {
      searchResults.value = [];
      searchMessage.value = "请输入搜索内容";
      logger.warn("搜索关键字为空");
      return;
    }

    // 验证数据源
    if (rawLines.length === 0) {
      searchResults.value = [];
      searchMessage.value = "请先解析日志";
      logger.warn("搜索前未解析日志");
      return;
    }

    // 编译正则表达式（如果启用）
    let regex: RegExp | null = null;
    if (searchUseRegex.value) {
      try {
        regex = new RegExp(searchText.value, searchCaseSensitive.value ? "g" : "gi");
      } catch {
        searchResults.value = [];
        searchMessage.value = "正则表达式无效";
        logger.error("正则表达式无效", { pattern: searchText.value });
        return;
      }
    }

    // 执行搜索
    const results: SearchResult[] = [];
    const keyword = searchCaseSensitive.value
      ? searchText.value
      : searchText.value.toLowerCase();

    for (const line of rawLines) {
      // 检查结果数量限制
      if (results.length >= searchMaxResults.value) break;

      // 规范化显示行（可能隐藏调试信息）
      const displayLine = normalizeSearchLine(line.line, hideDebugInfo.value);
      let matchStart = -1;
      let matchEnd = -1;

      // 执行匹配
      if (regex) {
        // 正则表达式匹配
        regex.lastIndex = 0;
        const match = regex.exec(displayLine);
        if (match && match.index !== undefined) {
          matchStart = match.index;
          matchEnd = matchStart + match[0].length;
        }
      } else {
        // 普通文本匹配
        if (searchCaseSensitive.value) {
          matchStart = displayLine.indexOf(keyword);
          if (matchStart !== -1) matchEnd = matchStart + keyword.length;
        } else {
          const lowerLine = displayLine.toLowerCase();
          matchStart = lowerLine.indexOf(keyword);
          if (matchStart !== -1) matchEnd = matchStart + keyword.length;
        }
      }

      // 添加匹配结果
      if (matchStart !== -1) {
        const key = `${line.fileName}-${line.lineNumber}-${results.length}`;
        results.push({
          fileName: line.fileName,
          lineNumber: line.lineNumber,
          line: displayLine,
          rawLine: line.line,
          matchStart,
          matchEnd,
          key
        });
      }
    }

    // 更新状态
    searchResults.value = results;
    searchMessage.value =
      results.length > 0
        ? `找到 ${results.length} 条结果${results.length >= searchMaxResults.value ? "（已达上限）" : ""}`
        : "未找到匹配结果";

    // 添加到搜索历史
    addToHistory(searchText.value);

    logger.info("搜索完成", { resultCount: results.length });
  }

  return {
    searchText,
    searchCaseSensitive,
    searchUseRegex,
    hideDebugInfo,
    searchMaxResults,
    searchResults,
    searchMessage,
    searchHistory,
    performSearch,
    resetSearch,
    addToHistory,
    clearHistory
  };
}
