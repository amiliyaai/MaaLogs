/**
 * @fileoverview 解析器类型定义
 *
 * 本文件定义了解析器系统的核心接口和类型。
 * 所有日志解析器都需要实现这些接口，以支持统一的解析流程。
 *
 * @module parsers/types
 * @author MaaLogs Team
 * @license MIT
 */

import type { AuxLogEntry, RawLine } from "../types/logTypes";

/**
 * 解析器接口
 *
 * 定义所有日志解析器必须实现的方法。
 * 解析器负责将原始日志文件内容转换为结构化的日志条目。
 *
 * @property {string} name - 解析器名称，用于日志和调试
 * @property {string[]} supportedFiles - 支持的文件名模式列表
 * @property {function} parse - 解析日志文件内容的方法
 * @property {function} [canParse] - 可选的文件内容检测方法
 *
 * @example
 * const myParser: LogParser = {
 *   name: 'MyParser',
 *   supportedFiles: ['myapp.log'],
 *   parse: async (content, fileName) => {
 *     // 解析逻辑
 *     return [];
 *   }
 * };
 */
export interface LogParser {
  /**
   * 解析器名称
   *
   * 用于在日志和调试信息中标识解析器。
   */
  name: string;

  /**
   * 支持的文件名列表
   *
   * 解析器可以处理的文件名模式。
   * 注册表会根据文件名选择合适的解析器。
   */
  supportedFiles: string[];

  /**
   * 解析日志文件内容
   *
   * 将原始文本内容转换为结构化的日志条目数组。
   *
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名
   * @returns {Promise<AuxLogEntry[]>} 解析后的日志条目数组
   */
  parse: (content: string, fileName: string) => Promise<AuxLogEntry[]>;

  /**
   * 检测是否可以解析该文件
   *
   * 可选方法，用于在文件名不明确时检测文件内容格式。
   *
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名
   * @returns {boolean} 是否可以解析
   */
  canParse?: (content: string, fileName: string) => boolean;
}

/**
 * 解析结果
 *
 * 包含解析后的日志条目和原始行数据。
 *
 * @property {AuxLogEntry[]} entries - 解析后的日志条目
 * @property {RawLine[]} rawLines - 原始行数据（用于搜索）
 */
export interface ParseResult {
  /** 解析后的日志条目 */
  entries: AuxLogEntry[];
  /** 原始行数据（用于搜索功能） */
  rawLines: RawLine[];
}

/**
 * 解析器上下文
 *
 * 提供解析过程中需要的共享资源和配置。
 *
 * @property {Map<string, string>} stringPool - 字符串池，用于内存优化
 * @property {string} fileName - 当前正在解析的文件名
 * @property {number} [timeDriftMs] - 时间漂移补偿（毫秒）
 */
export interface ParserContext {
  /** 字符串池，用于减少重复字符串的内存占用 */
  stringPool: Map<string, string>;
  /** 当前正在解析的文件名 */
  fileName: string;
  /** 时间漂移补偿（毫秒），用于不同日志源的时间同步 */
  timeDriftMs?: number;
}

/**
 * 行解析函数类型
 *
 * 定义单行解析函数的签名。
 *
 * @param {string} line - 原始行内容
 * @param {number} lineNumber - 行号
 * @param {ParserContext} context - 解析上下文
 * @returns {AuxLogEntry | null} 解析后的条目或 null（无法解析）
 */
export type LineParser = (
  line: string,
  lineNumber: number,
  context: ParserContext
) => AuxLogEntry | null;

/**
 * 解析器优先级
 *
 * 当多个解析器支持同一文件时，按优先级选择。
 * 数值越大优先级越高。
 */
export enum ParserPriority {
  /** 低优先级：通用解析器 */
  LOW = 0,
  /** 中优先级：特定格式解析器 */
  MEDIUM = 50,
  /** 高优先级：精确匹配解析器 */
  HIGH = 100,
}

/**
 * 解析器注册信息
 *
 * 包含解析器实例及其元数据。
 *
 * @property {LogParser} parser - 解析器实例
 * @property {ParserPriority} priority - 解析器优先级
 * @property {boolean} enabled - 是否启用
 */
export interface ParserRegistration {
  /** 解析器实例 */
  parser: LogParser;
  /** 解析器优先级 */
  priority: ParserPriority;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 辅助日志解析器信息
 *
 * 用于在 UI 中显示解析器列表。
 *
 * @property {string} id - 解析器唯一标识符
 * @property {string} name - 解析器显示名称
 * @property {string} [description] - 解析器描述
 */
export interface AuxLogParserInfo {
  /** 解析器唯一标识符 */
  id: string;
  /** 解析器显示名称 */
  name: string;
  /** 解析器描述 */
  description?: string;
}

/**
 * Custom日志解析器配置
 *
 * 传递给解析器的上下文信息。
 *
 * @property {string | null} baseDate - 基准日期（YYYY-MM-DD 格式）
 * @property {string} fileName - 当前解析的文件名
 */
export interface AuxLogParserConfig {
  /** 基准日期（YYYY-MM-DD 格式），用于补全只有时间的日志 */
  baseDate: string | null;
  /** 当前解析的文件名 */
  fileName: string;
}

/**
 * 辅助日志解析结果
 *
 * @property {AuxLogEntry[]} entries - 解析后的日志条目
 */
export interface AuxLogParseResult {
  /** 解析后的日志条目 */
  entries: AuxLogEntry[];
}

/**
 * 辅助日志解析器接口
 *
 * 用于解析 go-service 等Custom日志文件。
 */
export interface AuxLogParser {
  /** 解析器唯一标识符 */
  readonly id: string;
  /** 解析器显示名称 */
  readonly name: string;
  /** 解析器描述 */
  readonly description: string;
  /**
   * 解析日志行
   * @param lines - 日志行数组
   * @param config - 解析配置
   * @returns 解析结果
   */
  parse(lines: string[], config: AuxLogParserConfig): AuxLogParseResult;
}
