/**
 * @fileoverview 解析器注册表
 *
 * 本文件实现了解析器的注册和查找机制。
 * 提供统一的解析器管理接口，支持：
 * - 解析器注册与注销
 * - 根据文件名自动选择解析器
 * - 解析器优先级排序
 * - 批量文件解析
 *
 * @module parsers/registry
 * @author MaaLogs Team
 * @license MIT
 */

import type { AuxLogEntry, RawLine } from "../types/logTypes";
import type { LogParser, ParseResult, ParserPriority, ParserRegistration, AuxLogParserInfo, AuxLogParser } from "./types";

/**
 * 解析器注册表类
 *
 * 管理所有注册的解析器，提供文件到解析器的映射。
 * 使用单例模式确保全局只有一个注册表实例。
 *
 * @example
 * const registry = ParserRegistry.getInstance();
 * registry.register(myParser, ParserPriority.HIGH);
 * const parser = registry.getParserForFile('go-service.log');
 */
class ParserRegistry {
  /**
   * 单例实例
   * @private
   */
  private static instance: ParserRegistry | null = null;

  /**
   * 已注册的解析器列表
   * @private
   */
  private parsers: ParserRegistration[] = [];

  /**
   * 已注册的Custom日志解析器映射
   * @private
   */
  private auxParsers: Map<string, AuxLogParser> = new Map();

  /**
   * 私有构造函数，防止外部实例化
   * @private
   */
  private constructor() {}

  /**
   * 获取注册表单例实例
   *
   * @returns {ParserRegistry} 注册表实例
   *
   * @example
   * const registry = ParserRegistry.getInstance();
   */
  public static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
    }
    return ParserRegistry.instance;
  }

  /**
   * 注册解析器
   *
   * 将解析器添加到注册表中，按优先级排序。
   * 高优先级的解析器会被优先选择。
   *
   * @param {LogParser} parser - 解析器实例
   * @param {ParserPriority} [priority=ParserPriority.MEDIUM] - 解析器优先级
   *
   * @example
   * registry.register(loguruParser, ParserPriority.HIGH);
   */
  public register(parser: LogParser, priority: ParserPriority = 50): void {
    // 检查是否已注册
    const existing = this.parsers.findIndex(r => r.parser.name === parser.name);
    if (existing >= 0) {
      // 更新现有注册
      this.parsers[existing] = { parser, priority, enabled: true };
    } else {
      // 添加新注册
      this.parsers.push({ parser, priority, enabled: true });
    }

    // 按优先级降序排序
    this.parsers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 注销解析器
   *
   * 从注册表中移除指定名称的解析器。
   *
   * @param {string} name - 解析器名称
   * @returns {boolean} 是否成功注销
   *
   * @example
   * registry.unregister('LoguruParser');
   */
  public unregister(name: string): boolean {
    const index = this.parsers.findIndex(r => r.parser.name === name);
    if (index >= 0) {
      this.parsers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 启用/禁用解析器
   *
   * 切换解析器的启用状态，禁用的解析器不会被选择。
   *
   * @param {string} name - 解析器名称
   * @param {boolean} enabled - 是否启用
   * @returns {boolean} 是否成功切换
   *
   * @example
   * registry.setEnabled('LoguruParser', false);
   */
  public setEnabled(name: string, enabled: boolean): boolean {
    const registration = this.parsers.find(r => r.parser.name === name);
    if (registration) {
      registration.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * 获取所有已注册的解析器
   *
   * @returns {ParserRegistration[]} 解析器注册信息列表
   */
  public getAllParsers(): ParserRegistration[] {
    return [...this.parsers];
  }

  /**
   * 获取解析器信息列表
   *
   * 返回所有已注册解析器的简要信息，用于 UI 显示。
   *
   * @returns {AuxLogParserInfo[]} 解析器信息列表
   */
  public getInfoList(): AuxLogParserInfo[] {
    return Array.from(this.auxParsers.values()).map(parser => ({
      id: parser.id,
      name: parser.name,
      description: parser.description
    }));
  }

  /**
   * 根据名称获取解析器
   *
   * @param {string} name - 解析器名称
   * @returns {AuxLogParser | null} 解析器实例或 null
   */
  public get(name: string): AuxLogParser | null {
    return this.auxParsers.get(name) || null;
  }

  /**
   * 注册Custom日志解析器
   *
   * @param {AuxLogParser} parser - Custom日志解析器实例
   */
  public registerAuxParser(parser: AuxLogParser): void {
    this.auxParsers.set(parser.id, parser);
  }

  /**
   * 根据文件名获取合适的解析器
   *
   * 遍历已注册的解析器，返回第一个支持该文件的解析器。
   * 如果解析器提供了 canParse 方法，会调用该方法进行内容检测。
   *
   * @param {string} fileName - 文件名
   * @param {string} [content] - 可选的文件内容，用于内容检测
   * @returns {LogParser | null} 匹配的解析器或 null
   *
   * @example
   * const parser = registry.getParserForFile('go-service.log');
   * if (parser) {
   *   const entries = await parser.parse(content, 'go-service.log');
   * }
   */
  public getParserForFile(fileName: string, content?: string): LogParser | null {
    const lowerFileName = fileName.toLowerCase();

    for (const registration of this.parsers) {
      if (!registration.enabled) continue;

      const parser = registration.parser;

      // 检查文件名是否匹配
      const matchesFileName = parser.supportedFiles.some(
        pattern => lowerFileName === pattern.toLowerCase() || lowerFileName.includes(pattern.toLowerCase())
      );

      if (matchesFileName) {
        // 如果有内容检测方法，使用它进行进一步验证
        if (parser.canParse && content !== undefined) {
          if (parser.canParse(content, fileName)) {
            return parser;
          }
        } else {
          return parser;
        }
      }
    }

    return null;
  }

  /**
   * 解析单个文件
   *
   * 自动选择合适的解析器并解析文件内容。
   *
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名
   * @returns {Promise<ParseResult>} 解析结果
   *
   * @example
   * const result = await registry.parseFile(content, 'go-service.log');
   * console.log(result.entries.length);
   */
  public async parseFile(content: string, fileName: string): Promise<ParseResult> {
    const parser = this.getParserForFile(fileName, content);

    if (parser) {
      const entries = await parser.parse(content, fileName);
      const rawLines = this.buildRawLines(content, fileName);
      return { entries, rawLines };
    }

    // 没有找到合适的解析器，返回原始行
    return {
      entries: [],
      rawLines: this.buildRawLines(content, fileName)
    };
  }

  /**
   * 解析多个文件
   *
   * 批量解析多个文件，合并结果。
   *
   * @param {Array<{content: string, fileName: string}>} files - 文件列表
   * @returns {Promise<{entries: AuxLogEntry[], rawLines: RawLine[]}>} 合并后的解析结果
   *
   * @example
   * const files = [
   *   { content: '...', fileName: 'go-service.log' },
   *   { content: '...', fileName: 'maa.log' }
   * ];
   * const result = await registry.parseFiles(files);
   */
  public async parseFiles(
    files: Array<{ content: string; fileName: string }>
  ): Promise<{ entries: AuxLogEntry[]; rawLines: RawLine[] }> {
    const allEntries: AuxLogEntry[] = [];
    const allRawLines: RawLine[] = [];

    for (const file of files) {
      const result = await this.parseFile(file.content, file.fileName);
      allEntries.push(...result.entries);
      allRawLines.push(...result.rawLines);
    }

    return { entries: allEntries, rawLines: allRawLines };
  }

  /**
   * 将文件内容分割为原始行
   *
   * @param {string} content - 文件内容
   * @param {string} fileName - 文件名
   * @returns {RawLine[]} 原始行数组
   * @private
   */
  private buildRawLines(content: string, fileName: string): RawLine[] {
    const lines = content.split("\n");
    return lines
      .map((line, index) => ({
        fileName,
        lineNumber: index + 1,
        line
      }))
      .filter(rawLine => rawLine.line.trim().length > 0);
  }

  /**
   * 重置注册表
   *
   * 清除所有已注册的解析器。
   * 主要用于测试场景。
   */
  public reset(): void {
    this.parsers = [];
  }
}

/**
 * 导出注册表单例
 *
 * 这是使用注册表的推荐方式。
 */
export const parserRegistry = ParserRegistry.getInstance();

/**
 * 便捷函数：注册解析器
 *
 * @param {LogParser} parser - 解析器实例
 * @param {ParserPriority} [priority] - 优先级
 */
export function registerParser(parser: LogParser, priority?: ParserPriority): void {
  parserRegistry.register(parser, priority);
}

/**
 * 便捷函数：获取文件解析器
 *
 * @param {string} fileName - 文件名
 * @param {string} [content] - 文件内容
 * @returns {LogParser | null} 解析器实例
 */
export function getParserForFile(fileName: string, content?: string): LogParser | null {
  return parserRegistry.getParserForFile(fileName, content);
}

/**
 * 便捷函数：解析文件
 *
 * @param {string} content - 文件内容
 * @param {string} fileName - 文件名
 * @returns {Promise<ParseResult>} 解析结果
 */
export async function parseFile(content: string, fileName: string): Promise<ParseResult> {
  return parserRegistry.parseFile(content, fileName);
}
