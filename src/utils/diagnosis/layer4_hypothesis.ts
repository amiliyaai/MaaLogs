/**
 * @fileoverview 第四层：假设验证引擎
 *
 * 验证猜测，排除不可能的情况。
 * 基于证据进行假设检验。
 *
 * @module utils/diagnosis/layer4_hypothesis
 */

import type {
  UnifiedContext,
  Layer3Result,
  Layer4Result,
  HypothesisValidation,
  Evidence,
} from '../../types/diagnosis';

/**
 * 假设验证引擎
 */
export class HypothesisTestingEngine {
  /**
   * 执行假设验证
   */
  test(context: UnifiedContext, layer3Result: Layer3Result): Layer4Result {
    const validations: HypothesisValidation[] = [];

    for (const cause of layer3Result.causeProbabilities.slice(0, 5)) {
      const validation = this.validateHypothesis(context, cause.cause, cause.probability);
      validations.push(validation);
    }

    return {
      validations,
    };
  }

  /**
   * 验证单个假设
   */
  private validateHypothesis(
    context: UnifiedContext,
    hypothesis: string,
    probability: number
  ): HypothesisValidation {
    const evidence = this.collectEvidence(context, hypothesis);
    const verified = this.checkHypothesis(context, hypothesis, probability);
    const confidence = this.calculateConfidence(probability, evidence);
    const alternatives = this.findAlternatives(context, hypothesis);

    return {
      hypothesis,
      verified,
      confidence,
      evidence,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  /**
   * 收集证据
   */
  private collectEvidence(context: UnifiedContext, hypothesis: string): Evidence {
    const reco = context.recognition;
    const action = context.action;
    const pipeline = context.pipeline;
    const node = context.node;

    const evidenceData: Record<string, unknown> = {};

    if (hypothesis.includes('阈值')) {
      if (reco) {
        evidenceData.threshold = reco.threshold;
        evidenceData.score = reco.score;
        if (reco.threshold && reco.score) {
          evidenceData.gap = reco.threshold - reco.score;
        }
      }
      if (pipeline?.recognition) {
        evidenceData.pipelineThreshold = pipeline.recognition.threshold;
      }
    }

    if (hypothesis.includes('ROI') || hypothesis.includes('范围')) {
      if (reco?.roi) {
        evidenceData.roi = reco.roi;
      }
      if (pipeline?.recognition?.roi) {
        evidenceData.pipelineRoi = pipeline.recognition.roi;
      }
      if (reco?.box) {
        evidenceData.box = reco.box;
      }
      evidenceData.screenSize = context.screenSize;
    }

    if (hypothesis.includes('模板')) {
      if (pipeline?.recognition?.template) {
        evidenceData.template = pipeline.recognition.template;
      }
      evidenceData.algorithm = reco?.algorithm || pipeline?.recognition?.algorithm;
    }

    if (hypothesis.includes('target_offset') || hypothesis.includes('偏移')) {
      if (action?.target_offset) {
        evidenceData.targetOffset = action.target_offset;
      }
      if (pipeline?.action?.target_offset) {
        evidenceData.pipelineTargetOffset = pipeline.action.target_offset;
      }
    }

    if (hypothesis.includes('矩形') || hypothesis.includes('rect')) {
      if (action?.type) {
        evidenceData.actionType = action.type;
      }
      if (reco?.box) {
        evidenceData.recoBox = reco.box;
      }
    }

    if (hypothesis.includes('目标不在')) {
      if (reco) {
        evidenceData.resultsCount = reco.allResults.length;
        evidenceData.success = reco.success;
      }
    }

    evidenceData.nodeStatus = node.status;
    evidenceData.hasPipeline = context.hasPipeline;

    return {
      type: 'log',
      data: evidenceData,
    };
  }

  /**
   * 检查假设
   */
  private checkHypothesis(context: UnifiedContext, hypothesis: string, probability: number): boolean {
    const reco = context.recognition;
    const action = context.action;
    const pipeline = context.pipeline;

    switch (true) {
      case hypothesis.includes('阈值过高'):
        if (reco?.threshold !== undefined && reco.threshold > 0.85) {
          return true;
        }
        if (pipeline?.recognition?.threshold !== undefined && pipeline.recognition.threshold > 0.85) {
          return true;
        }
        return false;

      case hypothesis.includes('阈值过低'):
        if (reco?.threshold !== undefined && reco.threshold < 0.5) {
          return true;
        }
        return false;

      case hypothesis.includes('ROI') && hypothesis.includes('不正确'):
        if (reco?.roi && reco.box) {
          const [rx, ry, rw, rh] = reco.roi;
          const [bx, by, bw, bh] = reco.box;
          if (bx < rx || by < ry || bx + bw > rx + rw || by + bh > ry + rh) {
            return true;
          }
        }
        return false;

      case hypothesis.includes('模板图片过时'):
        return pipeline?.recognition?.template !== undefined;

      case hypothesis.includes('target_offset'):
        if (action?.target_offset) {
          if (action.target_offset.length !== 2) {
            return true;
          }
          const [ox, oy] = action.target_offset;
          if (Math.abs(ox) > 100 || Math.abs(oy) > 100) {
            return true;
          }
        }
        return false;

      case hypothesis.includes('目标矩形无效'):
        if (action?.error && /rect|target|invalid/i.test(action.error)) {
          return true;
        }
        return false;

      case hypothesis.includes('目标不在屏幕上'):
        if (reco && !reco.success && reco.allResults.length === 0) {
          return true;
        }
        return false;

      case hypothesis.includes('有结果但被过滤'):
        if (reco && !reco.success && reco.allResults && reco.allResults.length > 0) {
          return true;
        }
        return false;

      case hypothesis.includes('点击位置被遮挡'):
        return action?.type === 'Click' && !action.success;

      default:
        return probability > 0.3;
    }
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    probability: number,
    evidence: Evidence
  ): number {
    const data = evidence.data as Record<string, unknown>;
    
    let confidence = probability;

    if (Object.keys(data).length > 3) {
      confidence += 0.1;
    }

    if (data.hasPipeline) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1);
  }

  /**
   * 寻找替代假设
   */
  private findAlternatives(
    context: UnifiedContext,
    currentHypothesis: string
  ): Array<{ hypothesis: string; confidence: number }> {
    const alternatives: Array<{ hypothesis: string; confidence: number }> = [];
    const reco = context.recognition;
    const action = context.action;

    if (currentHypothesis.includes('阈值') && reco) {
      if (reco.threshold !== undefined) {
        if (reco.threshold > 0.85) {
          alternatives.push({
            hypothesis: '阈值设置合理，需要检查模板质量',
            confidence: 0.4,
          });
        } else if (reco.threshold < 0.6) {
          alternatives.push({
            hypothesis: '阈值过低，容易误匹配',
            confidence: 0.5,
          });
        }
      }
    }

    if (currentHypothesis.includes('目标不在') && reco) {
      alternatives.push({
        hypothesis: 'UI 界面已变化，需要更新识别策略',
        confidence: 0.6,
      });
      alternatives.push({
        hypothesis: '当前场景不正确，需要先进入正确场景',
        confidence: 0.5,
      });
    }

    if (action && !action.success && !currentHypothesis.includes('动作')) {
      alternatives.push({
        hypothesis: '动作执行失败，需要检查动作参数',
        confidence: 0.7,
      });
    }

    return alternatives;
  }
}

/**
 * 便捷函数：执行假设验证
 */
export function testHypotheses(
  context: UnifiedContext,
  layer3Result: Layer3Result
): Layer4Result {
  const engine = new HypothesisTestingEngine();
  return engine.test(context, layer3Result);
}
