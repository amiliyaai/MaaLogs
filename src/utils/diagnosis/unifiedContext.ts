/**
 * @fileoverview 统一上下文管理器
 *
 * 负责融合来自日志和 Pipeline 的信息，构建统一的诊断上下文。
 * 支持渐进式诊断，自动检测可用信息。
 *
 * @module utils/diagnosis/unifiedContext
 */

import type {
  UnifiedContext,
  LogDiagnosisData,
  PipelineDiagnosisData,
  FeatureAvailability,
} from '../../types/diagnosis';
import type { NodeInfo, RecognitionDetail, ActionDetail } from '../../types/logTypes';

/**
 * 构建日志诊断数据
 * 从 NodeInfo 中提取诊断所需的信息
 */
export function buildLogDiagnosisData(
  node: NodeInfo,
  prevNodes: NodeInfo[] = [],
  nextNodes: NodeInfo[] = []
): LogDiagnosisData {
  const recognition = node.reco_details
    ? extractRecognitionInfo(node.reco_details)
    : null;

  const action = node.action_details
    ? extractActionInfo(node.action_details)
    : null;

  return {
    node,
    recognition,
    action,
    prevNodes,
    nextNodes,
    taskId: node.task_id,
    timestamp: node.timestamp,
  };
}

/**
 * 从识别详情中提取诊断信息
 */
function extractRecognitionInfo(
  reco: RecognitionDetail
): LogDiagnosisData['recognition'] {
  const detail = reco.detail as Record<string, unknown>;
  
  let threshold: number | undefined;
  let roi: [number, number, number, number] | undefined;
  let allResults: Array<{ x: number; y: number; score?: number }> = [];

  if (detail) {
    if (typeof detail.threshold === 'number') {
      threshold = detail.threshold;
    }

    if (Array.isArray(detail.roi) && detail.roi.length === 4) {
      roi = detail.roi as [number, number, number, number];
    }

    if (Array.isArray(detail.all_results)) {
      allResults = (detail.all_results as Array<{ x: number; y: number; score?: number }>)
        .map(r => ({
          x: r.x,
          y: r.y,
          score: r.score,
        }));
    }

    if (Array.isArray(detail.filtered_results)) {
      const filtered = detail.filtered_results as Array<{ x: number; y: number; score?: number }>;
      if (filtered.length > 0) {
        allResults = filtered;
      }
    }
  }

  return {
    success: reco.box !== null,
    algorithm: reco.algorithm,
    score: (detail?.score as number) ?? (detail?.similarity as number),
    threshold,
    box: reco.box ?? undefined,
    roi,
    allResults,
    expected: reco.expected,
  };
}

/**
 * 从动作详情中提取诊断信息
 */
function extractActionInfo(
  action: ActionDetail
): LogDiagnosisData['action'] {
  const detail = action.detail as Record<string, unknown>;

  let target_offset: number[] | undefined;
  let target: string | undefined;

  if (detail) {
    if (Array.isArray(detail.target_offset)) {
      target_offset = detail.target_offset as number[];
    }

    if (typeof detail.target === 'string') {
      target = detail.target;
    }
  }

  return {
    type: action.action,
    success: action.success,
    error: !action.success ? (detail?.error as string) : undefined,
    target_offset,
    target,
  };
}

/**
 * 构建 Pipeline 诊断数据
 * 从节点配置中提取诊断信息
 */
export function buildPipelineDiagnosisData(
  nodeConfig: Record<string, unknown>
): PipelineDiagnosisData | undefined {
  if (!nodeConfig) return undefined;

  const recognition = nodeConfig.recognition as Record<string, unknown> | undefined;
  const action = nodeConfig.action as Record<string, unknown> | undefined;

  return {
    nodeName: nodeConfig.name as string,
    recognition: recognition
      ? {
          algorithm: recognition.type as string,
          template: recognition.template as string | string[] | undefined,
          threshold: recognition.threshold as number | undefined,
          roi: recognition.roi as [number, number, number, number] | undefined,
          expected: recognition.expected as string | string[] | undefined,
        }
      : {
          algorithm: 'DirectHit',
        },
    action: action
      ? {
          type: action.type as string,
          target: action.target as string | boolean | undefined,
          target_offset: action.target_offset as number[] | undefined,
          begin: action.begin as [number, number] | undefined,
          end: action.end as [number, number] | undefined,
          duration: action.duration as number | undefined,
          key: action.key as string | undefined,
          input_text: action.input_text as string | undefined,
        }
      : {
          type: 'DoNothing',
        },
    next_list: nodeConfig.next as Array<{ name: string; anchor?: boolean; jump_back?: boolean }>,
    pre_delay: nodeConfig.pre_delay as number | undefined,
    post_delay: nodeConfig.post_delay as number | undefined,
    timeout: nodeConfig.timeout as number | undefined,
    roi: nodeConfig.roi as [number, number, number, number] | undefined,
  };
}

/**
 * 构建统一诊断上下文
 * 融合日志和 Pipeline 数据
 */
export function buildUnifiedContext(
  logData: LogDiagnosisData,
  pipelineData?: PipelineDiagnosisData,
  screenSize: [number, number] = [1280, 720],
  findNodeInAllPipelines?: (nodeName: string) => Record<string, unknown> | null
): UnifiedContext {
  const hasPipeline = !!pipelineData;

  const recognition = mergeRecognition(logData.recognition, pipelineData?.recognition);
  const action = mergeAction(logData.action, pipelineData?.action);

  const availableFeatures = detectAvailableFeatures(logData, pipelineData);

  return {
    node: logData.node,
    recognition,
    action,
    prevNodes: logData.prevNodes,
    nextNodes: logData.nextNodes,
    pipeline: pipelineData || null,
    hasPipeline,
    availableFeatures,
    screenSize,
    findNodeInAllPipelines,
  };
}

/**
 * 融合识别信息
 * Pipeline 数据覆盖日志推断数据
 */
function mergeRecognition(
  logReco: LogDiagnosisData['recognition'],
  pipelineReco?: PipelineDiagnosisData['recognition']
): UnifiedContext['recognition'] {
  if (!logReco && !pipelineReco) {
    return null;
  }

  const base = logReco || {
    success: false,
    allResults: [],
  };

  if (!pipelineReco) {
    return base;
  }

  return {
    ...base,
    algorithm: pipelineReco.algorithm,
    threshold: pipelineReco.threshold ?? base.threshold,
    roi: pipelineReco.roi ?? base.roi,
    template: pipelineReco.template,
  };
}

/**
 * 融合动作信息
 * Pipeline 数据覆盖日志推断数据
 */
function mergeAction(
  logAction: LogDiagnosisData['action'],
  pipelineAction?: PipelineDiagnosisData['action']
): UnifiedContext['action'] {
  if (!logAction && !pipelineAction) {
    return null;
  }

  const base = logAction || {
    success: false,
  };

  if (!pipelineAction) {
    return base;
  }

  return {
    ...base,
    type: pipelineAction.type,
    target_offset: pipelineAction.target_offset ?? base.target_offset,
    target: pipelineAction.target ?? base.target,
  };
}

/**
 * 检测可用特征
 */
function detectAvailableFeatures(
  logData: LogDiagnosisData,
  pipelineData?: PipelineDiagnosisData
): Set<string> {
  const features = new Set<string>();

  if (logData.recognition) {
    features.add('recognition');
    if (logData.recognition.threshold !== undefined) features.add('threshold');
    if (logData.recognition.roi) features.add('roi');
    if (logData.recognition.allResults.length > 0) features.add('results');
  }

  if (logData.action) {
    features.add('action');
    if (logData.action.target_offset) features.add('targetOffset');
    if (logData.action.error) features.add('error');
  }

  if (pipelineData) {
    features.add('pipeline');
    if (pipelineData.recognition.template) features.add('template');
    if (pipelineData.action.target_offset) features.add('targetOffset');
    if (pipelineData.recognition.threshold !== undefined) features.add('threshold');
    if (pipelineData.recognition.roi || pipelineData.roi) features.add('roi');
  }

  return features;
}

/**
 * 获取特征可用性摘要
 */
export function getFeatureAvailability(
  context: UnifiedContext
): FeatureAvailability {
  const f = context.availableFeatures;

  return {
    hasRecognition: f.has('recognition'),
    hasAction: f.has('action'),
    hasConfig: f.has('pipeline') || f.has('threshold'),
    hasThreshold: f.has('threshold'),
    hasROI: f.has('roi'),
    hasTemplate: f.has('template'),
    hasTargetOffset: f.has('targetOffset'),
  };
}

/**
 * 计算诊断置信度
 */
export function calculateConfidence(
  context: UnifiedContext,
  layerConfidences: {
    layer1: number;
    layer2: number;
    layer3: number;
    layer4: number;
    layer5: number;
  }
): number {
  let score = 0.2;

  score += layerConfidences.layer1 * 0.15;
  score += layerConfidences.layer2 * 0.1;
  score += layerConfidences.layer3 * 0.15;
  score += layerConfidences.layer4 * 0.15;
  score += layerConfidences.layer5 * 0.15;

  if (context.hasPipeline) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}
