/**
 * @fileoverview 第三层：贝叶斯推理引擎
 *
 * 使用贝叶斯概率推断分析可能的原因。
 * 基于先验知识和当前证据计算后验概率。
 *
 * @module utils/diagnosis/layer3_bayesian
 */

import type {
  UnifiedContext,
  Layer1Result,
  Layer3Result,
  CauseProbability,
} from '../../types/diagnosis';
import { getCausalKnowledge, getRecognitionKnowledge, getActionKnowledge } from './knowledge';

/**
 * 贝叶斯推理引擎
 */
export class BayesianInferenceEngine {
  /**
   * 执行贝叶斯推理
   */
  infer(context: UnifiedContext, layer1Result: Layer1Result): Layer3Result {
    const symptoms = this.extractSymptoms(context, layer1Result);
    const causeProbabilities = this.computeCauseProbabilities(context, symptoms);

    return {
      symptoms,
      causeProbabilities,
    };
  }

  /**
   * 提取症状
   */
  private extractSymptoms(
    context: UnifiedContext,
    layer1Result: Layer1Result
  ): string[] {
    const symptoms: string[] = [];
    const node = context.node;
    const reco = context.recognition;
    const action = context.action;

    if (node.status === 'failed') {
      if (reco && !reco.success) {
        symptoms.push('识别失败');
        
        if (reco.allResults.length === 0) {
          symptoms.push('完全无匹配');
        } else {
          symptoms.push('有识别结果但被过滤');
        }

        if (reco.threshold !== undefined && reco.score !== undefined) {
          const gap = reco.threshold - reco.score;
          if (gap > 0.1) {
            symptoms.push(`分数与阈值差距大 (${gap.toFixed(2)})`);
          }
        }
      }

      if (action && !action.success) {
        symptoms.push('动作执行失败');
        if (action.error) {
          symptoms.push(`错误信息: ${action.error}`);
        }
      }
    }

    for (const match of layer1Result.matches) {
      symptoms.push(...match.symptoms);
    }

    return [...new Set(symptoms)];
  }

  /**
   * 计算原因概率
   * 使用贝叶斯推理计算各原因的后验概率
   */
  private computeCauseProbabilities(
    context: UnifiedContext,
    symptoms: string[]
  ): CauseProbability[] {
    const causes: CauseProbability[] = [];
    const reco = context.recognition;
    const action = context.action;

    if (reco && !reco.success) {
      const causalKnowledge = getCausalKnowledge('识别无匹配');
      if (causalKnowledge) {
        for (const causeInfo of causalKnowledge.causes) {
          let probability = causeInfo.probability;
          const evidence: string[] = [...causeInfo.evidence];

          if (reco.allResults.length === 0) {
            if (causeInfo.conditions.includes('allResults.length === 0')) {
              probability *= 1.5;
              evidence.push('日志确认: 无识别结果');
            }
          }

          if (reco.threshold !== undefined && reco.threshold > 0.85) {
            if (causeInfo.conditions.includes('threshold > 0.85')) {
              probability *= 1.3;
              evidence.push(`阈值过高: ${reco.threshold}`);
            }
          }

          if (reco.score !== undefined && reco.threshold !== undefined) {
            if (reco.score < reco.threshold) {
              const gap = reco.threshold - reco.score;
              if (gap > 0.1) {
                evidence.push(`分数低于阈值 ${gap.toFixed(2)}`);
              }
            }
          }

          const recognitionKnowledge = getRecognitionKnowledge(reco.algorithm || 'TemplateMatch');
          if (recognitionKnowledge) {
            for (const issue of recognitionKnowledge.commonIssues) {
              if (symptoms.some(s => s.includes(issue.issue))) {
                evidence.push(`知识库匹配: ${issue.issue}`);
                probability *= 1.1;
              }
            }
          }

          causes.push({
            cause: causeInfo.cause,
            probability: Math.min(probability, 1),
            evidence,
          });
        }
      }
    }

    if (action && !action.success) {
      const causalKnowledge = getCausalKnowledge('动作执行失败');
      if (causalKnowledge) {
        for (const causeInfo of causalKnowledge.causes) {
          let probability = causeInfo.probability;
          const evidence: string[] = [...causeInfo.evidence];

          if (action.error) {
            if (causeInfo.conditions.some(c => action.error!.toLowerCase().includes(c.toLowerCase()))) {
              probability *= 1.5;
              evidence.push(`错误信息匹配: ${action.error}`);
            }
          }

          if (action.target_offset) {
            if (causeInfo.conditions.includes('offset 计算错误')) {
              evidence.push(`target_offset: [${action.target_offset.join(', ')}]`);
            }
          }

          const actionKnowledge = getActionKnowledge(action.type || 'Click');
          if (actionKnowledge) {
            for (const issue of actionKnowledge.commonIssues) {
              if (action.error?.toLowerCase().includes(issue.issue.toLowerCase())) {
                evidence.push(`知识库匹配: ${issue.issue}`);
                probability *= 1.2;
              }
            }
          }

          causes.push({
            cause: causeInfo.cause,
            probability: Math.min(probability, 1),
            evidence,
          });
        }
      }
    }

    if (reco && !reco.success && reco.score !== undefined && reco.threshold !== undefined) {
      const causalKnowledge = getCausalKnowledge('识别结果分数低');
      if (causalKnowledge) {
        const gap = reco.threshold - (reco.score || 0);
        if (gap > 0.05) {
          for (const causeInfo of causalKnowledge.causes) {
            let probability = causeInfo.probability;
            const evidence: string[] = [...causeInfo.evidence];

            if (reco.threshold > 0.85 && causeInfo.conditions.includes('threshold > 0.85')) {
              probability *= 1.3;
              evidence.push(`阈值过高: ${reco.threshold}`);
            }

            causes.push({
              cause: causeInfo.cause,
              probability: Math.min(probability, 1),
              evidence,
            });
          }
        }
      }
    }

    const aggregatedCauses = this.aggregateCauses(causes);

    return aggregatedCauses.sort((a, b) => b.probability - a.probability);
  }

  /**
   * 聚合相同原因
   */
  private aggregateCauses(causes: CauseProbability[]): CauseProbability[] {
    const causeMap = new Map<string, CauseProbability>();

    for (const cause of causes) {
      const existing = causeMap.get(cause.cause);
      if (existing) {
        existing.probability = Math.max(existing.probability, cause.probability);
        existing.evidence = [...new Set([...existing.evidence, ...cause.evidence])];
      } else {
        causeMap.set(cause.cause, {
          cause: cause.cause,
          probability: cause.probability,
          evidence: [...cause.evidence],
        });
      }
    }

    return Array.from(causeMap.values());
  }
}

/**
 * 便捷函数：执行贝叶斯推理
 */
export function bayesianInfer(
  context: UnifiedContext,
  layer1Result: Layer1Result
): Layer3Result {
  const engine = new BayesianInferenceEngine();
  return engine.infer(context, layer1Result);
}
