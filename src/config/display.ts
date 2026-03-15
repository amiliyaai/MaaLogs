/**
 * @fileoverview 界面显示配置
 *
 * 本文件定义应用程序的界面显示相关配置，包括：
 * - 节点耗时显示阈值和颜色配置
 * - 摘要卡片显示配置
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

export interface SummaryDisplayConfig {
  successRateThresholds: {
    high: number;
    medium: number;
  };
  successRateColors: {
    high: string;
    medium: string;
    low: string;
  };
  severityOrder: Record<string, number>;
  severityLabels: Record<string, string>;
  diagnosisSuggestions: {
    retryWarning: {
      cause: string;
      suggestions: string[];
    };
    durationWarning: {
      cause: (duration: number, threshold: number, severity: string) => string;
      suggestions: string[];
    };
  };
}

export interface DisplayConfig {
  duration: DurationDisplayConfig;
  summary: SummaryDisplayConfig;
  themeOverrides: GlobalThemeOverrides;
}

export const defaultDurationConfig: DurationDisplayConfig = {
  warningThreshold: 3000,
  dangerThreshold: 10000,
  warningColor: "#f0a020",
  dangerColor: "#d03050",
  normalColor: "#18a058",
};

export const defaultSummaryConfig: SummaryDisplayConfig = {
  successRateThresholds: {
    high: 80,
    medium: 50,
  },
  successRateColors: {
    high: "#52c41a",
    medium: "#faad14",
    low: "#ff4d4f",
  },
  severityOrder: {
    critical: 0,
    warning: 1,
    info: 2,
  },
  severityLabels: {
    critical: "严重",
    warning: "警告",
    info: "信息",
  },
  diagnosisSuggestions: {
    retryWarning: {
      cause: "识别重试后成功，建议优化识别参数减少重试",
      suggestions: [
        "检查识别配置是否稳定",
        "考虑优化识别参数提高首次成功率",
        "考虑在节点前添加中间节点作为缓冲",
      ],
    },
    durationWarning: {
      cause: (duration: number, threshold: number, severity: string) =>
        severity === "critical"
          ? `节点耗时过长 (${duration}ms)，超过危险阈值 ${threshold}ms`
          : `节点耗时较长 (${duration}ms)，超过警告阈值 ${threshold}ms`,
      suggestions: [
        "检查节点执行是否有阻塞",
        "优化识别/动作参数",
        "考虑增加超时时间",
      ],
    },
  },
};

export const displayConfig: DisplayConfig = {
  duration: defaultDurationConfig,
  summary: defaultSummaryConfig,
  themeOverrides: {},
};
