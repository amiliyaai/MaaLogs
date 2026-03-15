/**
 * @fileoverview 诊断系统入口
 *
 * 五层推理引擎的整合入口。
 * 支持渐进式诊断，自动检测可用信息。
 *
 * @module utils/diagnosis
 */

import type {
  UnifiedContext,
  DiagnosisResult,
  DiagnosisOptions,
  DiagnosisCategory,
  DiagnosisSeverity,
  Suggestion,
  ReasoningStep,
  HypothesisValidation,
} from '../../types/diagnosis';
import type { NodeInfo } from '../../types/logTypes';

import { buildLogDiagnosisData, buildPipelineDiagnosisData, buildUnifiedContext } from './unifiedContext';
import { PatternMatchingEngine } from './layer1_pattern';
import { ContextUnderstandingEngine } from './layer2_context';
import { BayesianInferenceEngine } from './layer3_bayesian';
import { HypothesisTestingEngine } from './layer4_hypothesis';
import { CausalInferenceEngine } from './layer5_causal';
import { getRecognitionKnowledge, getActionKnowledge, getThresholdKnowledge } from './knowledge';

export * from '../../types/diagnosis';
export * from './unifiedContext';
export * from './layer1_pattern';
export * from './layer2_context';
export * from './layer3_bayesian';
export * from './layer4_hypothesis';
export * from './layer5_causal';
export * from './knowledge';

/**
 * 五层诊断引擎主类
 */
export class FiveLayerDiagnosisEngine {
  private patternEngine: PatternMatchingEngine;
  private contextEngine: ContextUnderstandingEngine;
  private bayesianEngine: BayesianInferenceEngine;
  private hypothesisEngine: HypothesisTestingEngine;
  private causalEngine: CausalInferenceEngine;

  constructor() {
    this.patternEngine = new PatternMatchingEngine();
    this.contextEngine = new ContextUnderstandingEngine();
    this.bayesianEngine = new BayesianInferenceEngine();
    this.hypothesisEngine = new HypothesisTestingEngine();
    this.causalEngine = new CausalInferenceEngine();
  }

  /**
   * 执行诊断
   */
  diagnose(
    node: NodeInfo,
    options: DiagnosisOptions = {}
  ): DiagnosisResult {
    const screenSize = options.screenSize || [1280, 720];

    const logData = buildLogDiagnosisData(node);

    console.log('[Diagnosis] options:', {
      enableAllLayers: options.enableAllLayers,
      hasPipelineConfig: !!options.pipelineConfig,
      nodeName: options.pipelineConfig?.name,
    });

    const pipelineData = options.enableAllLayers && options.pipelineConfig
      ? buildPipelineDiagnosisData(options.pipelineConfig as Record<string, unknown>)
      : undefined;

    console.log('[Diagnosis] pipelineData:', pipelineData);

    const context = buildUnifiedContext(
      logData,
      pipelineData,
      screenSize,
      options.findNodeInAllPipelines
    );

    console.log('[Diagnosis] context.hasPipeline:', context.hasPipeline);

    const layer1Result = this.patternEngine.match(context);
    const layer2Result = this.contextEngine.understand(context);
    const layer3Result = this.bayesianEngine.infer(context, layer1Result);
    const layer4Result = this.hypothesisEngine.test(context, layer3Result);
    const layer5Result = this.causalEngine.infer(context, layer3Result);

    const category = this.determineCategory(layer1Result, layer3Result);
    const severity = this.determineSeverity(category, node.status);
    const suggestions = this.generateSuggestions(context, layer1Result, layer3Result);
    const reasoningChain = this.buildReasoningChain(layer1Result, layer2Result, layer3Result, layer4Result, layer5Result);

    const rootCause = layer5Result.rootCauses[0];
    const confidence = this.calculateOverallConfidence(layer1Result, layer2Result, layer3Result, layer4Result, layer5Result, context.hasPipeline);

    return {
      nodeId: node.node_id,
      nodeName: node.name,
      nodeStatus: node.status,

      category,
      severity,

      rootCause: rootCause?.name || '未知',
      rootCauseConfidence: rootCause?.probability || 0,
      allRootCauses: layer3Result.causeProbabilities,

      reasoningChain,
      suggestions,

      confidence,
      hasPipeline: context.hasPipeline,
      diagnosticDepth: context.hasPipeline ? 'full' : 'basic',

      layerResults: {
        layer1: layer1Result,
        layer2: layer2Result,
        layer3: layer3Result,
        layer4: layer4Result,
        layer5: layer5Result,
      },

      timestamp: Date.now(),
    };
  }

  /**
   * 确定诊断类别
   */
  private determineCategory(
    layer1: ReturnType<typeof this.patternEngine.match>,
    layer3: ReturnType<typeof this.bayesianEngine.infer>
  ): DiagnosisCategory {
    if (layer1.matches.length > 0) {
      return layer1.matches[0].pattern;
    }

    if (layer3.causeProbabilities.length > 0) {
      const topCause = layer3.causeProbabilities[0].cause;
      if (topCause.includes('阈值')) return 'THRESHOLD_ISSUE';
      if (topCause.includes('ROI')) return 'ROI_ISSUE';
      if (topCause.includes('模板')) return 'TEMPLATE_ISSUE';
      if (topCause.includes('动作')) return 'ACTION_FAILED';
      if (topCause.includes('目标')) return 'RECO_NO_MATCH';
    }

    return 'UNKNOWN';
  }

  /**
   * 确定严重程度
   */
  private determineSeverity(category: DiagnosisCategory, nodeStatus: 'success' | 'failed'): DiagnosisSeverity {
    if (nodeStatus === 'success') return 'info';

    switch (category) {
      case 'RECO_NO_MATCH':
        return 'error';
      case 'ACTION_FAILED':
        return 'error';
      case 'ACTION_INVALID_RECT':
        return 'critical';
      case 'TARGET_OFFSET_ERROR':
        return 'critical';
      case 'THRESHOLD_ISSUE':
        return 'warning';
      case 'ROI_ISSUE':
        return 'warning';
      case 'TEMPLATE_ISSUE':
        return 'warning';
      case 'RECO_FILTERED':
        return 'warning';
      default:
        return 'info';
    }
  }

  /**
   * 生成建议
   */
  private generateSuggestions(
    context: UnifiedContext,
    layer1: ReturnType<typeof this.patternEngine.match>,
    layer3: ReturnType<typeof this.bayesianEngine.infer>
  ): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const reco = context.recognition;
    const action = context.action;
    const node = context.node;

    for (const cause of layer3.causeProbabilities.slice(0, 3)) {
      if (cause.cause.includes('阈值过高') || cause.cause.includes('阈值')) {
        const knowledge = getThresholdKnowledge(reco?.algorithm || 'TemplateMatch');
        if (knowledge) {
          const [min, max] = knowledge.recommendedRange;
          suggestions.push({
            type: 'fix',
            title: '调整阈值',
            content: `建议将阈值调整到 ${min}-${max} 范围`,
            category: 'THRESHOLD_ISSUE',
            important: true,
            explanation: knowledge.factors.map(f => `- ${f.factor}: ${f.adjustment === 'increase' ? '增加' : '减少'}阈值 (${f.reason})`).join('\n'),
          });
        }
      }

      if (cause.cause.includes('目标不在屏幕')) {
        suggestions.push({
          type: 'check',
          title: '检查场景',
          content: '确认当前是否在正确的游戏场景中',
          category: 'SCENE_ISSUE',
          explanation: '目标可能尚未出现在屏幕上，需要先执行其他操作进入正确场景',
        });
      }

      if (cause.cause.includes('模板')) {
        const knowledge = getRecognitionKnowledge(reco?.algorithm || 'TemplateMatch');
        if (knowledge) {
          const issue = knowledge.commonIssues.find(i => i.issue.includes('模板'));
          if (issue) {
            suggestions.push({
              type: 'fix',
              title: '更新模板',
              content: issue.suggestion,
              category: 'TEMPLATE_ISSUE',
              important: true,
              explanation: issue.cause,
            });
          }
        }
      }

      if (cause.cause.includes('target_offset')) {
        suggestions.push({
          type: 'fix',
          title: '检查 target_offset',
          content: '检查 target_offset 参数是否正确设置',
          category: 'TARGET_OFFSET_ERROR',
          important: true,
          explanation: 'target_offset 应为相对于识别结果中心的 [x, y] 偏移量',
        });
      }

      if (cause.cause.includes('矩形') || cause.cause.includes('rect')) {
        suggestions.push({
          type: 'check',
          title: '检查动作目标',
          content: '检查动作的 target 参数和识别结果',
          category: 'ACTION_INVALID_RECT',
          important: true,
          explanation: '动作目标矩形可能超出屏幕范围或计算错误',
        });
      }
    }

    for (const match of layer1.matches) {
      if (match.pattern === 'RECO_NO_MATCH') {
        suggestions.push({
          type: 'check',
          title: '识别完全无匹配',
          content: '识别算法未找到任何匹配结果',
          category: 'RECO_NO_MATCH',
          important: true,
          explanation: '检查：1) 是否在正确场景 2) 模板是否过期 3) 识别区域是否正确',
        });
      }
      if (match.pattern === 'ACTION_FAILED') {
        suggestions.push({
          type: 'fix',
          title: '动作执行失败',
          content: '动作未能成功执行',
          category: 'ACTION_FAILED',
          important: true,
          explanation: '检查动作参数是否正确',
        });
      }
    }

    if (action && !action.success) {
      const knowledge = getActionKnowledge(action.type || 'Click');
      if (knowledge && knowledge.commonIssues.length > 0) {
        suggestions.push({
          type: 'fix',
          title: '修复动作',
          content: knowledge.commonIssues[0].suggestion,
          category: 'ACTION_FAILED',
          explanation: knowledge.commonIssues[0].cause,
        });
      }
    }

    if (suggestions.length === 0 && node.status === 'failed') {
      suggestions.push({
        type: 'check',
        title: '节点执行失败',
        content: `节点 "${node.name}" 执行失败，但未能确定具体原因`,
        category: 'RECO_NO_MATCH',
        explanation: '建议：1) 查看详细日志 2) 检查 pipeline 配置 3) 确认游戏版本',
      });
    }

    return suggestions.slice(0, 5);
  }

  /**
   * 构建推理链
   */
  private buildReasoningChain(
    layer1: ReturnType<typeof this.patternEngine.match>,
    layer2: ReturnType<typeof this.contextEngine.understand>,
    layer3: ReturnType<typeof this.bayesianEngine.infer>,
    layer4: ReturnType<typeof this.hypothesisEngine.test>,
    layer5: ReturnType<typeof this.causalEngine.infer>
  ): ReasoningStep[] {
    const steps: ReasoningStep[] = [];

    steps.push({
      step: 1,
      layer: 1,
      type: 'observation',
      title: '模式匹配',
      content: layer1.matches.length > 0
        ? `匹配到 ${layer1.matches.length} 个诊断模式: ${layer1.matches.map(m => m.pattern).join(', ')}`
        : '未匹配到已知模式',
    });

    steps.push({
      step: 2,
      layer: 2,
      type: 'analysis',
      title: '上下文理解',
      content: `节点语义: ${layer2.semantics.intent || '未知'}, 场景: ${layer2.scene}, 执行状态: ${layer2.flowAnalysis.executionState}`,
    });

    if (layer3.symptoms.length > 0) {
      steps.push({
        step: 3,
        layer: 3,
        type: 'inference',
        title: '概率推断',
        content: `识别到 ${layer3.symptoms.length} 个症状: ${layer3.symptoms.slice(0, 3).join(', ')}...`,
      });
    }

    const verifiedHypotheses = layer4.validations.filter((v: HypothesisValidation) => v.verified);
    if (verifiedHypotheses.length > 0) {
      steps.push({
        step: 4,
        layer: 4,
        type: 'analysis',
        title: '假设验证',
        content: `验证了 ${verifiedHypotheses.length} 个假设: ${verifiedHypotheses.map((v: HypothesisValidation) => v.hypothesis).join(', ')}`,
      });
    }

    if (layer5.rootCauses.length > 0) {
      const topCause = layer5.rootCauses[0];
      steps.push({
        step: 5,
        layer: 5,
        type: 'conclusion',
        title: '因果推理',
        content: `根本原因: ${topCause.name} (置信度: ${(topCause.probability * 100).toFixed(0)}%)`,
      });
    }

    return steps;
  }

  /**
   * 计算整体置信度
   */
  private calculateOverallConfidence(
    layer1: ReturnType<typeof this.patternEngine.match>,
    layer2: ReturnType<typeof this.contextEngine.understand>,
    layer3: ReturnType<typeof this.bayesianEngine.infer>,
    layer4: ReturnType<typeof this.hypothesisEngine.test>,
    layer5: ReturnType<typeof this.causalEngine.infer>,
    hasPipeline: boolean
  ): number {
    let score = 0.0;

    score += layer1.confidence * 0.2;
    score += layer2.semantics.confidence * 0.1;

    if (layer3.causeProbabilities.length > 0) {
      const topCause = layer3.causeProbabilities[0];
      score += topCause.probability * 0.25;
    }

    const verifiedCount = layer4.validations.filter((v: HypothesisValidation) => v.verified).length;
    score += (verifiedCount / Math.max(layer4.validations.length, 1)) * 0.2;

    if (layer5.rootCauses.length > 0) {
      score += layer5.rootCauses[0].probability * 0.2;
    }

    if (hasPipeline) {
      score += 0.05;
    }

    return Math.min(score, 1.0);
  }
}

/**
 * 便捷函数：执行诊断
 */
export function diagnose(
  node: NodeInfo,
  options?: DiagnosisOptions
): DiagnosisResult {
  const engine = new FiveLayerDiagnosisEngine();
  return engine.diagnose(node, options);
}

/**
 * 批量诊断多个节点
 */
export function diagnoseNodes(
  nodes: NodeInfo[],
  options?: DiagnosisOptions
): DiagnosisResult[] {
  const engine = new FiveLayerDiagnosisEngine();
  return nodes.map(node => engine.diagnose(node, options));
}
