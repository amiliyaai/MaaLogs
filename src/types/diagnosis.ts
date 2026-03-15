/**
 * @fileoverview MaaLogs 智能诊断系统类型定义
 *
 * 本文件定义了智能诊断系统使用的所有数据类型。
 * 包括诊断上下文、推理结果、建议等数据结构。
 *
 * @module types/diagnosis
 */

import type { NodeInfo } from './logTypes';

/**
 * 诊断严重程度
 */
export type DiagnosisSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * 诊断类别
 */
export type DiagnosisCategory =
  | 'RECO_NO_MATCH'
  | 'RECO_FILTERED'
  | 'RECO_LOW_SCORE'
  | 'ACTION_FAILED'
  | 'ACTION_INVALID_RECT'
  | 'CONFIG_ERROR'
  | 'THRESHOLD_ISSUE'
  | 'ROI_ISSUE'
  | 'TEMPLATE_ISSUE'
  | 'TARGET_OFFSET_ERROR'
  | 'LOCKED_STATE_ISSUE'
  | 'SCENE_ISSUE'
  | 'UNKNOWN';

/**
 * 建议类型
 */
export type SuggestionType = 'fix' | 'check' | 'explanation' | 'manual';

/**
 * 建议
 */
export interface Suggestion {
  type: SuggestionType;
  title?: string;
  content: string;
  category?: DiagnosisCategory;
  important?: boolean;
  critical?: boolean;
  codeChange?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  explanation?: string;
}

/**
 * 证据
 */
export interface Evidence {
  type: 'log' | 'config' | 'calculated' | 'comparison' | 'semantic';
  data: unknown;
}

/**
 * 推理步骤
 */
export interface ReasoningStep {
  step: number;
  layer: 1 | 2 | 3 | 4 | 5;
  type: 'observation' | 'analysis' | 'inference' | 'conclusion';
  title: string;
  content: string;
  evidence?: Evidence;
}

/**
 * 模式匹配结果
 */
export interface PatternMatchResult {
  pattern: DiagnosisCategory;
  confidence: number;
  symptoms: string[];
  matchedConditions: Record<string, unknown>;
}

/**
 * 语义信息
 */
export interface NodeSemantics {
  intent?: string;
  target?: string;
  state?: string;
  action?: string;
  confidence: number;
}

/**
 * 执行链路信息
 */
export interface FlowAnalysis {
  preconditions: string[];
  executionState: 'expected' | 'unexpected' | 'unknown';
  expectedNext: string[];
  actualNext: string[];
  scene: string;
}

/**
 * 概率原因
 */
export interface CauseProbability {
  cause: string;
  probability: number;
  evidence: string[];
}

/**
 * 假设验证结果
 */
export interface HypothesisValidation {
  hypothesis: string;
  verified: boolean;
  confidence: number;
  evidence: Evidence;
  alternatives?: Array<{
    hypothesis: string;
    confidence: number;
  }>;
}

/**
 * 根因
 */
export interface RootCause {
  id: string;
  name: string;
  probability: number;
  reasoning?: string;
}

/**
 * 日志诊断数据
 * 从日志中提取的诊断信息
 */
export interface LogDiagnosisData {
  node: NodeInfo;
  recognition: {
    success: boolean;
    algorithm?: string;
    score?: number;
    threshold?: number;
    box?: [number, number, number, number];
    roi?: [number, number, number, number];
    allResults: Array<{ x: number; y: number; score?: number }>;
    expected?: string[];
  } | null;
  action: {
    type?: string;
    success: boolean;
    error?: string;
    target_offset?: number[];
    target?: string;
  } | null;
  prevNodes: NodeInfo[];
  nextNodes: NodeInfo[];
  taskId?: number;
  timestamp?: string;
}

/**
 * Pipeline 诊断数据
 * 从 Pipeline 配置中提取的诊断信息
 */
export interface PipelineDiagnosisData {
  nodeName: string;
  recognition: {
    algorithm: string;
    template?: string | string[];
    threshold?: number;
    roi?: [number, number, number, number];
    expected?: string | string[];
  };
  action: {
    type: string;
    target?: string | boolean;
    target_offset?: number[];
    begin?: [number, number];
    end?: [number, number];
    duration?: number;
    key?: string;
    input_text?: string;
  };
  next_list?: Array<{ name: string; anchor?: boolean; jump_back?: boolean }>;
  pre_delay?: number;
  post_delay?: number;
  timeout?: number;
  roi?: [number, number, number, number];
}

/**
 * 统一诊断上下文
 * 融合日志和 Pipeline 的信息
 */
export interface UnifiedContext {
  node: NodeInfo;
  recognition: {
    success: boolean;
    algorithm?: string;
    score?: number;
    threshold?: number;
    box?: [number, number, number, number];
    roi?: [number, number, number, number];
    allResults: Array<{ x: number; y: number; score?: number }>;
    expected?: string[];
    template?: string | string[];
  } | null;
  action: {
    type?: string;
    success: boolean;
    error?: string;
    target_offset?: number[];
    target?: string | boolean;
  } | null;
  prevNodes: NodeInfo[];
  nextNodes: NodeInfo[];
  pipeline: PipelineDiagnosisData | null;
  hasPipeline: boolean;
  availableFeatures: Set<string>;
  screenSize: [number, number];
  findNodeInAllPipelines?: (nodeName: string) => Record<string, unknown> | null;
}

/**
 * 第一层：模式匹配结果
 */
export interface Layer1Result {
  matches: PatternMatchResult[];
  confidence: number;
}

/**
 * 第二层：上下文理解结果
 */
export interface Layer2Result {
  semantics: NodeSemantics;
  flowAnalysis: FlowAnalysis;
  scene: string;
}

/**
 * 第三层：概率推断结果
 */
export interface Layer3Result {
  symptoms: string[];
  causeProbabilities: CauseProbability[];
}

/**
 * 第四层：假设验证结果
 */
export interface Layer4Result {
  validations: HypothesisValidation[];
}

/**
 * 第五层：因果推理结果
 */
export interface Layer5Result {
  rootCauses: RootCause[];
}

/**
 * 诊断结果
 */
export interface DiagnosisResult {
  nodeId: number;
  nodeName: string;
  nodeStatus: 'success' | 'failed';
  
  category: DiagnosisCategory;
  severity: DiagnosisSeverity;
  
  rootCause: string;
  rootCauseConfidence: number;
  allRootCauses: CauseProbability[];
  
  reasoningChain: ReasoningStep[];
  suggestions: Suggestion[];
  
  confidence: number;
  hasPipeline: boolean;
  diagnosticDepth: 'basic' | 'full';
  
  layerResults: {
    layer1: Layer1Result;
    layer2: Layer2Result;
    layer3: Layer3Result;
    layer4: Layer4Result;
    layer5: Layer5Result;
  };
  
  timestamp: number;
}

/**
 * 诊断选项
 */
export interface DiagnosisOptions {
  screenSize?: [number, number];
  enableAllLayers?: boolean;
  maxSuggestions?: number;
  pipelineConfig?: Record<string, unknown>;
  findNodeInAllPipelines?: (nodeName: string) => Record<string, unknown> | null;
}

/**
 * 特征可用性
 */
export interface FeatureAvailability {
  hasRecognition: boolean;
  hasAction: boolean;
  hasConfig: boolean;
  hasThreshold: boolean;
  hasROI: boolean;
  hasTemplate: boolean;
  hasTargetOffset: boolean;
}
