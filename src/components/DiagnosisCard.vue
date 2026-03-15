<!--
@component DiagnosisCard
@description 智能诊断结果展示卡片组件
@author MaaLogs Team
@license MIT

@features
- 展示诊断结果、根本原因、推理链
- 展示修复建议
- 展示诊断置信度
- 区分基础诊断和完整诊断
-->

<script setup lang="ts">
import { computed } from 'vue';
import { NTag, NCollapse, NCollapseItem, NAlert, NEmpty } from 'naive-ui';
import type { DiagnosisResult } from '@/types/diagnosis';

interface Props {
  diagnosis: DiagnosisResult | null;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const severityType = computed(() => {
  if (!props.diagnosis) return 'default';
  switch (props.diagnosis.severity) {
    case 'critical':
      return 'error';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
});

const severityLabel = computed(() => {
  if (!props.diagnosis) return '';
  switch (props.diagnosis.severity) {
    case 'critical':
      return '严重';
    case 'error':
      return '错误';
    case 'warning':
      return '警告';
    default:
      return '信息';
  }
});

const categoryLabel = computed(() => {
  if (!props.diagnosis) return '';
  const labels: Record<string, string> = {
    RECO_NO_MATCH: '识别无匹配',
    RECO_FILTERED: '识别结果被过滤',
    RECO_LOW_SCORE: '识别分数低',
    ACTION_FAILED: '动作失败',
    ACTION_INVALID_RECT: '动作目标无效',
    CONFIG_ERROR: '配置错误',
    THRESHOLD_ISSUE: '阈值问题',
    ROI_ISSUE: 'ROI 问题',
    TEMPLATE_ISSUE: '模板问题',
    TARGET_OFFSET_ERROR: '偏移参数错误',
    LOCKED_STATE_ISSUE: '锁定状态问题',
    SCENE_ISSUE: '场景问题',
    UNKNOWN: '未知',
  };
  return labels[props.diagnosis.category] || props.diagnosis.category;
});

const getSuggestionIcon = (type: string) => {
  switch (type) {
    case 'fix':
      return '🔧';
    case 'check':
      return '🔍';
    case 'explanation':
      return '💡';
    default:
      return '📋';
  }
};

const formatProbability = (prob: number) => {
  return `${(prob * 100).toFixed(0)}%`;
};
</script>

<template>
  <div class="diagnosis-card">
    <NAlert v-if="loading" type="info" :show-icon="true">
      正在分析中...
    </NAlert>

    <NEmpty v-else-if="!diagnosis" description="选择一个失败的节点进行诊断" />

    <template v-else>
      <div class="diagnosis-header">
        <div class="diagnosis-title">
          <span class="node-name">{{ diagnosis.nodeName }}</span>
          <NTag :type="severityType" size="small">
            {{ severityLabel }}
          </NTag>
        </div>
        <div class="diagnosis-meta">
          <span class="confidence">
            置信度: {{ formatProbability(diagnosis.confidence) }}
          </span>
          <NTag v-if="diagnosis.hasPipeline" type="success" size="small">
            完整诊断
          </NTag>
          <NTag v-else type="default" size="small">
            基础诊断
          </NTag>
        </div>
      </div>

      <div class="diagnosis-category">
        <span class="label">问题类型:</span>
        <NTag :type="severityType">{{ categoryLabel }}</NTag>
      </div>

      <div class="root-cause">
        <div class="cause-header">
          <span class="label">根本原因:</span>
          <span class="cause-name">{{ diagnosis.rootCause }}</span>
          <span class="cause-confidence">
            {{ formatProbability(diagnosis.rootCauseConfidence) }}
          </span>
        </div>
      </div>

      <NCollapse class="reasoning-chain" :default-expanded-names="['suggestions']">
        <NCollapseItem title="💡 修复建议" name="suggestions">
          <template #header-extra>
            <span class="collapse-count">{{ diagnosis.suggestions.length }} 条</span>
          </template>
          <div class="suggestions-list">
            <div
              v-for="(suggestion, index) in diagnosis.suggestions"
              :key="index"
              class="suggestion-item"
              :class="{ important: suggestion.important, critical: suggestion.critical }"
            >
              <div class="suggestion-header">
                <span class="suggestion-icon">{{ getSuggestionIcon(suggestion.type) }}</span>
                <span class="suggestion-title">{{ suggestion.title || suggestion.type }}</span>
                <NTag v-if="suggestion.important" type="warning" size="small">重要</NTag>
              </div>
              <div class="suggestion-content">{{ suggestion.content }}</div>
              <div v-if="suggestion.explanation" class="suggestion-explanation">
                {{ suggestion.explanation }}
              </div>
            </div>
          </div>
        </NCollapseItem>

        <NCollapseItem title="🔬 推理过程" name="reasoning">
          <template #header-extra>
            <span class="collapse-count">{{ diagnosis.reasoningChain.length }} 步</span>
          </template>
          <div class="reasoning-list">
            <div
              v-for="step in diagnosis.reasoningChain"
              :key="step.step"
              class="reasoning-step"
            >
              <div class="step-header">
                <NTag :type="step.layer <= 2 ? 'info' : step.layer <= 4 ? 'warning' : 'error'" size="small">
                  L{{ step.layer }}
                </NTag>
                <span class="step-title">{{ step.title }}</span>
              </div>
              <div class="step-content">{{ step.content }}</div>
            </div>
          </div>
        </NCollapseItem>

        <NCollapseItem title="📊 可能原因" name="causes">
          <template #header-extra>
            <span class="collapse-count">{{ diagnosis.allRootCauses.length }} 个</span>
          </template>
          <div class="causes-list">
            <div
              v-for="(cause, index) in diagnosis.allRootCauses.slice(0, 5)"
              :key="index"
              class="cause-item"
            >
              <div class="cause-name-row">
                <span class="cause-index">{{ index + 1 }}.</span>
                <span class="cause-name">{{ cause.cause }}</span>
                <span class="cause-probability">{{ formatProbability(cause.probability) }}</span>
              </div>
              <div v-if="cause.evidence.length > 0" class="cause-evidence">
                <span v-for="(ev, i) in cause.evidence.slice(0, 3)" :key="i" class="evidence-tag">
                  {{ ev }}
                </span>
              </div>
            </div>
          </div>
        </NCollapseItem>
      </NCollapse>
    </template>
  </div>
</template>

<style scoped>
.diagnosis-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diagnosis-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.diagnosis-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-name {
  font-weight: 600;
  font-size: 16px;
}

.diagnosis-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #666;
}

.diagnosis-category {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-weight: 500;
  color: #666;
}

.root-cause {
  padding: 12px;
  background: #fff5f5;
  border-radius: 8px;
  border-left: 4px solid #ff4d4f;
}

.cause-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cause-name {
  font-weight: 600;
  color: #333;
}

.cause-confidence {
  color: #ff4d4f;
  font-weight: 500;
}

.reasoning-chain {
  margin-top: 8px;
}

.collapse-count {
  font-size: 12px;
  color: #999;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-item {
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
  border-left: 3px solid #ddd;
}

.suggestion-item.important {
  border-left-color: #faad14;
  background: #fffbe6;
}

.suggestion-item.critical {
  border-left-color: #ff4d4f;
  background: #fff5f5;
}

.suggestion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.suggestion-icon {
  font-size: 16px;
}

.suggestion-title {
  font-weight: 600;
}

.suggestion-content {
  color: #333;
  line-height: 1.6;
}

.suggestion-explanation {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #ddd;
  font-size: 12px;
  color: #666;
  white-space: pre-line;
}

.reasoning-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reasoning-step {
  padding: 8px;
  background: #f5f5f5;
  border-radius: 6px;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.step-title {
  font-weight: 500;
}

.step-content {
  font-size: 13px;
  color: #666;
}

.causes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cause-item {
  padding: 8px;
  background: #f9f9f9;
  border-radius: 6px;
}

.cause-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cause-index {
  color: #999;
}

.cause-probability {
  color: #ff4d4f;
  font-weight: 500;
  margin-left: auto;
}

.cause-evidence {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.evidence-tag {
  font-size: 11px;
  padding: 2px 6px;
  background: #e6f7ff;
  border-radius: 4px;
  color: #1890ff;
}
</style>
