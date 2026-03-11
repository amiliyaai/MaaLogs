/**
 * @fileoverview 界面显示配置
 *
 * 本文件定义应用程序的界面显示相关配置，包括：
 * - 节点耗时显示阈值和颜色配置
 *
 * @module config/display
 */

import type { GlobalThemeOverrides } from "naive-ui";

export interface DurationDisplayConfig {
  warningThreshold: number;
  dangerThreshold: number;
  warningColor: string;
  dangerColor: string;
  normalColor: string;
}

export interface DisplayConfig {
  duration: DurationDisplayConfig;
  themeOverrides: GlobalThemeOverrides;
}

export const defaultDurationConfig: DurationDisplayConfig = {
  warningThreshold: 3000,
  dangerThreshold: 10000,
  warningColor: "#f0a020",
  dangerColor: "#d03050",
  normalColor: "#18a058",
};

export const displayConfig: DisplayConfig = {
  duration: defaultDurationConfig,
  themeOverrides: {},
};
