/**
 * @fileoverview 第五层：因果推理引擎
 *
 * 构建因果图，进行反向推理找到根本原因。
 * 不仅分析"是什么"，更分析"为什么"。
 *
 * @module utils/diagnosis/layer5_causal
 */

import type {
  UnifiedContext,
  Layer3Result,
  Layer5Result,
  RootCause,
  CauseProbability,
} from '../../types/diagnosis';
import { getRecognitionKnowledge, getThresholdKnowledge } from './knowledge';

/**
 * 因果关系边
 */
interface CausalEdge {
  from: string;
  to: string;
  weight: number;
  reason: string;
}

/**
 * 因果图
 */
class CausalGraph {
  private nodes: Set<string> = new Set();
  private edges: CausalEdge[] = [];

  addNode(node: string): void {
    this.nodes.add(node);
  }

  addEdge(from: string, to: string, weight: number, reason: string): void {
    this.addNode(from);
    this.addNode(to);
    this.edges.push({ from, to, weight, reason });
  }

  getOutgoingEdges(node: string): CausalEdge[] {
    return this.edges.filter(e => e.from === node);
  }

  getIncomingEdges(node: string): CausalEdge[] {
    return this.edges.filter(e => e.to === node);
  }

  getAllNodes(): string[] {
    return Array.from(this.nodes);
  }
}

/**
 * 因果推理引擎
 */
export class CausalInferenceEngine {
  /**
   * 执行因果推理
   */
  infer(context: UnifiedContext, layer3Result: Layer3Result): Layer5Result {
    const graph = this.buildCausalGraph(context);
    const rootCauses = this.findRootCauses(context, layer3Result, graph);

    return {
      rootCauses,
    };
  }

  /**
   * 构建因果图
   */
  private buildCausalGraph(context: UnifiedContext): CausalGraph {
    const graph = new CausalGraph();
    const reco = context.recognition;
    const action = context.action;
    const pipeline = context.pipeline;

    graph.addEdge('症状', '识别失败', 1.0, '节点状态为失败');
    
    if (reco && !reco.success) {
      if (reco.allResults.length === 0) {
        graph.addEdge('识别失败', '目标不在屏幕', 0.8, '完全无匹配');
        graph.addEdge('识别失败', 'ROI配置错误', 0.6, '可能ROI不正确');
      } else {
        graph.addEdge('识别失败', '阈值过高', 0.7, '结果被过滤');
        graph.addEdge('识别失败', '模板过时', 0.5, '可能模板已更新');
      }

      if (reco.threshold !== undefined) {
        const thresholdKnowledge = getThresholdKnowledge(reco.algorithm || 'TemplateMatch');
        if (thresholdKnowledge) {
          const [, max] = thresholdKnowledge.recommendedRange;
          if (reco.threshold > max) {
            graph.addEdge('阈值过高', '阈值配置不当', 1.0, '超过推荐范围');
          }
        }
      }
    }

    if (action && !action.success) {
      graph.addEdge('症状', '动作失败', 1.0, '动作执行失败');
      
      if (action.error) {
        if (/rect|target|invalid/i.test(action.error)) {
          graph.addEdge('动作失败', '目标矩形无效', 1.0, '错误信息包含rect');
        }
        if (/offset/i.test(action.error)) {
          graph.addEdge('动作失败', 'target_offset错误', 1.0, '错误信息包含offset');
        }
      }

      if (action.target_offset) {
        const [ox, oy] = action.target_offset;
        if (Math.abs(ox) > 100 || Math.abs(oy) > 100) {
          graph.addEdge('target_offset错误', '偏移值过大', 1.0, '偏移超过100像素');
        }
      }
    }

    if (pipeline) {
      if (pipeline.recognition) {
        graph.addEdge('配置', '识别配置', 1.0, '存在Pipeline配置');
        
        if (pipeline.recognition.threshold !== undefined) {
          const algorithm = pipeline.recognition.algorithm || 'TemplateMatch';
          const thresholdKnowledge = getThresholdKnowledge(algorithm);
          if (thresholdKnowledge) {
            const [min, max] = thresholdKnowledge.recommendedRange;
            if (pipeline.recognition.threshold > max) {
              graph.addEdge('识别配置', '阈值过高(配置)', 0.9, '配置值超过推荐范围');
            } else if (pipeline.recognition.threshold < min) {
              graph.addEdge('识别配置', '阈值过低(配置)', 0.7, '配置值低于推荐范围');
            }
          }
        }

        if (pipeline.recognition.roi || pipeline.roi) {
          graph.addEdge('识别配置', 'ROI配置', 0.8, '存在ROI配置');
        }
      }

      if (pipeline.action) {
        graph.addEdge('配置', '动作配置', 1.0, '存在动作配置');
      }
    }

    const recognitionKnowledge = getRecognitionKnowledge(reco?.algorithm || pipeline?.recognition?.algorithm || 'TemplateMatch');
    if (recognitionKnowledge && recognitionKnowledge.commonIssues.length > 0) {
      graph.addEdge('算法', '算法问题', 0.6, '算法已知问题');
      
      for (const issue of recognitionKnowledge.commonIssues) {
        graph.addEdge('算法问题', issue.cause, 0.5, issue.issue);
      }
    }

    return graph;
  }

  /**
   * 找到根本原因
   * 使用反向推理，从症状出发找到最根本的原因
   */
  private findRootCauses(
    context: UnifiedContext,
    layer3Result: Layer3Result,
    graph: CausalGraph
  ): RootCause[] {
    const rootCauses: RootCause[] = [];
    const symptomNode = '症状';

    const visited = new Set<string>();
    const queue: Array<{ node: string; weight: number; path: string[] }> = [];

    for (const edge of graph.getOutgoingEdges(symptomNode)) {
      queue.push({ node: edge.to, weight: edge.weight, path: [symptomNode, edge.to] });
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (visited.has(current.node)) continue;
      visited.add(current.node);

      const incoming = graph.getIncomingEdges(current.node);
      if (incoming.length === 0 || current.node === '症状') {
        const causeProbability = layer3Result.causeProbabilities.find(
          (c: CauseProbability) => c.cause.toLowerCase().includes(current.node.toLowerCase()) ||
               current.node.toLowerCase().includes(c.cause.toLowerCase())
        );

        let probability = causeProbability?.probability ?? (current.weight * 0.5);

        if (context.hasPipeline) {
          probability += 0.1;
        }

        const reasoning = current.path.join(' -> ');

        rootCauses.push({
          id: this.generateId(),
          name: this.translateToChinese(current.node),
          probability: Math.min(probability, 1),
          reasoning,
        });
      }

      for (const edge of graph.getOutgoingEdges(current.node)) {
        if (!visited.has(edge.to)) {
          queue.push({
            node: edge.to,
            weight: current.weight * edge.weight,
            path: [...current.path, edge.to],
          });
        }
      }
    }

    const aggregatedRoots = this.aggregateRootCauses(rootCauses);

    return aggregatedRoots.sort((a, b) => b.probability - a.probability).slice(0, 5);
  }

  /**
   * 聚合根本原因
   */
  private aggregateRootCauses(causes: RootCause[]): RootCause[] {
    const causeMap = new Map<string, RootCause>();

    for (const cause of causes) {
      const existing = causeMap.get(cause.name);
      if (existing) {
        existing.probability = Math.max(existing.probability, cause.probability);
      } else {
        causeMap.set(cause.name, { ...cause });
      }
    }

    return Array.from(causeMap.values());
  }

  /**
   * 翻译为中文
   */
  private translateToChinese(node: string): string {
    const translations: Record<string, string> = {
      '目标不在屏幕': '目标不在屏幕上',
      'ROI配置错误': 'ROI 配置不正确',
      'ROI配置': 'ROI 配置不正确',
      '阈值过高': '阈值设置过高',
      '阈值过高(配置)': '阈值设置过高',
      '阈值过低(配置)': '阈值设置过低',
      '阈值配置不当': '阈值配置不当',
      '模板过时': '模板图片过时',
      '目标矩形无效': '目标矩形无效',
      'target_offset错误': 'target_offset 参数错误',
      '偏移值过大': '偏移值过大',
      '算法问题': '算法选择或配置问题',
    };

    return translations[node] || node;
  }

  /**
   * 生成唯一ID
   */
  private idCounter = 0;
  private generateId(): string {
    this.idCounter++;
    return `rc_${Date.now()}_${this.idCounter}`;
  }
}

/**
 * 便捷函数：执行因果推理
 */
export function causalInfer(
  context: UnifiedContext,
  layer3Result: Layer3Result
): Layer5Result {
  const engine = new CausalInferenceEngine();
  return engine.infer(context, layer3Result);
}
