/**
 * @fileoverview 应用配置文件
 *
 * 本文件定义了应用程序的全局配置，包括：
 * - 环境类型（本地、测试、预发布、生产）
 * - 日志配置（日志级别、轮转大小、轮转数量）
 * - 指标收集配置（启用状态、端口号）
 *
 * 配置会根据 Vite 的 MODE 环境变量自动选择对应的环境配置
 *
 * @module config
 * @author MaaLogs Team
 * @license MIT
 */

import type { LogLevel } from "../domains/logs/utils/logger";

/** 应用运行环境的类型定义 */
export type AppEnvironment = "local" | "test" | "staging" | "production";

/** 应用配置的完整类型定义 */
export type AppConfig = {
  /** 当前运行环境 */
  env: AppEnvironment;
  /** 日志相关配置 */
  log: {
    /** 日志记录级别 */
    level: LogLevel;
    /** 日志文件轮转大小（字节） */
    rotationSize: number;
    /** 保留的日志文件数量 */
    rotationCount: number;
  };
  /** 指标收集相关配置 */
  metrics: {
    /** 是否启用指标收集 */
    enabled: boolean;
    /** 指标服务器端口号 */
    port: number;
  };
};

/** 获取当前 Vite 运行模式 */
const mode = import.meta.env.MODE;

/** 根据环境变量确定当前运行环境 */
let environment: AppEnvironment = "local";
if (mode === "production") {
  environment = "production";
} else if (mode === "test") {
  environment = "test";
} else if (mode === "staging") {
  environment = "staging";
}

/** 不同环境的配置集合 */
const configs: Record<AppEnvironment, AppConfig> = {
  local: {
    env: "local",
    log: {
      level: "INFO",
      rotationSize: 10 * 1024 * 1024,
      rotationCount: 5,
    },
    metrics: {
      enabled: true,
      port: 9100,
    },
  },
  test: {
    env: "test",
    log: {
      level: "WARN",
      rotationSize: 10 * 1024 * 1024,
      rotationCount: 3,
    },
    metrics: {
      enabled: false,
      port: 9100,
    },
  },
  staging: {
    env: "staging",
    log: {
      level: "INFO",
      rotationSize: 20 * 1024 * 1024,
      rotationCount: 5,
    },
    metrics: {
      enabled: true,
      port: 9100,
    },
  },
  production: {
    env: "production",
    log: {
      level: "INFO",
      rotationSize: 20 * 1024 * 1024,
      rotationCount: 7,
    },
    metrics: {
      enabled: true,
      port: 9100,
    },
  },
};

/** 导出的应用配置对象，根据当前环境自动选择对应配置 */
export const appConfig = configs[environment];
