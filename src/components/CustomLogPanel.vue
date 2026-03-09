<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import {
  NTag,
  NCheckboxGroup,
  NCheckbox,
  NSpace,
  NSelect,
} from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import type { AuxLogEntry, PipelineCustomActionInfo } from "@/types/logTypes";

const props = defineProps<{
  auxLogs: AuxLogEntry[];
  customActions: PipelineCustomActionInfo[];
  selectedAuxLevels: string[];
  hiddenCallers: string[];
  highlightedAuxLogKey?: string | null;
  callerOptions: { label: string; value: string }[];
  formatAuxLevel: (
    value: string
  ) => "default" | "primary" | "info" | "success" | "warning" | "error";
}>();

const emit = defineEmits<{
  (e: "update:selectedAuxLevels", value: string[]): void;
  (e: "update:hiddenCallers", value: string[]): void;
}>();

const auxLevelOptions = [
  { label: "Error", value: "error" },
  { label: "Warn", value: "warn" },
  { label: "Info", value: "info" },
  { label: "Debug", value: "debug" },
  { label: "Other", value: "other" },
];

const auxLogScrollerRef = ref<InstanceType<typeof DynamicScroller> | null>(null);

watch(
  () => [props.highlightedAuxLogKey, props.auxLogs] as const,
  async ([highlightedAuxLogKey]) => {
    if (!highlightedAuxLogKey) return;

    const targetIndex = props.auxLogs.findIndex((log) => log.key === highlightedAuxLogKey);
    if (targetIndex < 0 || !auxLogScrollerRef.value) return;

    await nextTick();
    (auxLogScrollerRef.value as unknown as { scrollToItem: (index: number) => void }).scrollToItem(
      targetIndex
    );
  },
  { deep: true }
);
</script>

<template>
  <div class="detail-section-card">
    <div class="detail-section-header">
      <div class="detail-section-title">Custom日志</div>
    </div>
    <div class="aux-log-filters">
      <span class="aux-log-filter-label">级别过滤：</span>
      <n-checkbox-group
        :value="selectedAuxLevels"
        @update:value="emit('update:selectedAuxLevels', $event as string[])"
      >
        <n-space>
          <n-checkbox
            v-for="opt in auxLevelOptions"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
          />
        </n-space>
      </n-checkbox-group>
    </div>
    <div class="aux-log-filters">
      <span class="aux-log-filter-label">隐藏来源：</span>
      <n-select
        :value="hiddenCallers"
        :options="callerOptions"
        multiple
        clearable
        placeholder="选择要隐藏的日志来源文件"
        style="flex: 1; max-width: 400px"
        @update:value="emit('update:hiddenCallers', $event as string[])"
      />
    </div>

    <div v-if="customActions.length > 0" class="detail-tag-list">
      <n-tag
        v-for="item in customActions"
        :key="`${item.name}-${item.fileName}`"
        size="small"
        type="info"
      >
        {{ item.name }} · {{ item.fileName }}
      </n-tag>
    </div>

    <div class="aux-log-section">
      <div class="aux-log-summary">
        <n-tag size="small" type="success"> 关联日志 {{ auxLogs.length }} </n-tag>
      </div>
      <div class="aux-log-section-title">当前任务 · Custom日志</div>
      <div v-if="auxLogs.length === 0" class="empty">无关联日志</div>
      <div v-else class="aux-log-list">
        <DynamicScroller
          ref="auxLogScrollerRef"
          class="virtual-scroller aux-log-scroller"
          :items="auxLogs"
          key-field="key"
          :min-item-size="60"
        >
          <template #default="{ item, active }">
            <DynamicScrollerItem :item="item" :active="active">
              <div
                class="aux-log-item"
                :class="{ highlight: highlightedAuxLogKey === item.key }"
                :data-aux-log-key="item.key"
              >
                <div class="aux-log-main">
                  <div class="aux-log-header">
                    <n-tag size="small" :type="formatAuxLevel(item.level)">
                      {{ item.level }}
                    </n-tag>
                    <span class="aux-log-time">{{ item.timestamp }}</span>
                  </div>
                  <div class="aux-log-message">
                    {{ item.message }}
                  </div>
                </div>
                <div class="aux-log-meta">
                  <div v-if="item.entry">入口：{{ item.entry }}</div>
                  <div v-if="item.caller">来源：{{ item.caller }}</div>
                </div>
              </div>
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>
      </div>
    </div>
  </div>
</template>

<style scoped>
.aux-log-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--n-color-modal);
  border-radius: 8px;
}

.aux-log-filter-label {
  font-size: 12px;
  color: var(--n-text-color-2);
  white-space: nowrap;
}

.aux-log-scroller {
  max-height: 200px;
}

.detail-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.aux-log-section {
  margin-top: 12px;
}

.aux-log-summary {
  margin-bottom: 8px;
}

.aux-log-section-title {
  font-size: 13px;
  color: var(--n-text-color-2);
  margin-bottom: 8px;
}

.aux-log-list {
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.aux-log-item {
  padding: 8px 12px;
  border-bottom: 1px solid var(--n-border-color);
}

.aux-log-item.highlight {
  animation: highlight-flash 1.5s ease-out;
  background: rgba(24, 160, 88, 0.12);
}

.aux-log-item:last-child {
  border-bottom: none;
}

.aux-log-main {
  margin-bottom: 4px;
}

.aux-log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.aux-log-time {
  font-size: 11px;
  color: var(--n-text-color-3);
}

.aux-log-message {
  font-size: 13px;
  color: var(--n-text-color);
  word-break: break-all;
}

.aux-log-meta {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--n-text-color-3);
}

.empty {
  text-align: center;
  color: var(--n-text-color-3);
  padding: 24px;
}

@keyframes highlight-flash {
  0% {
    background: rgba(24, 160, 88, 0.22);
  }
  100% {
    background: rgba(24, 160, 88, 0.02);
  }
}
</style>
