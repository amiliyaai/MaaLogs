<script setup lang="ts">
import { NButton } from "naive-ui";

type ViewMode = "analysis" | "search" | "statistics";

defineProps<{
  viewMode: ViewMode;
  isTauri: boolean;
}>();

const emit = defineEmits<{
  (e: "change-view", value: ViewMode): void;
  (e: "open-devtools"): void;
}>();

const emitView = (value: ViewMode) => {
  emit("change-view", value);
};
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="subtitle">日志解析 · 任务与节点可视化</div>
    </div>
    <div class="top-actions">
      <div class="view-tabs">
        <n-button v-if="isTauri" size="small" secondary @click="emit('open-devtools')">
          开发者工具
        </n-button>
        <n-button size="small" :type="viewMode === 'analysis' ? 'primary' : 'default'" @click="emitView('analysis')">
          日志分析
        </n-button>
        <n-button size="small" :type="viewMode === 'search' ? 'primary' : 'default'" @click="emitView('search')">
          文本搜索
        </n-button>
        <n-button
          size="small"
          :type="viewMode === 'statistics' ? 'primary' : 'default'"
          @click="emitView('statistics')"
        >
          节点统计
        </n-button>
      </div>
    </div>
  </header>
</template>
