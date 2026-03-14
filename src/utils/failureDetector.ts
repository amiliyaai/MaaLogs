/**
 * @fileoverview 失败模式识别器
 *
 * 基于 MAA 框架知识库的自动化失败诊断系统
 * - 自动分类失败类型
 * - 匹配已知问题模式
 * - 生成诊断建议
 *
 * @module utils/failureDetector
 */

import type { NodeInfo, TaskInfo, RecognitionDetail, ActionDetail } from '@/types/logTypes';
import { failureDetectorConfig } from '@/config/failureDetector';

export type FailureCategory =
  | 'recognition'
  | 'action'
  | 'unknown';

/**
 * 失败严重程度
 * - critical: 需要立即处理的严重问题
 * - warning: 需要关注的警告
 * - info: 信息性提示
 */
export type FailureSeverity = 'critical' | 'warning' | 'info';

/**
 * 诊断结果
 */
export interface DiagnosisResult {
  /** 节点 ID */
  nodeId: number;
  /** 节点名称 */
  nodeName: string;
  /** 任务名称 */
  taskName: string;
  /** 失败类别 */
  category: FailureCategory;
  /** 严重程度 */
  severity: FailureSeverity;
  /** Pattern ID */
  patternId: string;
  /** 失败原因 */
  cause: string;
  /** 建议操作 */
  suggestions: string[];
  /** 相关知识链接 */
  relatedKnowledge?: string;
  /** 识别历史（用于趋势分析） */
  recognitionHistory?: {
    totalAttempts: number;
    failedAttempts: number;
    scores: number[];
    algorithms: string[];
  };
  /** 识别详情 */
  recognitionDetail?: RecognitionDetail;
  /** 动作详情 */
  actionDetail?: ActionDetail;
}

/**
 * Pattern 匹配结果
 */
interface PatternMatchResult {
  matched: boolean;
  patternId?: string;
  cause?: string;
  suggestions?: string[];
  category?: FailureCategory;
  severity?: FailureSeverity;
  knowledge?: string;
}

/**
 * Pattern 匹配函数类型
 */
type MatchFn = (detail: RecognitionDetail | ActionDetail | Record<string, unknown>, node: NodeInfo) => PatternMatchResult;

/**
 * 识别模式 Pattern 列表
 * 用于匹配各种识别失败场景
 */
const recognitionPatterns: { id: string; match: MatchFn }[] = [
  {
    id: 'template_not_found',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'TemplateMatch') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      const allResults = detailObj?.all_results_ as unknown[] | undefined;
      if (!allResults || allResults.length === 0) {
        return {
          matched: true,
          patternId: 'template_not_found',
          category: 'recognition',
          severity: 'critical',
          cause: '屏幕上未找到与模板相似的区域',
          suggestions: [
            '更新模板图片为当前最新版本',
            '检查目标界面是否与模板一致',
            '适当降低匹配阈值（建议 0.7~0.8）',
            '确认 ROI 区域是否正确覆盖目标',
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
      const filtered = detailObj?.filtered_results_ as unknown[] | undefined;
      const allResults = detailObj?.all_results_ as unknown[] | undefined;
      if (Array.isArray(filtered) && filtered.length === 0 && Array.isArray(allResults) && allResults.length > 0) {
        return {
          matched: true,
          patternId: 'template_all_filtered',
          category: 'recognition',
          severity: 'warning',
          cause: `找到 ${allResults.length} 个匹配结果，但全部被过滤（可能阈值设置过高）`,
          suggestions: [
            '降低匹配阈值参数',
            '检查 green_mask 蒙版设置',
            '确认 filter 规则是否过于严格',
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
          cause: `指定颜色范围在屏幕上未找到匹配`,
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
      if (!['And', 'Or', 'DirectHit'].includes(d.algorithm)) return { matched: false };
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
        return {
          matched: true,
          patternId: 'and_or',
          category: 'recognition',
          severity: 'critical',
          cause: `${d.algorithm} 组合识别失败: ${failedSubReasons.join('; ')}`,
          suggestions: ['检查子识别配置是否正确', '调整各子识别参数'],
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
    id: 'neural_network',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (!['NeuralNetworkClassify', 'NeuralNetworkDetect'].includes(d.algorithm)) return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
          patternId: 'neural_network',
          category: 'recognition',
          severity: 'critical',
          cause: `神经网络识别执行出错: ${detailObj.error}`,
          suggestions: ['检查神经网络模型是否正确', '确认模型文件是否存在'],
          knowledge: d.algorithm,
        };
      }
      if (!detailObj?.result && !detailObj?.output) {
        return {
          matched: true,
          patternId: 'neural_network',
          category: 'recognition',
          severity: 'critical',
          cause: `${d.algorithm} 未返回有效结果`,
          suggestions: ['检查神经网络模型是否正确', '确认输入图像是否符合模型要求'],
          knowledge: d.algorithm,
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
            category: 'action',
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
];

/**
 * 动作模式 Pattern 列表
 * 用于匹配各种动作执行失败场景
 */
const actionPatterns: { id: string; match: MatchFn }[] = [
  {
    id: 'click_failed',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (d.action !== 'Click') return { matched: false };
      if (d.success === false) {
        const detailObj = d.detail as Record<string, unknown> | undefined;
        const message = detailObj?.message as string | undefined;
        if (message?.includes('out of range') || message?.includes('超出范围')) {
          return {
            matched: true,
            patternId: 'click_failed',
            category: 'action',
            severity: 'critical',
            cause: `点击坐标超出屏幕范围: ${message}`,
            suggestions: ['检查点击坐标是否在屏幕范围内', '确认 target 参数的坐标是否正确'],
            knowledge: 'Click',
          };
        }
        return {
          matched: true,
          patternId: 'click_failed',
          category: 'action',
          severity: 'warning',
          cause: '点击动作执行但未获得响应',
          suggestions: ['检查设备连接状态', '确认目标位置是否可点击', '尝试增加点击前后延迟'],
          knowledge: 'Click',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'swipe_failed',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (d.action !== 'Swipe' && d.action !== 'MultiSwipe') return { matched: false };
      if (d.success === false) {
        const detailObj = d.detail as Record<string, unknown> | undefined;
        return {
          matched: true,
          patternId: 'swipe_failed',
          category: 'action',
          severity: 'warning',
          cause: `滑动执行失败: ${detailObj?.message || '未知原因'}`,
          suggestions: ['检查滑动坐标是否在屏幕范围内', '增加滑动持续时间', '确认滑动方向正确'],
          knowledge: 'Swipe',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'input_failed',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (d.action !== 'InputText') return { matched: false };
      if (d.success === false) {
        const detailObj = d.detail as Record<string, unknown> | undefined;
        return {
          matched: true,
          patternId: 'input_failed',
          category: 'action',
          severity: 'critical',
          cause: `文本输入失败: ${detailObj?.message || '未知原因'}`,
          suggestions: ['检查输入框是否获得焦点', '确认文本编码是否正确', '尝试分多次输入长文本'],
          knowledge: 'InputText',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'start_app_failed',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (d.action !== 'StartApp') return { matched: false };
      if (d.success === false) {
        const detailObj = d.detail as Record<string, unknown> | undefined;
        return {
          matched: true,
          patternId: 'start_app_failed',
          category: 'action',
          severity: 'critical',
          cause: `启动应用失败: ${detailObj?.message || '未知原因'}`,
          suggestions: ['确认应用包名是否正确', '检查应用是否已安装', '增加启动等待时间'],
          knowledge: 'StartApp',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'custom_action_error',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (d.action !== 'Custom') return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
          patternId: 'custom_action_error',
          category: 'action',
          severity: 'critical',
          cause: `自定义动作执行出错: ${detailObj.error}`,
          suggestions: ['检查 Go Service 是否正常运行', '查看自定义动作日志', '确认动作参数格式正确'],
          knowledge: 'Custom',
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'touch_action',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (!['LongPress', 'TouchDown', 'TouchMove', 'TouchUp', 'Scroll'].includes(d.action)) return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
          patternId: 'touch_action',
          category: 'action',
          severity: 'critical',
          cause: `${d.action} 执行出错: ${detailObj.error}`,
          suggestions: ['检查触控参数是否正确', '确认目标区域是否可点击'],
          knowledge: d.action,
        };
      }
      if (d.success === false) {
        return {
          matched: true,
          patternId: 'touch_action',
          category: 'action',
          severity: 'warning',
          cause: `${d.action} 执行失败`,
          suggestions: ['检查触控操作是否成功执行', '确认目标区域是否存在'],
          knowledge: d.action,
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'key_action',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (!['ClickKey', 'LongPressKey', 'KeyDown', 'KeyUp'].includes(d.action)) return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
          patternId: 'key_action',
          category: 'action',
          severity: 'critical',
          cause: `${d.action} 执行出错: ${detailObj.error}`,
          suggestions: ['检查按键是否有效', '确认目标窗口是否支持按键'],
          knowledge: d.action,
        };
      }
      if (d.success === false) {
        return {
          matched: true,
          patternId: 'key_action',
          category: 'action',
          severity: 'warning',
          cause: `${d.action} 执行失败`,
          suggestions: ['检查按键操作是否成功执行'],
          knowledge: d.action,
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'system_action',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (!['StopApp', 'StopTask', 'Command', 'Shell', 'Screencap'].includes(d.action)) return { matched: false };
      const detailObj = d.detail as Record<string, unknown> | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
          patternId: 'system_action',
          category: 'action',
          severity: 'critical',
          cause: `${d.action} 执行出错: ${detailObj.error}`,
          suggestions: ['检查系统操作是否正确', '确认权限是否足够'],
          knowledge: d.action,
        };
      }
      if (d.success === false) {
        return {
          matched: true,
          patternId: 'system_action',
          category: 'action',
          severity: 'warning',
          cause: `${d.action} 执行失败: ${detailObj?.message || '未知原因'}`,
          suggestions: ['检查系统操作是否正确执行', '确认目标是否存在'],
          knowledge: d.action,
        };
      }
      return { matched: false };
    },
  },
];

/**
 * 执行 Pattern 匹配
 * 统一执行引擎，遍历 patterns 列表，找到第一个匹配的 pattern
 *
 * @param detail - 识别或动作详情
 * @param node - 节点信息
 * @param patterns - Pattern 列表
 * @returns 匹配结果
 */
function matchDetail(
  detail: RecognitionDetail | ActionDetail | Record<string, unknown>,
  node: NodeInfo,
  patterns: { id: string; match: MatchFn }[]
): PatternMatchResult {
  for (const pattern of patterns) {
    try {
      const result = pattern.match(detail, node);
      if (result.matched) {
        return result;
      }
    } catch {
      continue;
    }
  }
  return { matched: false };
}

/**
 * 诊断任务失败
 * 遍历所有任务和节点，根据配置的 pattern 进行匹配诊断
 *
 * @param tasks - 任务列表
 * @returns 诊断结果列表
 */
export function diagnoseFailures(tasks: TaskInfo[]): DiagnosisResult[] {
  const results: DiagnosisResult[] = [];

  for (const task of tasks) {
    if (!task.nodes) continue;

    for (const node of task.nodes) {
      if (node.status !== 'failed') continue;

      if (node.reco_details) {
        const result = matchDetail(node.reco_details, node, recognitionPatterns);
        if (result.matched && result.patternId) {
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
            recognitionDetail: node.reco_details,
          });
        }
      }

      if (node.action_details) {
        const result = matchDetail(node.action_details, node, actionPatterns);
        if (result.matched && result.patternId) {
          results.push({
            nodeId: node.node_id,
            nodeName: node.name,
            taskName: task.entry,
            category: result.category ?? 'action',
            severity: result.severity ?? 'warning',
            patternId: result.patternId,
            cause: result.cause ?? '未知原因',
            suggestions: result.suggestions ?? [],
            relatedKnowledge: result.knowledge,
            actionDetail: node.action_details,
          });
        }
      }
    }
  }

  return results;
}

/**
 * 汇总诊断结果
 * 按严重程度和类别分组统计
 *
 * @param diagnoses - 诊断结果列表
 * @returns 汇总统计
 */
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
