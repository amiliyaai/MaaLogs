<script setup lang="ts">
import { NTag } from "naive-ui";
import type { FailureAnalysis } from "../utils/aiAnalyzer";

defineProps<{
  results: FailureAnalysis[];
  error?: string;
}>();
</script>

<template>
  <div class="detail-section-card" v-if="results.length > 0 || error">
    <div class="detail-section-header">
      <div class="detail-section-title">AI 分析结果</div>
    </div>
    <div v-if="error" class="ai-error">{{ error }}</div>
    <div v-else class="ai-results">
      <div v-for="result in results" :key="result.nodeId" class="ai-result-item">
        <div class="ai-result-header">
          <strong>{{ result.nodeName }}</strong>
          <n-tag
            size="small"
            :type="result.confidence > 0.7 ? 'success' : result.confidence > 0.4 ? 'warning' : 'error'"
          >
            {{ Math.round(result.confidence * 100) }}%
          </n-tag>
        </div>
        <div class="ai-result-cause">原因: {{ result.cause }}</div>
        <div class="ai-result-suggestion">建议: {{ result.suggestion }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-error {
  color: #dc2626;
  padding: 12px;
  background: #fef2f2;
  border-radius: 6px;
}

.ai-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-result-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border-left: 3px solid #3b82f6;
}

.ai-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ai-result-cause {
  font-size: 13px;
  color: #374151;
  margin-bottom: 4px;
}

.ai-result-suggestion {
  font-size: 13px;
  color: #6b7280;
}
</style>
