/**
 * @fileoverview 失败模式识别器
 *
 * 基于 MAA 框架知识库的自动化失败诊断系统
 * - 多层诊断：基础诊断 + 深度诊断 + 上下文诊断
 * - 遍历所有识别尝试，不只是最后一次
 * - 连锁失败检测
 * - 智能建议生成
 *
 * @module utils/failureDetector
 */

import type { NodeInfo, TaskInfo, RecognitionDetail, ActionDetail, RecognitionAttempt, ActionAttempt, JsonValue } from '@/types/logTypes';
import { failureDetectorConfig } from '@/config/failureDetector';

export type FailureCategory =
  | 'recognition'
  | 'action'
  | 'flow'
  | 'performance'
  | 'unknown';

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
  recognitionDetail?: RecognitionDetail;
  actionDetail?: ActionDetail;
}

interface PatternMatchResult {
  matched: boolean;
  patternId?: string;
  cause?: string;
  suggestions?: string[];
  category?: FailureCategory;
  severity?: FailureSeverity;
  knowledge?: string;
}

type MatchFn = (detail: RecognitionDetail | ActionDetail | Record<string, unknown>, attempt: RecognitionAttempt | ActionAttempt, node: NodeInfo) => PatternMatchResult;

const recognitionPatterns: { id: string; match: MatchFn }[] = [
  {
    id: 'template_not_found',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'TemplateMatch') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      const allResults = detailObj?.all as unknown[] | undefined;
      
      if (!allResults || allResults.length === 0) {
        return {
          matched: true,
          patternId: 'template_not_found',
          category: 'recognition',
          severity: 'critical',
          cause: '屏幕上未找到与模板相似的区域',
          suggestions: [
            '更新模板图片为当前最新版本',
            '检查目标界面是否已发生变化',
            '确认 ROI 区域是否正确覆盖目标',
            '如需快速恢复功能，可适当降低识别阈值作为临时方案',
          ],
          knowledge: 'TemplateMatch',
        };
      }
      
      return { matched: false };
    },
  },
  {
    id: 'template_low_score',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'TemplateMatch') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      const best = detailObj?.best as { score?: number } | undefined;
      const threshold = failureDetectorConfig.thresholds.templateMatch.found;
      if (best && best.score !== undefined && best.score >= threshold && best.score < 0.8) {
        return {
          matched: true,
          patternId: 'template_low_score',
          category: 'recognition',
          severity: 'warning',
          cause: `模板匹配分数为 ${best.score.toFixed(3)}，低于推荐的 0.8 阈值`,
          suggestions: [
            '模板图片可能与当前界面有差异',
            '考虑更新模板为最新版本',
            '检查目标区域是否有遮挡或变化',
          ],
          knowledge: 'TemplateMatch',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'template_all_filtered',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'TemplateMatch') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      const filtered = detailObj?.filtered as unknown[] | undefined;
      const allResults = detailObj?.all as unknown[] | undefined;
      if (Array.isArray(filtered) && filtered.length === 0 && Array.isArray(allResults) && allResults.length > 0) {
        return {
          matched: true,
          patternId: 'template_all_filtered',
          category: 'recognition',
          severity: 'warning',
          cause: `模板匹配找到多个匹配结果，但全部被过滤`,
          suggestions: [
            '检查目标界面是否与模板图片一致',
            '更新模板图片为最新版本',
            '检查目标区域是否有遮挡或变化',
            '如需快速恢复功能，可适当降低识别阈值作为临时方案',
          ],
          knowledge: 'TemplateMatch',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'ocr_not_match',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'OCR') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.result === null && typeof detailObj?.expected === 'string') {
        return {
          matched: true,
          patternId: 'ocr_not_match',
          category: 'recognition',
          severity: 'critical',
          cause: `期望文字 "${detailObj.expected}"，实际识别 "${detailObj.result || '（无）'}"，匹配失败`,
          suggestions: [
            '检查 expected 参数是否与界面文字完全匹配',
            '注意大小写、空格、标点符号',
            '尝试使用正则表达式匹配',
            '检查 OCR 识别区域是否正确',
          ],
          knowledge: 'OCR',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'ocr_empty_result',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'OCR') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if ((detailObj?.result === null || detailObj?.result === '') && !detailObj?.expected) {
        return {
          matched: true,
          patternId: 'ocr_empty_result',
          category: 'recognition',
          severity: 'critical',
          cause: 'OCR 识别结果为空，屏幕上未识别到文字',
          suggestions: [
            '检查目标区域是否包含文字',
            '确认 ROI 区域是否正确',
            '尝试调整 OCR 参数',
          ],
          knowledge: 'OCR',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'ocr_low_confidence',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'OCR') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      const prob = detailObj?.with_prob as number | undefined;
      const threshold = failureDetectorConfig.thresholds.ocr.confidence;
      if (prob !== undefined && prob < threshold) {
        return {
          matched: true,
          patternId: 'ocr_low_confidence',
          category: 'recognition',
          severity: 'warning',
          cause: `OCR 识别置信度为 ${(prob * 100).toFixed(1)}%，结果为 "${detailObj?.result || ''}"`,
          suggestions: [
            '文字可能模糊或不清晰',
            '检查截图质量',
            '尝试调整 OCR 参数',
          ],
          knowledge: 'OCR',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'ocr_all_filtered',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'OCR') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      const allResults = detailObj?.all as unknown[] | undefined;
      const filtered = detailObj?.filtered as unknown[] | undefined;
      if (Array.isArray(allResults) && allResults.length > 0 && Array.isArray(filtered) && filtered.length === 0) {
        return {
          matched: true,
          patternId: 'ocr_all_filtered',
          category: 'recognition',
          severity: 'warning',
          cause: `OCR 识别到结果，但全部被过滤`,
          suggestions: [
            '检查 expected 参数是否正确',
            '确认目标文字是否在屏幕上',
            '检查识别区域 ROI 是否包含目标文字',
          ],
          knowledge: 'OCR',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'all_filtered',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (!d.algorithm || !d.detail) return { matched: false };
      if (d.algorithm === 'OCR') return { matched: false };
      if (d.algorithm === 'TemplateMatch') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      const allResults = detailObj?.all as unknown[] | undefined;
      const filtered = detailObj?.filtered as unknown[] | undefined;
      if (Array.isArray(allResults) && allResults.length > 0 && Array.isArray(filtered) && filtered.length === 0) {
        return {
          matched: true,
          patternId: 'all_filtered',
          category: 'recognition',
          severity: 'warning',
          cause: `${d.algorithm} 识别找到结果，但全部被过滤`,
          suggestions: [
            '检查识别参数是否正确',
            '确认目标是否在屏幕上',
            '检查识别区域 ROI 是否正确',
          ],
          knowledge: d.algorithm,
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'color_not_match',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'ColorMatch') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.result === null) {
        return {
          matched: true,
          patternId: 'color_not_match',
          category: 'recognition',
          severity: 'critical',
          cause: '指定颜色范围在屏幕上未找到匹配',
          suggestions: [
            '检查颜色范围 lower/upper 是否正确',
            '考虑光线变化导致颜色偏差',
            '增加颜色容差范围',
          ],
          knowledge: 'ColorMatch',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'custom_recognition_error',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'Custom') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
          patternId: 'custom_recognition_error',
          category: 'recognition',
          severity: 'critical',
          cause: `自定义识别执行出错: ${detailObj.error}`,
          suggestions: [
            '检查 Go Service 是否正常运行',
            '查看自定义识别日志',
            '确认自定义识别参数格式正确',
          ],
          knowledge: 'Custom',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'and_or',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (!['And', 'Or'].includes(d.algorithm)) return { matched: false };
      const subDetails = d.detail as RecognitionDetail[] | undefined;
      if (!subDetails || subDetails.length === 0) {
        return {
          matched: true,
          patternId: 'and_or',
          category: 'recognition',
          severity: 'critical',
          cause: `${d.algorithm} 组合识别失败，所有子识别结果为空或失败`,
          suggestions: ['检查子识别配置是否正确', '确认各子识别算法是否成功'],
          knowledge: d.algorithm,
        };
      }
      const failedSubReasons: string[] = [];
      for (const sub of subDetails) {
        if (!sub.detail) {
          failedSubReasons.push(`子识别 "${sub.name}" 无结果`);
        } else if (sub.algorithm === 'TemplateMatch') {
          const tmDetail = sub.detail as { best?: { score?: number } | null; filtered?: unknown[] };
          if (!tmDetail.best) {
            failedSubReasons.push(`模板匹配 "${sub.name}" 未找到匹配或未通过过滤`);
          } else if ((tmDetail.best.score ?? 0) < 0.8) {
            failedSubReasons.push(`模板匹配 "${sub.name}" 分数过低 (${(tmDetail.best.score ?? 0).toFixed(3)})`);
          }
        } else if (sub.algorithm === 'OCR') {
          const ocrDetail = sub.detail as { best?: { text?: string } | null; filtered?: unknown[] };
          if (!ocrDetail.best) {
            failedSubReasons.push(`OCR "${sub.name}" 识别结果未通过过滤`);
          }
        } else if (sub.algorithm === 'ColorMatch') {
          const cmDetail = sub.detail as { best?: { r?: number; g?: number; b?: number } | null };
          if (!cmDetail.best) {
            failedSubReasons.push(`颜色匹配 "${sub.name}" 未找到匹配`);
          }
        } else if (sub.algorithm === 'FeatureMatch') {
          const fmDetail = sub.detail as { best?: { score?: number } | null };
          if (!fmDetail.best) {
            failedSubReasons.push(`特征匹配 "${sub.name}" 未找到匹配`);
          } else if ((fmDetail.best.score ?? 0) < 0.8) {
            failedSubReasons.push(`特征匹配 "${sub.name}" 分数过低 (${(fmDetail.best.score ?? 0).toFixed(3)})`);
          }
        } else {
          const subDetail = sub.detail as { best?: unknown };
          if (!subDetail.best) {
            failedSubReasons.push(`子识别 "${sub.name}" (${sub.algorithm}) 未通过过滤`);
          }
        }
      }
      if (failedSubReasons.length > 0) {
        const suggestions: string[] = [];
        
        for (const reason of failedSubReasons) {
          if (reason.includes('TemplateMatch')) {
            if (reason.includes('分数过低')) {
              suggestions.push('降低模板匹配阈值（建议 0.7~0.8）或更新模板图片');
            } else {
              suggestions.push('更新模板图片为当前最新版本');
            }
          } else if (reason.includes('OCR')) {
            suggestions.push('检查 OCR 识别的文字是否正确，调整识别参数');
          } else if (reason.includes('颜色匹配')) {
            suggestions.push('检查颜色配置是否正确，确认目标区域颜色是否符合预期');
          } else if (reason.includes('特征匹配')) {
            suggestions.push('更新特征图片或调整特征匹配参数');
          } else if (reason.includes('子识别')) {
            suggestions.push('检查子识别配置是否正确');
          }
        }
        
        if (d.algorithm === 'And') {
          suggestions.unshift('And 识别需要所有子识别都成功');
        } else if (d.algorithm === 'Or') {
          suggestions.unshift('Or 识别只需任意一个子识别成功');
        }
        
        if (suggestions.length === 0) {
          suggestions.push('检查子识别配置是否正确');
          suggestions.push('调整各子识别参数');
        }
        
        const allReasons = failedSubReasons.join('；');
        
        return {
          matched: true,
          patternId: 'and_or',
          category: 'recognition',
          severity: 'critical',
          cause: `${d.algorithm} 组合识别失败: ${allReasons}`,
          suggestions,
          knowledge: d.algorithm,
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'feature_match',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'FeatureMatch') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (!detailObj) {
        return {
          matched: true,
          patternId: 'feature_match',
          category: 'recognition',
          severity: 'critical',
          cause: '特征匹配未返回结果',
          suggestions: ['检查特征匹配图片是否正确', '确认 ROI 区域是否正确'],
          knowledge: 'FeatureMatch',
        };
      }
      const best = detailObj.best as { score?: number } | undefined;
      if (!best) {
        return {
          matched: true,
          patternId: 'feature_match',
          category: 'recognition',
          severity: 'critical',
          cause: '特征匹配未找到匹配结果',
          suggestions: ['检查特征匹配图片是否正确', '调整特征匹配阈值'],
          knowledge: 'FeatureMatch',
        };
      }
      const score = best.score ?? 0;
      const threshold = failureDetectorConfig.thresholds.featureMatch.score;
      if (score < threshold) {
        return {
          matched: true,
          patternId: 'feature_match',
          category: 'recognition',
          severity: 'warning',
          cause: `特征匹配分数过低 (${score.toFixed(3)})，低于推荐的 ${threshold} 阈值`,
          suggestions: ['更换更清晰的特征匹配图片', '调整特征匹配阈值'],
          knowledge: 'FeatureMatch',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'neural_network_classify',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'NeuralNetworkClassify') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
          patternId: 'neural_network_classify',
          category: 'recognition',
          severity: 'critical',
          cause: `神经网络分类执行出错: ${detailObj.error}`,
          suggestions: [
            '检查模型文件是否存在且正确',
            '确认输入图像是否符合模型要求',
            '查看 Go Service 日志获取详细错误',
          ],
          knowledge: 'NeuralNetworkClassify',
        };
      }
      if (detailObj?.result === undefined && !detailObj?.output) {
        return {
          matched: true,
          patternId: 'neural_network_classify',
          category: 'recognition',
          severity: 'critical',
          cause: '神经网络分类未返回有效结果',
          suggestions: [
            '检查模型文件是否存在',
            '确认分类阈值设置',
            '检查输入图像是否包含目标',
          ],
          knowledge: 'NeuralNetworkClassify',
        };
      }
      const probs = detailObj?.probs as { index: number; desc: string; prob: number }[] | undefined;
      if (probs && probs.length > 0) {
        const topProb = probs[0];
        if (topProb.prob < 0.7) {
          return {
            matched: true,
            patternId: 'neural_network_classify',
            category: 'recognition',
            severity: 'warning',
            cause: `神经网络分类置信度过低 (${(topProb.prob * 100).toFixed(1)}%)，最高分类: ${topProb.desc}`,
            suggestions: [
              '模型可能无法正确区分当前场景',
              '考虑使用其他分类方案',
              '检查目标是否在模型支持类别中',
            ],
            knowledge: 'NeuralNetworkClassify',
          };
        }
      }
      return { matched: false };
    },
  },
  {
    id: 'neural_network_detect',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'NeuralNetworkDetect') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
          patternId: 'neural_network_detect',
          category: 'recognition',
          severity: 'critical',
          cause: `神经网络检测执行出错: ${detailObj.error}`,
          suggestions: [
            '检查模型文件是否存在且正确',
            '确认输入图像是否符合模型要求',
            '查看 Go Service 日志获取详细错误',
          ],
          knowledge: 'NeuralNetworkDetect',
        };
      }
      const result = detailObj?.result as unknown[] | undefined;
      if (!result || result.length === 0) {
        return {
          matched: true,
          patternId: 'neural_network_detect',
          category: 'recognition',
          severity: 'critical',
          cause: '神经网络检测未发现任何目标',
          suggestions: [
            '检查目标是否存在于当前画面',
            '确认检测阈值设置是否过高',
            '检查模型是否适用于当前场景',
          ],
          knowledge: 'NeuralNetworkDetect',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'recognition_timeout',
    match: (detail) => {
      try {
        const detailStr = JSON.stringify(detail).toLowerCase();
        if (detailStr.includes('timeout') || detailStr.includes('超时')) {
          return {
            matched: true,
            patternId: 'recognition_timeout',
            category: 'performance',
            severity: 'warning',
            cause: '识别操作超时',
            suggestions: [
              '增加识别超时时间配置',
              '优化 ROI 区域减少识别范围',
              '简化识别算法',
            ],
            knowledge: 'recognition_timeout',
          };
        }
      } catch {
        return { matched: false };
      }
      return { matched: false };
    },
  },
  {
    id: 'directhit_no_result',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'DirectHit') return { matched: false };
      if (!d.detail) {
        return {
          matched: true,
          patternId: 'directhit_no_result',
          category: 'recognition',
          severity: 'critical',
          cause: 'DirectHit 识别未返回结果',
          suggestions: [
            '检查识别配置是否正确',
            '确认目标界面是否存在',
            '检查 ROI 区域是否正确',
          ],
          knowledge: 'DirectHit',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'detector_no_result',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      const detailObj = d.detail as Record<string, unknown> | undefined;
      const allResults = detailObj?.all as unknown[] | undefined;
      
      if (!allResults || allResults.length === 0) {
        return {
          matched: true,
          patternId: 'detector_no_result',
          category: 'recognition',
          severity: 'critical',
          cause: `${d.algorithm} 识别未找到任何结果`,
          suggestions: [
            '检查目标界面是否正确',
            '确认识别参数配置是否正确',
            '检查模型文件是否存在',
          ],
          knowledge: d.algorithm,
        };
      }
      return { matched: false };
    },
  },
];

function matchDetail(
  detail: RecognitionDetail | ActionDetail | Record<string, unknown>,
  attempt: RecognitionAttempt | ActionAttempt,
  node: NodeInfo,
  patterns: { id: string; match: MatchFn }[]
): PatternMatchResult {
  for (const pattern of patterns) {
    const result = pattern.match(detail, attempt, node);
    if (result.matched) {
      return result;
    }
  }
  return { matched: false };
}

function extractScoresFromDetail(detail: JsonValue): number[] {
  const scores: number[] = [];
  if (Array.isArray(detail)) {
    for (const child of detail) {
      if (child && typeof child === 'object' && 'detail' in child) {
        const childDetail = (child as { detail?: JsonValue }).detail;
        if (childDetail && typeof childDetail === 'object' && !Array.isArray(childDetail)) {
          const obj = childDetail as Record<string, JsonValue>;
          if (Array.isArray(obj.all)) {
            for (const r of obj.all) {
              if (r && typeof r === 'object' && 'score' in r) {
                const score = (r as { score?: number }).score;
                if (typeof score === 'number') scores.push(score);
              }
            }
          } else if (typeof obj.score === 'number') {
            scores.push(obj.score);
          }
        }
      }
    }
  } else if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const obj = detail as Record<string, JsonValue>;
    if (Array.isArray(obj.all)) {
      for (const r of obj.all) {
        if (r && typeof r === 'object' && 'score' in r) {
          const score = (r as { score?: number }).score;
          if (typeof score === 'number') scores.push(score);
        }
      }
    } else if (typeof obj.score === 'number') {
      scores.push(obj.score);
    }
  }
  return scores;
}

function diagnoseRecognitionAttempts(
  node: NodeInfo,
  task: TaskInfo
): DiagnosisResult[] {
  const results: DiagnosisResult[] = [];
  const attempts = node.recognition_attempts || [];
  
  if (attempts.length === 0) {
    return results;
  }

  const failedAttempts = attempts.filter(a => a.status === 'failed');
  const successAttempts = attempts.filter(a => a.status === 'success');

  for (const attempt of attempts) {
    if (!attempt.reco_details) continue;
    
    const result = matchDetail(attempt.reco_details, attempt, node, recognitionPatterns);
    if (result.matched && result.patternId) {
      const attemptScores = extractScoresFromDetail(attempt.reco_details?.detail);
      
      results.push({
        nodeId: node.node_id,
        nodeName: node.name,
        taskName: task.entry,
        category: result.category ?? 'recognition',
        severity: result.severity ?? 'warning',
        patternId: result.patternId,
        cause: result.cause ?? '未知原因',
        suggestions: result.suggestions ?? [],
        relatedKnowledge: result.knowledge,
        recognitionDetail: attempt.reco_details,
        recognitionHistory: {
          totalAttempts: attempts.length,
          failedAttempts: failedAttempts.length,
          scores: attemptScores,
          algorithms: [...new Set(attempts.map(a => a.reco_details?.algorithm).filter(Boolean))] as string[],
        },
      });
    }
  }

  if (failedAttempts.length > 1 && successAttempts.length > 0) {
    const hasRetryDiagnosis = results.some(r => r.patternId === 'recognition_retry');
    if (!hasRetryDiagnosis) {
      const allScores: number[] = [];
      for (const attempt of attempts) {
        if (attempt.reco_details?.detail) {
          allScores.push(...extractScoresFromDetail(attempt.reco_details.detail));
        }
      }
      
      results.push({
        nodeId: node.node_id,
        nodeName: node.name,
        taskName: task.entry,
        category: 'performance',
        severity: 'warning',
        patternId: 'recognition_retry',
        cause: '识别重试后成功，建议优化识别参数减少重试',
        suggestions: [
          '检查识别配置是否稳定',
          '考虑优化识别参数提高首次成功率',
          '增加重试间隔时间避免界面动画干扰',
          `考虑在 "${node.name}" 前添加中间节点作为缓冲`,
        ],
        recognitionHistory: {
          totalAttempts: attempts.length,
          failedAttempts: failedAttempts.length,
          scores: allScores,
          algorithms: [],
        },
      });
    }
  }

  if (attempts.length >= 3 && failedAttempts.length === attempts.length) {
    results.push({
      nodeId: node.node_id,
      nodeName: node.name,
      taskName: task.entry,
      category: 'recognition',
      severity: 'critical',
      patternId: 'recognition_all_failed',
      cause: '该节点识别连续多次全部失败',
      suggestions: [
        '检查识别参数配置是否正确',
        '确认目标界面是否发生变化',
        '检查 ROI 区域是否正确',
      ],
      recognitionHistory: {
        totalAttempts: attempts.length,
        failedAttempts: failedAttempts.length,
        scores: [],
        algorithms: [],
      },
    });
  }

  return results;
}

function diagnoseActionAttempts(
  node: NodeInfo,
  task: TaskInfo
): DiagnosisResult[] {
  const results: DiagnosisResult[] = [];
  const actionDetails = node.action_details;

  if (!actionDetails) return results;
  
  if (actionDetails.success === false) {
    const action = actionDetails.action || '未知动作';
    results.push({
      nodeId: node.node_id,
      nodeName: node.name,
      taskName: task.entry,
      category: 'action',
      severity: 'warning',
      patternId: 'action_failed',
      cause: `动作 "${action}" 执行失败`,
      suggestions: [
        '检查目标界面是否存在',
        '确认操作是否被其他进程阻挡',
        '适当增加动作等待时间',
      ],
      relatedKnowledge: undefined,
      actionDetail: actionDetails,
    });
  }

  return results;
}

function detectChainFailures(task: TaskInfo): DiagnosisResult[] {
  const results: DiagnosisResult[] = [];
  const nodes = task.nodes || [];
  
  let failedBeforeSkipped = false;
  let failedNodeName = '';

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const prevNode = i > 0 ? nodes[i - 1] : null;

    if (prevNode?.status === 'failed') {
      failedBeforeSkipped = true;
      failedNodeName = prevNode.name;
    }

    if (node.status === 'success' && failedBeforeSkipped) {
      results.push({
        nodeId: node.node_id,
        nodeName: node.name,
        taskName: task.entry,
        category: 'flow',
        severity: 'info',
        patternId: 'flow_resumed',
        cause: `前置节点 "${failedNodeName}" 失败后，流程已恢复执行`,
        suggestions: [
          `建议优先排查节点 "${failedNodeName}" 的问题`,
          '当前节点执行成功，说明后续流程正常',
        ],
      });
      failedBeforeSkipped = false;
    }
  }

  return results;
}

export function diagnoseFailures(tasks: TaskInfo[]): DiagnosisResult[] {
  const results: DiagnosisResult[] = [];

  for (const task of tasks) {
    if (!task.nodes) continue;

    const chainResults = detectChainFailures(task);
    results.push(...chainResults);

    for (const node of task.nodes) {
      const nodeStatus = (node as { status?: string }).status;
      if (nodeStatus === 'disabled') {
        results.push({
          nodeId: node.node_id,
          nodeName: node.name,
          taskName: task.entry,
          category: 'flow',
          severity: 'info',
          patternId: 'node_disabled',
          cause: `节点 "${node.name}" 已被禁用`,
          suggestions: [
            '如需启用，请检查配置文件',
            '确认该节点是否为条件性跳过',
          ],
        });
        continue;
      }

      if (node.status !== 'failed') continue;

      const recognitionResults = diagnoseRecognitionAttempts(node, task);
      results.push(...recognitionResults);

      const actionResults = diagnoseActionAttempts(node, task);
      results.push(...actionResults);

      if (recognitionResults.length === 0 && actionResults.length === 0) {
        results.push({
          nodeId: node.node_id,
          nodeName: node.name,
          taskName: task.entry,
          category: 'unknown',
          severity: 'warning',
          patternId: 'unknown_failure',
          cause: '节点执行失败，但未能识别出具体原因',
          suggestions: [
            '请查看节点详情中的原始日志',
            '检查是否有截图信息',
            '如持续出现此问题，请提交日志反馈',
          ],
        });
      }
    }
  }

  return results;
}

export function summarizeDiagnoses(diagnoses: DiagnosisResult[]) {
  const summary = {
    total: diagnoses.length,
    critical: 0,
    warning: 0,
    info: 0,
    byCategory: {} as Record<string, number>,
    byPattern: {} as Record<string, number>,
    byTask: {} as Record<string, number>,
  };

  for (const d of diagnoses) {
    if (d.severity === 'critical') summary.critical++;
    else if (d.severity === 'warning') summary.warning++;
    else if (d.severity === 'info') summary.info++;

    summary.byCategory[d.category] = (summary.byCategory[d.category] ?? 0) + 1;
    summary.byPattern[d.patternId] = (summary.byPattern[d.patternId] ?? 0) + 1;
    summary.byTask[d.taskName] = (summary.byTask[d.taskName] ?? 0) + 1;
  }

  return summary;
}
