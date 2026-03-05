<script setup lang="ts">
import { NTag } from "naive-ui";
import type { FailureAnalysis, AIAnalysisStats } from "@/utils/aiAnalyzer";

defineProps<{
  results: FailureAnalysis[];
  error?: string;
  stats?: AIAnalysisStats;
}>();

function formatSuggestion(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const isNumberStart =
      text[i] >= "1" &&
      text[i] <= "9" &&
      text[i + 1] === "." &&
      text[i + 2] === " " &&
      (i === 0 || text[i - 1] === " ");
    result += isNumberStart ? "\n" + text[i] : text[i];
  }
  return result.trim();
}
</script>

<template>
  <div v-if="results.length > 0 || error" class="detail-section-card">
    <div class="detail-section-header">
      <div class="detail-section-title">AI 分析结果</div>
      <n-tag v-if="stats" size="tiny" type="info"> {{ stats.totalTokens }} tokens </n-tag>
    </div>
    <div v-if="error" class="ai-error">
      {{ error }}
    </div>
    <div v-else class="ai-results">
      <div v-for="result in results" :key="result.nodeId" class="ai-result-item">
        <div class="ai-result-header">
          <strong>{{ result.nodeName }}</strong>
          <n-tag
            size="small"
            :type="
              result.confidence > 0.7 ? 'success' : result.confidence > 0.4 ? 'warning' : 'error'
            "
          >
            置信度：{{ Math.round(result.confidence * 100) }}%
          </n-tag>
        </div>
        <div class="ai-result-cause">
          <strong>原因：</strong>
          <div class="cause-content">{{ result.cause }}</div>
        </div>
        <div class="ai-result-suggestion">
          <strong>建议：</strong>
          <div class="suggestion-content">{{ formatSuggestion(result.suggestion) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-error {
  color: var(--n-error-color);
  padding: 12px;
  background: var(--n-error-color-supply);
  border-radius: 6px;
}

.ai-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-result-item {
  padding: 12px;
  background: var(--n-color-modal);
  border-radius: 8px;
  border-left: 3px solid var(--n-primary-color);
}

.ai-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ai-result-cause {
  font-size: 13px;
  color: var(--n-text-color);
  margin-bottom: 8px;
  padding-left: 1em;
}

.cause-content {
  margin-top: 4px;
  padding-left: 0.5em;
  white-space: pre-line;
}

.ai-result-suggestion {
  font-size: 13px;
  color: var(--n-text-color-2);
  padding-left: 1em;
}

.suggestion-content {
  white-space: pre-line;
  margin-top: 4px;
  padding-left: 0.5em;
}
</style>
