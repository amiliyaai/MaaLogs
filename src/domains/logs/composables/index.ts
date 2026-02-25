/**
 * @fileoverview Composables 模块入口
 *
 * 本文件是 Vue Composables 的主入口点，负责导出所有可复用的组合式函数。
 *
 * Composables 是 Vue 3 的核心概念，用于封装和复用有状态的逻辑。
 * 本模块提供了以下功能：
 * - 日志解析（useLogParser）
 * - 文本搜索（useSearch）
 * - 统计分析（useStatistics）
 * - 文件选择（useFileSelection）
 *
 * @module composables
 * @author MaaLogs Team
 * @license MIT
 */

// 导出日志解析相关
export { useLogParser, setSelectedFiles } from "./useLogParser";
export type { LogParserResult, ParseState, LogParserConfig } from "./useLogParser";

// 导出搜索相关
export { useSearch } from "./useSearch";
export type { SearcherResult } from "./useSearch";

// 导出统计相关
export { useStatistics } from "./useStatistics";
export type { StatisticsResult, StatSort } from "./useStatistics";

// 导出文件选择相关
export { useFileSelection } from "./useFileSelection";
export type { FileSelectorResult } from "./useFileSelection";
