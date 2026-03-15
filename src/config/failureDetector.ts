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
  paramRecommendation: {
    animationGap: 200,
    scoreLowThreshold: 0.7,
    scoreHighThreshold: 0.95,
    coordOffset: 20,
    scoreFluctuation: 0.2,
    defaultTimeout: 30000,
    highlightDuration: 1500,
  },
  messages: {
    template: {
      notFound: {
        cause: '屏幕上未找到与模板相似的区域',
        suggestions: [
          '更新模板图片为当前最新版本',
          '检查目标界面是否已发生变化',
          '确认 ROI 区域是否正确覆盖目标',
          '如需快速恢复功能，可适当降低识别阈值作为临时方案',
        ],
      },
      lowScore: {
        cause: '模板匹配得分较低 ({score})，可能存在差异',
        suggestions: [
          '模板图片可能与当前界面有差异',
          '考虑更新模板为最新版本',
          '检查目标区域是否有遮挡或变化',
        ],
      },
      allFiltered: {
        cause: '找到 {count} 个匹配结果（最高分 {maxScore}），但全部被过滤',
        suggestions: [
          '检查目标界面是否与模板图片一致',
          '更新模板图片为最新版本',
          '检查目标区域是否有遮挡或变化',
          '如需快速恢复功能，可适当降低识别阈值作为临时方案',
        ],
      },
    },
    ocr: {
      notMatch: {
        cause: '期望文字 "{expected}"，实际识别 "{actual}"，匹配失败',
        suggestions: [
          '检查 expected 参数是否与界面文字完全匹配',
          '注意大小写、空格、标点符号',
          '尝试使用正则表达式匹配',
          '检查 OCR 识别区域是否正确',
        ],
      },
      emptyResult: {
        cause: 'OCR 识别结果为空，屏幕上未识别到文字',
        suggestions: [
          '检查目标区域是否包含文字',
          '确认 ROI 区域是否正确',
          '尝试调整 OCR 参数',
        ],
      },
      lowConfidence: {
        cause: 'OCR 识别置信度为 {confidence}%，结果为 "{result}"',
        suggestions: [
          '文字可能模糊或不清晰',
          '检查截图质量',
          '尝试调整 OCR 参数',
        ],
      },
      allFiltered: {
        cause: 'OCR 识别出文字但全部被过滤',
        suggestions: [
          '检查 expected 参数是否正确',
          '确认目标文字是否在屏幕上',
          '检查识别区域 ROI 是否包含目标文字',
        ],
      },
    },
    color: {
      notMatch: {
        cause: '指定颜色范围在屏幕上未找到匹配',
        suggestions: [
          '检查颜色范围 lower/upper 是否正确',
          '考虑光线变化导致颜色偏差',
          '增加颜色容差范围',
        ],
      },
    },
    feature: {
      noResult: {
        cause: '特征匹配未返回结果',
        suggestions: [
          '检查特征匹配图片是否正确',
          '确认 ROI 区域是否正确',
        ],
      },
      notMatched: {
        cause: '特征匹配未找到匹配结果',
        suggestions: [
          '检查特征匹配图片是否正确',
          '调整特征匹配阈值',
        ],
      },
      lowScore: {
        cause: '特征匹配得分较低 ({score})',
        suggestions: [
          '更换更清晰的特征匹配图片',
          '调整特征匹配阈值',
        ],
      },
    },
    neural: {
      noResult: {
        cause: '神经网络分类未返回有效结果',
        suggestions: [
          '检查神经网络模型是否正确',
          '确认输入图像是否有效',
        ],
      },
      detectionFailed: {
        cause: '神经网络检测未发现任何目标',
        suggestions: [
          '检查检测目标是否存在',
          '确认 ROI 区域是否正确',
        ],
      },
    },
    common: {
      timeout: {
        cause: '识别操作超时',
        suggestions: [
          '检查网络连接是否稳定',
          '增加超时时间',
        ],
      },
      directHitNoResult: {
        cause: 'DirectHit 识别未返回结果',
        suggestions: [
          '检查识别配置是否正确',
          '确认目标状态是否正确',
        ],
      },
      allFiltered: {
        cause: '所有识别结果都被过滤',
        suggestions: [
          '检查识别参数是否正确',
          '确认目标是否在屏幕上',
          '检查识别区域 ROI 是否正确',
        ],
      },
    },
    retry: {
      afterSuccess: {
        cause: '识别重试后成功，建议优化识别参数减少重试',
        suggestions: [
          '检查识别配置是否稳定',
          '考虑优化识别参数提高首次成功率',
        ],
      },
      continuous: {
        cause: '该节点识别连续 {count} 次全部失败',
        suggestions: [
          '检查识别配置是否正确',
          '考虑优化识别参数',
        ],
      },
    },
    unknown: {
      cause: '节点执行失败，但未能识别出具体原因',
      suggestions: [
        '检查节点配置是否正确',
        '查看详细日志排查问题',
      ],
    },
  },
} as const;

export type FailureCategory = 'recognition' | 'action' | 'unknown';
export type FailureSeverity = 'critical' | 'warning' | 'info';

export interface DiagnosisResult {
  nodeId: number;
  nodeName: string;
  taskName: string;
  timestamp?: string;
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
