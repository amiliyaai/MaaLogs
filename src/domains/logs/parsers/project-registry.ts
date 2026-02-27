/**
 * @fileoverview 项目解析器注册表
 *
 * 本文件实现了项目解析器的注册和查找机制。
 * 提供统一的项目解析器管理接口，支持：
 * - 项目解析器注册与注销
 * - 根据 ID 获取解析器
 * - 获取解析器列表供 UI 显示
 *
 * @module parsers/project-registry
 * @author MaaLogs Team
 * @license MIT
 */

import type { ProjectParser, ProjectParserRegistration } from "./project-types";
import type { AuxLogParserInfo } from "./types";

/**
 * 项目解析器注册表类
 *
 * 管理所有注册的项目解析器。
 * 使用单例模式确保全局只有一个注册表实例。
 *
 * @example
 * const registry = ProjectParserRegistry.getInstance();
 * registry.register(m9aProjectParser);
 * const parser = registry.get('m9a');
 */
class ProjectParserRegistry {
  private static instance: ProjectParserRegistry | null = null;
  private parsers: ProjectParserRegistration[] = [];

  private constructor() {}

  /**
   * 获取注册表单例实例
   */
  public static getInstance(): ProjectParserRegistry {
    if (!ProjectParserRegistry.instance) {
      ProjectParserRegistry.instance = new ProjectParserRegistry();
    }
    return ProjectParserRegistry.instance;
  }

  /**
   * 注册项目解析器
   *
   * @param {ProjectParser} parser - 项目解析器实例
   * @param {number} [priority=50] - 优先级（数值越大优先级越高）
   */
  public register(parser: ProjectParser, priority: number = 50): void {
    const existing = this.parsers.findIndex((r) => r.parser.id === parser.id);
    if (existing >= 0) {
      this.parsers[existing] = { parser, enabled: true, priority };
    } else {
      this.parsers.push({ parser, enabled: true, priority });
    }
    this.parsers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 注销项目解析器
   *
   * @param {string} id - 项目解析器 ID
   * @returns {boolean} 是否成功注销
   */
  public unregister(id: string): boolean {
    const index = this.parsers.findIndex((r) => r.parser.id === id);
    if (index >= 0) {
      this.parsers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 启用/禁用项目解析器
   *
   * @param {string} id - 项目解析器 ID
   * @param {boolean} enabled - 是否启用
   * @returns {boolean} 是否成功切换
   */
  public setEnabled(id: string, enabled: boolean): boolean {
    const registration = this.parsers.find((r) => r.parser.id === id);
    if (registration) {
      registration.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * 根据 ID 获取项目解析器
   *
   * @param {string} id - 项目解析器 ID
   * @returns {ProjectParser | null} 项目解析器实例或 null
   */
  public get(id: string): ProjectParser | null {
    const registration = this.parsers.find((r) => r.parser.id === id && r.enabled);
    return registration?.parser || null;
  }

  /**
   * 获取所有已注册的项目解析器
   *
   * @returns {ProjectParserRegistration[]} 项目解析器注册信息列表
   */
  public getAllParsers(): ProjectParserRegistration[] {
    return [...this.parsers];
  }

  /**
   * 获取所有启用的项目解析器
   *
   * @returns {ProjectParser[]} 项目解析器列表
   */
  public getEnabledParsers(): ProjectParser[] {
    return this.parsers.filter((r) => r.enabled).map((r) => r.parser);
  }

  /**
   * 获取所有项目解析器信息列表
   *
   * 返回所有已注册项目解析器的简要信息，用于 UI 显示。
   *
   * @returns {AuxLogParserInfo[]} 解析器信息列表
   */
  public getInfoList(): AuxLogParserInfo[] {
    return this.parsers
      .filter((r) => r.enabled)
      .map((r) => r.parser.getAuxLogParserInfo());
  }

  /**
   * 重置注册表
   *
   * 清除所有已注册的项目解析器。
   */
  public reset(): void {
    this.parsers = [];
  }
}

export const projectParserRegistry = ProjectParserRegistry.getInstance();

export function registerProjectParser(parser: ProjectParser, priority?: number): void {
  projectParserRegistry.register(parser, priority);
}

export function getProjectParser(id: string): ProjectParser | null {
  return projectParserRegistry.get(id);
}
