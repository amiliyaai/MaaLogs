/**
 * @fileoverview 失败检测器配置
 *
 * 配置化阈值、权重、选项
 *
 * @module config/failureDetector
 */

export const failureDetectorConfig = {
  thresholds: {
    templateMatch: {
      found: 0.5,
      filtered: 0.8,
    },
    ocr: {
      confidence: 0.7,
    },
    featureMatch: {
      score: 0.8,
    },
  },
  timeouts: {
    recognition: 30000,
    action: 10000,
  },
} as const;

export type FailureCategory = 'recognition' | 'action' | 'unknown';
export type FailureSeverity = 'critical' | 'warning' | 'info';

export interface DiagnosisResult {
  nodeId: number;
  nodeName: string;
  taskName: string;
  category: FailureCategory;
  severity: FailureSeverity;
  patternId: string;
  cause: string;
  suggestions: string[];
  relatedKnowledge?: string;
  recognitionHistory?: {
    totalAttempts: number;
    failedAttempts: number;
    scores: number[];
    algorithms: string[];
  };
}

export interface PatternDefinition {
  id: string;
  algorithm?: string;
  action?: string;
  condition: (detail: unknown, node: unknown) => boolean;
  severity: FailureSeverity;
  category: FailureCategory;
  cause: (detail: unknown, node: unknown) => string;
  suggestions: string[];
  knowledge?: string;
}
