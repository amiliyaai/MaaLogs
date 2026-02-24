<script setup lang="ts">
import { ref, onMounted } from "vue";
import { NTag, NCheckboxGroup, NCheckbox, NSpace, NSelect, NButton, NModal, NInput } from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import type { AuxLogEntry, PipelineCustomActionInfo } from "../types/logTypes";

const props = defineProps<{
  auxLogs: AuxLogEntry[];
  customActions: PipelineCustomActionInfo[];
  selectedAuxLevels: string[];
  hiddenCallers: string[];
  callerOptions: { label: string; value: string }[];
  formatAuxLevel: (value: string) => "default" | "primary" | "info" | "success" | "warning" | "error";
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
  { label: "Other", value: "other" }
];

const DEFAULT_HIDDEN_CALLERS_KEY = "maa-logs-default-hidden-callers";
const showDefaultHiddenModal = ref(false);
const defaultHiddenCallers = ref<string[]>([]);
const newHiddenCallerInput = ref("");
const DEFAULT_HIDDEN_CALLERS_INITIAL = ["main.go", "register.go", "checker.go"];

function loadDefaultHiddenCallers() {
  try {
    const saved = localStorage.getItem(DEFAULT_HIDDEN_CALLERS_KEY);
    if (saved) {
      defaultHiddenCallers.value = JSON.parse(saved);
    } else {
      defaultHiddenCallers.value = [...DEFAULT_HIDDEN_CALLERS_INITIAL];
    }
  } catch {
    defaultHiddenCallers.value = [...DEFAULT_HIDDEN_CALLERS_INITIAL];
  }
}

function saveDefaultHiddenCallers() {
  localStorage.setItem(DEFAULT_HIDDEN_CALLERS_KEY, JSON.stringify(defaultHiddenCallers.value));
}

function addDefaultHiddenCaller() {
  const value = newHiddenCallerInput.value.trim();
  if (value && !defaultHiddenCallers.value.includes(value)) {
    defaultHiddenCallers.value.push(value);
    saveDefaultHiddenCallers();
  }
  newHiddenCallerInput.value = "";
}

function removeDefaultHiddenCaller(index: number) {
  defaultHiddenCallers.value.splice(index, 1);
  saveDefaultHiddenCallers();
}

function applyDefaultHiddenCallers() {
  const currentHidden = [...props.hiddenCallers];
  for (const caller of defaultHiddenCallers.value) {
    if (!currentHidden.includes(caller)) {
      currentHidden.push(caller);
    }
  }
  emit("update:hiddenCallers", currentHidden);
  showDefaultHiddenModal.value = false;
}

onMounted(() => {
  loadDefaultHiddenCallers();
});
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
        style="flex: 1; max-width: 400px;"
        @update:value="emit('update:hiddenCallers', $event as string[])"
      />
      <n-button size="small" @click="showDefaultHiddenModal = true">
        默认设置
      </n-button>
    </div>

    <n-modal v-model:show="showDefaultHiddenModal" preset="card" title="默认隐藏来源" style="width: 400px;">
      <div class="default-hidden-callers-modal">
        <div class="default-hidden-callers-list">
          <div
            v-for="(caller, index) in defaultHiddenCallers"
            :key="index"
            class="default-hidden-caller-item"
          >
            <span>{{ caller }}</span>
            <n-button size="tiny" type="error" @click="removeDefaultHiddenCaller(index)">删除</n-button>
          </div>
          <div v-if="defaultHiddenCallers.length === 0" class="empty">暂无默认隐藏来源</div>
        </div>
        <div class="default-hidden-callers-add">
          <n-input
            v-model:value="newHiddenCallerInput"
            placeholder="输入来源文件名（如 actions.go）"
            @keyup.enter="addDefaultHiddenCaller"
          />
          <n-button size="small" type="primary" @click="addDefaultHiddenCaller">添加</n-button>
        </div>
        <div class="default-hidden-callers-actions">
          <n-button type="primary" @click="applyDefaultHiddenCallers">应用并关闭</n-button>
        </div>
      </div>
    </n-modal>

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
        <n-tag size="small" type="success">关联日志 {{ auxLogs.length }}</n-tag>
      </div>
      <div class="aux-log-section-title">当前任务 · Custom日志</div>
      <div v-if="auxLogs.length === 0" class="empty">无关联日志</div>
      <div v-else class="aux-log-list">
        <DynamicScroller
          class="virtual-scroller aux-log-scroller"
          :items="auxLogs"
          key-field="key"
          :min-item-size="60"
        >
          <template #default="{ item, active }">
            <DynamicScrollerItem :item="item" :active="active">
              <div class="aux-log-item">
                <div class="aux-log-main">
                  <div class="aux-log-header">
                    <n-tag size="small" :type="formatAuxLevel(item.level)">{{ item.level }}</n-tag>
                    <span class="aux-log-time">{{ item.timestamp }}</span>
                  </div>
                  <div class="aux-log-message">{{ item.message }}</div>
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
  background: #f9fafb;
  border-radius: 8px;
}

.aux-log-filter-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.aux-log-scroller {
  max-height: 200px;
}

.default-hidden-callers-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.default-hidden-callers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.default-hidden-caller-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  background: #f9fafb;
  border-radius: 6px;
}

.default-hidden-callers-add {
  display: flex;
  gap: 8px;
}

.default-hidden-callers-actions {
  display: flex;
  justify-content: flex-end;
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
  color: #6b7280;
  margin-bottom: 8px;
}

.aux-log-list {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.aux-log-item {
  padding: 8px 12px;
  border-bottom: 1px solid #f3f4f6;
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
  color: #9ca3af;
}

.aux-log-message {
  font-size: 13px;
  color: #374151;
  word-break: break-all;
}

.aux-log-meta {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: #9ca3af;
}

.empty {
  text-align: center;
  color: #9ca3af;
  padding: 24px;
}
</style>
