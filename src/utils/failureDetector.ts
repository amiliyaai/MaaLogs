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

import type { NodeInfo, TaskInfo, RecognitionDetail, ActionDetail, RecognitionAttempt } from '@/types/logTypes';

export type FailureCategory =
  | 'recognition'
  | 'action'
  | 'unknown';

export type FailureSeverity = 'critical' | 'warning' | 'info';

export interface DiagnosisResult {
  nodeId: number;
  nodeName: string;
  taskName: string;
  category: FailureCategory;
  severity: FailureSeverity;
  patternName: string;
  cause: string;
  suggestions: string[];
  recognitionHistory?: {
    totalAttempts: number;
    failedAttempts: number;
    scores: number[];
    algorithms: string[];
  };
  relatedKnowledge?: string;
  recognitionDetail?: RecognitionDetail;
  actionDetail?: ActionDetail;
}

interface PatternMatchResult {
  matched: boolean;
  cause?: string;
  suggestions?: string[];
  category?: FailureCategory;
  severity?: FailureSeverity;
  knowledge?: string;
}

type MatchFn = (detail: RecognitionDetail | ActionDetail | Record<string, unknown>, node: NodeInfo) => PatternMatchResult;

const recognitionPatterns: { id: string; match: MatchFn }[] = [
  {
    id: 'template_not_found',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'TemplateMatch') return { matched: false };
      const allResults = (d.detail as Record<string, unknown>)?.all_results_ as unknown[] | undefined;
      if (!allResults || allResults.length === 0) {
        return {
          matched: true,
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
      const best = (d.detail as Record<string, unknown>)?.best as { score?: number } | undefined;
      if (best && best.score !== undefined && best.score >= 0.5 && best.score < 0.8) {
        return {
          matched: true,
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
    id: 'template_filtered',
    match: (detail) => {
      const d = detail as RecognitionDetail;
      if (d.algorithm !== 'TemplateMatch') return { matched: false };
      const detailObj = d.detail as Record<string, unknown>;
      const filtered = detailObj?.filtered_results_;
      const allResults = detailObj?.all_results_ as unknown[] | undefined;
      if (Array.isArray(filtered) && filtered.length === 0 && Array.isArray(allResults) && allResults.length > 0) {
        return {
          matched: true,
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
      const detailObj = d.detail as Record<string, unknown>;
      if (detailObj?.result === null && typeof detailObj?.expected === 'string') {
        return {
          matched: true,
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
      const detailObj = d.detail as Record<string, unknown>;
      if ((detailObj?.result === null || detailObj?.result === '') && !detailObj?.expected) {
        return {
          matched: true,
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
      const detailObj = d.detail as Record<string, unknown>;
      const prob = detailObj?.with_prob as number | undefined;
      if (prob !== undefined && prob < 0.7) {
        return {
          matched: true,
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
      const detailObj = d.detail as Record<string, unknown>;
      if (detailObj?.result === null) {
        return {
          matched: true,
          category: 'recognition',
          severity: 'critical',
          cause: `指定颜色范围 [${JSON.stringify(detailObj?.lower)}, ${JSON.stringify(detailObj?.upper)}] 在屏幕上未找到匹配`,
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
      const detailObj = d.detail as Record<string, unknown>;
      if (detailObj?.error) {
        return {
          matched: true,
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
      const detailObj = d.detail as { best?: { score?: number } | null; filtered?: unknown[]; all?: unknown[] } | undefined;
      if (!detailObj) {
        return {
          matched: true,
          category: 'recognition',
          severity: 'critical',
          cause: '特征匹配未返回结果',
          suggestions: ['检查特征匹配图片是否正确', '确认 ROI 区域是否正确'],
          knowledge: 'FeatureMatch',
        };
      }
      if (!detailObj.best) {
        return {
          matched: true,
          category: 'recognition',
          severity: 'critical',
          cause: '特征匹配未找到匹配结果',
          suggestions: ['检查特征匹配图片是否正确', '调整特征匹配阈值'],
          knowledge: 'FeatureMatch',
        };
      }
      const score = detailObj.best.score ?? 0;
      if (score < 0.8) {
        return {
          matched: true,
          category: 'recognition',
          severity: 'warning',
          cause: `特征匹配分数过低 (${score.toFixed(3)})，低于推荐的 0.8 阈值`,
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
      const detailObj = d.detail as { result?: unknown; output?: unknown; error?: string } | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
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
      const detailStr = JSON.stringify(detail).toLowerCase();
      if (detailStr.includes('timeout') || detailStr.includes('超时')) {
        return {
          matched: true,
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
      return { matched: false };
    },
  },
];

const actionPatterns: { id: string; match: MatchFn }[] = [
  {
    id: 'click_failed',
    match: (detail) => {
      const d = detail as ActionDetail;
      if (d.action !== 'Click') return { matched: false };
      if (d.success === false) {
        const message = (d.detail as Record<string, unknown>)?.message as string | undefined;
        if (message?.includes('out of range') || message?.includes('超出范围')) {
          return {
            matched: true,
            category: 'action',
            severity: 'critical',
            cause: `点击坐标超出屏幕范围: ${message}`,
            suggestions: ['检查点击坐标是否在屏幕范围内', '确认 target 参数的坐标是否正确'],
            knowledge: 'Click',
          };
        }
        return {
          matched: true,
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
        return {
          matched: true,
          category: 'action',
          severity: 'warning',
          cause: `滑动执行失败: ${(d.detail as Record<string, unknown>)?.message || '未知原因'}`,
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
        return {
          matched: true,
          category: 'action',
          severity: 'critical',
          cause: `文本输入失败: ${(d.detail as Record<string, unknown>)?.message || '未知原因'}`,
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
        return {
          matched: true,
          category: 'action',
          severity: 'critical',
          cause: `启动应用失败: ${(d.detail as Record<string, unknown>)?.message || '未知原因'}`,
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
      const detailObj = d.detail as Record<string, unknown>;
      if (detailObj?.error) {
        return {
          matched: true,
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
      const detailObj = d.detail as { error?: string } | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
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
      const detailObj = d.detail as { error?: string } | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
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
      const detailObj = d.detail as { error?: string; message?: string } | undefined;
      if (detailObj?.error) {
        return {
          matched: true,
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
          category: 'action',
          severity: 'warning',
          cause: `${d.action} 执行失败: ${detailObj?.message || '未知原因'}`,
          suggestions: ['检查操作是否成功执行', '查看详细错误信息'],
          knowledge: d.action,
        };
      }
      return { matched: false };
    },
  },
  {
    id: 'action_timeout',
    match: (detail) => {
      const detailStr = JSON.stringify(detail).toLowerCase();
      if (detailStr.includes('timeout') || detailStr.includes('超时')) {
        return {
          matched: true,
          category: 'action',
          severity: 'warning',
          cause: '动作执行超时',
          suggestions: ['增加动作超时时间', '检查设备响应是否缓慢'],
          knowledge: 'action_timeout',
        };
      }
      return { matched: false };
    },
  },
];

const connectionPatterns: { id: string; match: MatchFn }[] = [
  {
    id: 'adb_disconnected',
    match: (detail) => {
      const detailStr = JSON.stringify(detail).toLowerCase();
      if (detailStr.includes('adb') || detailStr.includes('connection') || detailStr.includes('disconnected')) {
        return {
          matched: true,
          category: 'action',
          severity: 'critical',
          cause: '检测到 ADB 连接问题，设备可能已断开',
          suggestions: ['检查 adb devices 连接状态', '确认 USB 调试已授权', '尝试重新连接设备'],
          knowledge: 'connection',
        };
      }
      return { matched: false };
    },
  },
];

function collectRecognitionHistory(node: NodeInfo): DiagnosisResult['recognitionHistory'] | undefined {
  const attempts = node.recognition_attempts || [];
  const nestedAttempts: RecognitionAttempt[] = [];
  if (node.recognition_attempts) {
    for (const attempt of node.recognition_attempts) {
      if (attempt.nested_nodes) {
        nestedAttempts.push(...attempt.nested_nodes);
      }
    }
  }
  const allAttempts = [...attempts, ...nestedAttempts];
  const failedAttemptsList = allAttempts.filter(a => a.status === 'failed');
  
  if (failedAttemptsList.length === 0) {
    return undefined;
  }

  const scores: number[] = [];
  const algorithms: Set<string> = new Set();

  for (const attempt of failedAttemptsList) {
    const best = attempt.reco_details?.detail as { score?: number; result?: { score?: number } } | undefined;
    if (best?.score !== undefined) {
      scores.push(best.score);
    } else if (best?.result?.score !== undefined) {
      scores.push(best.result.score);
    }
    if (attempt.reco_details?.algorithm) {
      algorithms.add(attempt.reco_details.algorithm);
    }
  }

  return {
    totalAttempts: failedAttemptsList.length,
    failedAttempts: failedAttemptsList.length,
    scores,
    algorithms: Array.from(algorithms),
  };
}

function diagnoseNode(node: NodeInfo, task?: TaskInfo): DiagnosisResult | null {
  const allRecoDetails: RecognitionDetail[] = [];
  // 收集所有可用的识别详情（包括历史尝试）
  
  if (node.reco_details) {
    allRecoDetails.push(node.reco_details);
  }
  if (node.recognition_attempts) {
    for (const attempt of node.recognition_attempts) {
      if (attempt.reco_details) {
        allRecoDetails.push(attempt.reco_details);
      }
    }
  }
  
  // 收集所有可用的动作详情
  const allActionDetails: ActionDetail[] = [];
  if (node.action_details) {
    allActionDetails.push(node.action_details);
  }
  
  // 检查识别失败 - 遍历所有识别详情
  for (const recoDetail of allRecoDetails) {
    for (const pattern of recognitionPatterns) {
      const result = pattern.match(recoDetail, node);
      if (result.matched) {
        return {
          nodeId: node.node_id,
          nodeName: node.name,
          taskName: task?.entry || 'Unknown',
          category: result.category || 'unknown',
          severity: result.severity || 'info',
          patternName: pattern.id,
          cause: result.cause || '未知原因',
          suggestions: result.suggestions || ['查看原始日志获取更多信息'],
          relatedKnowledge: result.knowledge,
          recognitionHistory: collectRecognitionHistory(node),
          recognitionDetail: node.reco_details,
          actionDetail: node.action_details,
        };
      }
    }
  }
  
  // 检查动作失败
  for (const actionDetail of allActionDetails) {
    for (const pattern of actionPatterns) {
      const result = pattern.match(actionDetail, node);
      if (result.matched) {
        return {
          nodeId: node.node_id,
          nodeName: node.name,
          taskName: task?.entry || 'Unknown',
          category: result.category || 'unknown',
          severity: result.severity || 'info',
          patternName: pattern.id,
          cause: result.cause || '未知原因',
          suggestions: result.suggestions || ['查看原始日志获取更多信息'],
          relatedKnowledge: result.knowledge,
          recognitionHistory: collectRecognitionHistory(node),
          recognitionDetail: node.reco_details,
          actionDetail: node.action_details,
        };
      }
    }
  }
  
  // 检查连接问题
  for (const recoDetail of allRecoDetails) {
    for (const pattern of connectionPatterns) {
      const result = pattern.match(recoDetail, node);
      if (result.matched) {
        return {
          nodeId: node.node_id,
          nodeName: node.name,
          taskName: task?.entry || 'Unknown',
          category: result.category || 'unknown',
          severity: result.severity || 'info',
          patternName: pattern.id,
          cause: result.cause || '未知原因',
          suggestions: result.suggestions || ['查看原始日志获取更多信息'],
          relatedKnowledge: result.knowledge,
          recognitionDetail: node.reco_details,
          actionDetail: node.action_details,
        };
      }
    }
  }
  
  // 节点标记为失败但没有匹配到任何模式
  if (node.status === 'failed' || allRecoDetails.length === 0) {
    // 如果有识别尝试记录，检查是否有失败状态
    if (node.recognition_attempts && node.recognition_attempts.length > 0) {
      const hasFailed = node.recognition_attempts.some(a => a.status === 'failed');
      if (hasFailed) {
        return {
          nodeId: node.node_id,
          nodeName: node.name,
          taskName: task?.entry || 'Unknown',
          category: 'unknown',
          severity: 'info',
          patternName: '未知错误',
          cause: '识别记录显示失败，但无法确定具体原因',
          suggestions: ['查看原始日志获取更多信息', '使用 AI 分析获取详细诊断'],
          recognitionHistory: collectRecognitionHistory(node),
          recognitionDetail: node.reco_details,
          actionDetail: node.action_details,
        };
      }
    }
    
    if (node.status === 'failed') {
        return {
          nodeId: node.node_id,
          nodeName: node.name,
          taskName: task?.entry || 'Unknown',
          category: 'unknown',
          severity: 'info',
          patternName: 'unknown_failure',
          cause: '无法确定失败原因',
          suggestions: ['查看原始日志获取更多信息', '使用 AI 分析获取详细诊断'],
          recognitionHistory: collectRecognitionHistory(node),
          recognitionDetail: node.reco_details,
          actionDetail: node.action_details,
        };
      }
  }
  
  return null;
}

export function diagnoseFailures(tasks: TaskInfo[]): DiagnosisResult[] {
  const nodeResults = new Map<string, DiagnosisResult>();
  
  for (const task of tasks) {
    const taskKey = task.entry || 'unknown';
    for (const node of task.nodes) {
      if (node.status === 'failed') {
        const result = diagnoseNode(node, task);
        if (result) {
          const uniqueKey = `${taskKey}_${result.nodeId}`;
          const existing = nodeResults.get(uniqueKey);
          if (!existing || getSeverityPriority(result.severity) > getSeverityPriority(existing.severity)) {
            nodeResults.set(uniqueKey, result);
          }
        }
      }
    }
  }
  
  return Array.from(nodeResults.values());
}

function getSeverityPriority(severity: string): number {
  const priority: Record<string, number> = { critical: 3, warning: 2, info: 1 };
  return priority[severity] || 0;
}

export function summarizeDiagnoses(diagnoses: DiagnosisResult[]) {
  const byCategory: Record<FailureCategory, number> = {
    recognition: 0,
    action: 0,
    unknown: 0,
  };
  const bySeverity: Record<FailureSeverity, number> = { critical: 0, warning: 0, info: 0 };
  const byPattern: Record<string, number> = {};

  for (const diagnosis of diagnoses) {
    byCategory[diagnosis.category]++;
    bySeverity[diagnosis.severity]++;
    byPattern[diagnosis.patternName] = (byPattern[diagnosis.patternName] || 0) + 1;
  }

  return { byCategory, bySeverity, byPattern };
}
