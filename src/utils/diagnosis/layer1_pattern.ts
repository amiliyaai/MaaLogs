/**
 * @fileoverview 第一层：模式匹配引擎
 *
 * 快速扫描常见问题模式，无需 Pipeline 即可工作。
 * 基于预定义的诊断模式进行匹配。
 *
 * @module utils/diagnosis/layer1_pattern
 */

import type {
  UnifiedContext,
  Layer1Result,
  PatternMatchResult,
  DiagnosisCategory,
} from '../../types/diagnosis';

/**
 * 诊断模式定义
 */
interface DiagnosticPattern {
  id: DiagnosisCategory;
  name: string;
  priority: number;
  
  conditions: {
    nodeStatus?: ('success' | 'failed')[];
    nodeNameContains?: string[];
    recognitionSuccess?: boolean;
    recognitionResultsCount?: 'zero' | 'some' | 'any';
    actionSuccess?: boolean;
    actionErrorContains?: string[];
    threshold?: { operator: '>' | '<' | '>='; value: number };
    scoreGap?: { operator: '>' | '<'; value: number };
  };
  
  symptoms: string[];
  severity: number;
}

/**
 * 诊断模式列表
 */
const DIAGNOSTIC_PATTERNS: DiagnosticPattern[] = [
  {
    id: 'RECO_NO_MATCH',
    name: '识别完全无匹配',
    priority: 100,
    conditions: {
      recognitionSuccess: false,
      recognitionResultsCount: 'zero',
    },
    symptoms: ['完全无匹配', '屏幕上未找到目标'],
    severity: 4,
  },
  {
    id: 'RECO_FILTERED',
    name: '识别结果被过滤',
    priority: 90,
    conditions: {
      recognitionSuccess: false,
      recognitionResultsCount: 'some',
    },
    symptoms: ['有结果但被过滤', '分数低于阈值'],
    severity: 3,
  },
  {
    id: 'ACTION_INVALID_RECT',
    name: '动作目标矩形无效',
    priority: 95,
    conditions: {
      actionSuccess: false,
      actionErrorContains: ['target rect', 'get target', 'invalid', 'rect'],
    },
    symptoms: ['动作失败', '目标矩形无效'],
    severity: 5,
  },
  {
    id: 'ACTION_FAILED',
    name: '动作执行失败',
    priority: 80,
    conditions: {
      actionSuccess: false,
    },
    symptoms: ['动作执行失败'],
    severity: 4,
  },
  {
    id: 'THRESHOLD_ISSUE',
    name: '阈值配置问题',
    priority: 60,
    conditions: {
      threshold: { operator: '>', value: 0.9 },
    },
    symptoms: ['阈值过高', '难以匹配成功'],
    severity: 3,
  },
  {
    id: 'LOCKED_STATE_ISSUE',
    name: '锁定状态问题',
    priority: 85,
    conditions: {
      nodeNameContains: ['Locked', 'lock'],
      recognitionSuccess: false,
    },
    symptoms: ['节点名含锁定状态', '识别失败'],
    severity: 4,
  },
  {
    id: 'TARGET_OFFSET_ERROR',
    name: 'target_offset 参数错误',
    priority: 92,
    conditions: {
      actionSuccess: false,
      actionErrorContains: ['offset', 'rect'],
    },
    symptoms: ['target_offset参数错误', '导致矩形计算失败'],
    severity: 5,
  },
];

/**
 * 第一层：模式匹配引擎
 */
export class PatternMatchingEngine {
  private patterns: DiagnosticPattern[];
  
  constructor() {
    this.patterns = [...DIAGNOSTIC_PATTERNS].sort(
      (a, b) => b.priority - a.priority
    );
  }
  
  /**
   * 执行模式匹配
   */
  match(context: UnifiedContext): Layer1Result {
    const matches: PatternMatchResult[] = [];
    
    for (const pattern of this.patterns) {
      const matchResult = this.matchPattern(pattern, context);
      if (matchResult.matched) {
        matches.push({
          pattern: pattern.id,
          confidence: matchResult.confidence,
          symptoms: [...pattern.symptoms],
          matchedConditions: matchResult.conditions,
        });
      }
    }
    
    const confidence = this.calculateConfidence(matches, context.hasPipeline);
    
    return {
      matches,
      confidence,
    };
  }
  
  /**
   * 匹配单个模式
   */
  private matchPattern(
    pattern: DiagnosticPattern,
    context: UnifiedContext
  ): { matched: boolean; confidence: number; conditions: Record<string, unknown> } {
    const conditions: Record<string, unknown> = {};
    let matched = true;
    let confidence = 0;
    
    const c = pattern.conditions;
    const reco = context.recognition;
    const action = context.action;
    const node = context.node;
    
    if (c.nodeStatus && !c.nodeStatus.includes(node.status)) {
      return { matched: false, confidence: 0, conditions: {} };
    }
    if (c.nodeStatus) {
      conditions['nodeStatus'] = node.status;
    }
    
    if (c.nodeNameContains) {
      const nameMatch = c.nodeNameContains.some(
        keyword => node.name.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!nameMatch) {
        matched = false;
      }
      const matchedKeywords = c.nodeNameContains.filter(
        keyword => node.name.toLowerCase().includes(keyword.toLowerCase())
      );
      conditions['nodeNameContains'] = matchedKeywords;
      if (matchedKeywords.length > 0) {
        confidence += 0.2;
      }
    }
    
    if (reco) {
      if (c.recognitionSuccess !== undefined) {
        if (reco.success !== c.recognitionSuccess) {
          matched = false;
        }
        conditions['recognitionSuccess'] = reco.success;
        confidence += 0.2;
      }
      
      if (c.recognitionResultsCount) {
        const count = reco.allResults?.length ?? 0;
        let countMatch = false;
        
        switch (c.recognitionResultsCount) {
          case 'zero':
            countMatch = count === 0;
            break;
          case 'some':
            countMatch = count > 0;
            break;
          case 'any':
            countMatch = true;
            break;
        }
        
        if (!countMatch && c.recognitionResultsCount === 'zero') {
          matched = false;
        }
        
        conditions['resultsCount'] = count;
        if (count > 0) confidence += 0.15;
      }
      
      if (c.threshold && reco.threshold !== undefined) {
        const thresholdMatch = this.compareValue(
          reco.threshold,
          c.threshold.operator,
          c.threshold.value
        );
        if (thresholdMatch) {
          confidence += 0.2;
        } else {
          matched = false;
        }
        conditions['threshold'] = reco.threshold;
      }
      
      if (c.scoreGap && reco.score !== undefined && reco.threshold !== undefined) {
        const gap = reco.threshold - reco.score;
        const gapMatch = this.compareValue(gap, c.scoreGap.operator, c.scoreGap.value);
        conditions['scoreGap'] = gap;
        if (gapMatch) {
          confidence += 0.15;
        }
      }
    }
    
    if (action) {
      if (c.actionSuccess !== undefined) {
        if (action.success !== c.actionSuccess) {
          matched = false;
        }
        conditions['actionSuccess'] = action.success;
        confidence += 0.2;
      }
      
      if (c.actionErrorContains) {
        const errorMatch = c.actionErrorContains.some(
          keyword => action.error?.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!errorMatch) {
          matched = false;
        }
        const matchedErrors = c.actionErrorContains.filter(
          keyword => action.error?.toLowerCase().includes(keyword.toLowerCase())
        );
        conditions['actionErrorContains'] = matchedErrors;
        if (matchedErrors.length > 0) {
          confidence += 0.3;
        }
      }
    }
    
    return { matched, confidence: Math.min(confidence, 1), conditions };
  }
  
  /**
   * 比较数值
   */
  private compareValue(
    value: number,
    operator: '>' | '<' | '>=',
    target: number
  ): boolean {
    switch (operator) {
      case '>':
        return value > target;
      case '<':
        return value < target;
      case '>=':
        return value >= target;
    }
  }
  
  /**
   * 计算置信度
   */
  private calculateConfidence(
    matches: PatternMatchResult[],
    hasPipeline: boolean
  ): number {
    if (matches.length === 0) return 0;
    
    let baseConfidence = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length;
    
    if (hasPipeline) {
      baseConfidence = Math.min(baseConfidence + 0.1, 1);
    }
    
    return Math.min(baseConfidence, 1);
  }
}

/**
 * 便捷函数：执行模式匹配
 */
export function matchPatterns(context: UnifiedContext): Layer1Result {
  const engine = new PatternMatchingEngine();
  return engine.match(context);
}
