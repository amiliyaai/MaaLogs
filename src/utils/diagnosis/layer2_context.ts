/**
 * @fileoverview 第二层：上下文理解引擎
 *
 * 理解节点语义和执行流程。
 * 基于知识库分析节点意图、目标、状态和执行流程。
 *
 * @module utils/diagnosis/layer2_context
 */

import type {
  UnifiedContext,
  Layer2Result,
  NodeSemantics,
  FlowAnalysis,
} from '../../types/diagnosis';
import type { NextListItem } from '../../types/logTypes';
import { knowledgeBase } from './knowledge';

/**
 * 节点语义分析器
 */
export class ContextUnderstandingEngine {
  /**
   * 执行上下文理解
   */
  understand(context: UnifiedContext): Layer2Result {
    const semantics = this.analyzeSemantics(context);
    const flowAnalysis = this.analyzeFlow(context);
    const scene = this.detectScene(context);

    return {
      semantics,
      flowAnalysis,
      scene,
    };
  }

  /**
   * 分析节点语义
   * 理解节点的意图、目标、状态
   */
  private analyzeSemantics(context: UnifiedContext): NodeSemantics {
    const nodeName = context.node.name;
    const nodeNameLower = nodeName.toLowerCase();

    const keywords = knowledgeBase.semantics.nodeKeywords;
    
    let intent: string | undefined;
    let target: string | undefined;
    let state: string | undefined;
    let action: string | undefined;

    for (const [intentKey, intentData] of Object.entries(keywords)) {
      if (intentKey === '_') continue;
      
      const intentKeywords = intentData.keywords as string[];
      if (intentKeywords.some(kw => nodeNameLower.includes(kw.toLowerCase()))) {
        intent = intentData.intent;
        target = intentData.target;
        state = intentData.state;
        action = intentData.action;
        break;
      }
    }

    if (!intent) {
      intent = this.inferIntent(context);
    }

    const confidence = intent ? 0.7 : 0.3;

    return {
      intent,
      target,
      state,
      action,
      confidence,
    };
  }

  /**
   * 推断意图
   */
  private inferIntent(context: UnifiedContext): string | undefined {
    const node = context.node;
    const reco = context.recognition;
    const action = context.action;

    if (node.status === 'failed') {
      if (reco && !reco.success) {
        return 'recognition_failed';
      }
      if (action && !action.success) {
        return 'action_failed';
      }
    }

    if (node.next_list.length > 0) {
      return 'navigation';
    }

    if (action?.type === 'Click') {
      return 'click_interaction';
    }

    if (action?.type === 'Swipe') {
      return 'swipe_interaction';
    }

    return 'unknown';
  }

  /**
   * 分析执行流程
   * 理解前序节点、当前节点、后续节点的关系
   */
  private analyzeFlow(context: UnifiedContext): FlowAnalysis {
    const node = context.node;
    const nextNodes = context.nextNodes;

    const preconditions = this.extractPreconditions(context);
    
    const expectedNext = node.next_list.map((n: NextListItem) => n.name);
    const actualNext = nextNodes.map((n) => n.name);

    const executionState = this.determineExecutionState(
      node.status,
      expectedNext,
      actualNext
    );

    return {
      preconditions,
      executionState,
      expectedNext,
      actualNext,
      scene: '',
    };
  }

  /**
   * 提取前置条件
   */
  private extractPreconditions(context: UnifiedContext): string[] {
    const preconditions: string[] = [];
    const prevNodes = context.prevNodes;

    if (prevNodes.length > 0) {
      const lastPrev = prevNodes[prevNodes.length - 1];
      preconditions.push(`上一个节点 "${lastPrev.name}" 执行${lastPrev.status}`);
    }

    if (context.recognition?.algorithm) {
      preconditions.push(`使用 ${context.recognition.algorithm} 识别`);
    }

    return preconditions;
  }

  /**
   * 确定执行状态
   */
  private determineExecutionState(
    status: 'success' | 'failed',
    expected: string[],
    actual: string[]
  ): 'expected' | 'unexpected' | 'unknown' {
    if (status === 'success') {
      if (expected.length === 0) {
        return 'expected';
      }

      if (actual.length === 0) {
        return 'unexpected';
      }

      const matched = expected.filter(e => actual.includes(e));
      if (matched.length > 0) {
        return 'expected';
      }

      return 'unexpected';
    }

    return 'unexpected';
  }

  /**
   * 检测场景
   * 根据节点名称和上下文推断当前场景
   */
  private detectScene(context: UnifiedContext): string {
    const nodeNameLower = context.node.name.toLowerCase();

    const sceneKeywords = knowledgeBase.semantics.sceneKeywords;

    for (const [scene, keywords] of Object.entries(sceneKeywords)) {
      if (keywords.some(kw => nodeNameLower.includes(kw.toLowerCase()))) {
        return scene;
      }
    }

    return 'general';
  }
}

/**
 * 便捷函数：执行上下文理解
 */
export function understandContext(context: UnifiedContext): Layer2Result {
  const engine = new ContextUnderstandingEngine();
  return engine.understand(context);
}
