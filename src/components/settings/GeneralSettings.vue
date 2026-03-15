<script setup lang="ts">
import { NButton, NSwitch, NInputNumber, NPopconfirm, NColorPicker, NTag } from "naive-ui";
import { getPlatform } from "@/platform";
import { defaultDurationConfig, type DurationDisplayConfig } from "@/config/display";

type ThemeMode = "light" | "dark" | "auto";

const props = defineProps<{
  themeMode: ThemeMode;
  importMaaBakLog: boolean;
  jsonExpandDepth: number;
  durationDisplay: DurationDisplayConfig;
  pipelineDir: string | null;
  pipelineLoaded: boolean;
  isLoadingPipeline: boolean;
}>();

const emit = defineEmits<{
  (e: "update:themeMode", value: ThemeMode): void;
  (e: "update:importMaaBakLog", value: boolean): void;
  (e: "update:jsonExpandDepth", value: number): void;
  (e: "update:durationDisplay", value: DurationDisplayConfig): void;
  (e: "update:pipelineDir", value: string | null): void;
  (e: "refresh-pipeline"): void;
}>();

const themeOptions: { label: string; icon: string; value: ThemeMode }[] = [
  { label: "浅色", icon: "☀️", value: "light" },
  { label: "深色", icon: "🌙", value: "dark" },
  { label: "跟随系统", icon: "💻", value: "auto" },
];

async function resetWindowLayout() {
  const platform = await getPlatform();
  await platform.updater.resetWindowLayout();
}

function selectTheme(value: ThemeMode) {
  emit("update:themeMode", value);
}

function handleImportMaaBakLogChange(value: boolean) {
  emit("update:importMaaBakLog", value);
}

function handleJsonExpandDepthChange(value: number | null) {
  emit("update:jsonExpandDepth", value ?? 5);
}

function handleWarningThresholdChange(value: number | null) {
  emit("update:durationDisplay", {
    ...props.durationDisplay,
    warningThreshold: value ?? defaultDurationConfig.warningThreshold,
  });
}

function handleDangerThresholdChange(value: number | null) {
  emit("update:durationDisplay", {
    ...props.durationDisplay,
    dangerThreshold: value ?? defaultDurationConfig.dangerThreshold,
  });
}

function handleNormalColorChange(value: string) {
  emit("update:durationDisplay", {
    ...props.durationDisplay,
    normalColor: value,
  });
}

function handleWarningColorChange(value: string) {
  emit("update:durationDisplay", {
    ...props.durationDisplay,
    warningColor: value,
  });
}

function handleDangerColorChange(value: string) {
  emit("update:durationDisplay", {
    ...props.durationDisplay,
    dangerColor: value,
  });
}

function resetDurationDisplay() {
  emit("update:durationDisplay", { ...defaultDurationConfig });
}

async function selectPipelineDir() {
  const platform = await getPlatform();
  const dir = await platform.picker.selectDirectory();
  if (dir) {
    emit("update:pipelineDir", dir);
  }
}

function clearPipelineDir() {
  emit("update:pipelineDir", null);
}

function refreshPipeline() {
  emit("refresh-pipeline");
}
</script>

<template>
  <div class="general-settings">
    <div class="setting-card">
      <div class="setting-row">
        <div class="setting-icon">🎨</div>
        <div class="setting-info">
          <div class="setting-title">主题模式</div>
          <div class="setting-desc">选择应用的显示主题</div>
        </div>
      </div>
      <div class="theme-options">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-option"
          :class="{ active: props.themeMode === option.value }"
          @click="selectTheme(option.value)"
        >
          <span class="theme-icon">{{ option.icon }}</span>
          <span class="theme-label">{{ option.label }}</span>
        </button>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div class="setting-icon">↕️</div>
        <div class="setting-info">
          <div class="setting-title">重置窗口布局</div>
          <div class="setting-desc">将窗口大小恢复为默认值，并居中显示</div>
        </div>
        <n-button class="reset-btn" @click="resetWindowLayout">重置</n-button>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div class="setting-icon">📄</div>
        <div class="setting-info">
          <div class="setting-title">导入 maa.bak.log</div>
          <div class="setting-desc">导入目录时同时导入 maa.bak.log，与 maa.log 拼接后解析</div>
        </div>
        <n-switch :value="props.importMaaBakLog" @update:value="handleImportMaaBakLogChange" />
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div class="setting-icon">📁</div>
        <div class="setting-info">
          <div class="setting-title">Pipeline 目录</div>
          <div class="setting-desc">用于诊断增强的 Pipeline 配置文件目录（递归搜索 JSON）</div>
        </div>
        <div class="pipeline-actions">
          <n-button v-if="!props.pipelineDir" size="small" @click="selectPipelineDir">选择目录</n-button>
          <template v-else>
            <n-button size="small" @click="selectPipelineDir">更改</n-button>
            <n-button size="small" @click="refreshPipeline" :loading="props.isLoadingPipeline">刷新</n-button>
            <n-button size="small" @click="clearPipelineDir">清除</n-button>
          </template>
        </div>
      </div>
      <div v-if="props.pipelineDir" class="pipeline-dir">
        <span class="dir-path">{{ props.pipelineDir }}</span>
        <n-tag v-if="props.pipelineLoaded" type="success" size="small">
          已加载
        </n-tag>
        <n-tag v-else-if="props.isLoadingPipeline" type="info" size="small">
          加载中...
        </n-tag>
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-row">
        <div class="setting-icon">📋</div>
        <div class="setting-info">
          <div class="setting-title">JSON 展开层级</div>
          <div class="setting-desc">JSON 数据默认展开的层级</div>
        </div>
        <n-input-number
          :value="props.jsonExpandDepth"
          :min="1"
          :max="20"
          :step="1"
          class="depth-input"
          @update:value="handleJsonExpandDepthChange"
        />
      </div>
    </div>

    <div class="setting-card">
      <div class="setting-header">
        <div class="setting-row">
          <div class="setting-icon">⏱️</div>
          <div class="setting-info">
            <div class="setting-title">节点耗时显示</div>
            <div class="setting-desc">设置节点耗时阈值和显示颜色</div>
          </div>
          <n-popconfirm
            positive-text="确认"
            negative-text="取消"
            @positive-click="resetDurationDisplay"
          >
            <template #trigger>
              <n-button size="small" type="warning">重置</n-button>
            </template>
            确定要重置为默认值吗？
          </n-popconfirm>
        </div>
      </div>
      <div class="duration-settings">
        <div class="duration-row">
          <span class="duration-label">正常颜色</span>
          <n-color-picker
            :value="props.durationDisplay.normalColor"
            class="color-picker"
            @update:value="handleNormalColorChange"
          />
        </div>
        <div class="duration-row">
          <span class="duration-label">警告阈值 (ms)</span>
          <n-input-number
            :value="props.durationDisplay.warningThreshold"
            :min="0"
            :max="100000"
            :step="100"
            class="threshold-input"
            @update:value="handleWarningThresholdChange"
          />
          <n-color-picker
            :value="props.durationDisplay.warningColor"
            class="color-picker"
            @update:value="handleWarningColorChange"
          />
        </div>
        <div class="duration-row">
          <span class="duration-label">危险阈值 (ms)</span>
          <n-input-number
            :value="props.durationDisplay.dangerThreshold"
            :min="0"
            :max="100000"
            :step="100"
            class="threshold-input"
            @update:value="handleDangerThresholdChange"
          />
          <n-color-picker
            :value="props.durationDisplay.dangerColor"
            class="color-picker"
            @update:value="handleDangerColorChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.general-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-card {
  background: var(--n-color-fill-weak);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid var(--n-border-color);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.setting-icon {
  font-size: 28px;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--n-color-fill);
  border-radius: 10px;
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
  margin-bottom: 2px;
}

.setting-desc {
  font-size: 13px;
  color: var(--n-text-color-3);
}

.theme-options {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.theme-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--n-color-fill);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid var(--n-border-color);
}

.theme-option:hover {
  background: var(--n-color-hover);
}

.theme-option.active {
  background: var(--n-color-hover);
  border-color: var(--n-primary-color);
  border-width: 2px;
}

.theme-icon {
  font-size: 24px;
}

.theme-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color-2);
}

.theme-option.active .theme-label {
  color: var(--n-primary-color);
  font-weight: 600;
}

.reset-btn {
  flex-shrink: 0;
}

.depth-input {
  width: 100px;
}

.duration-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
  padding: 16px;
  background: var(--n-color-fill);
  border-radius: 12px;
}

.duration-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.duration-label {
  width: 120px;
  font-size: 13px;
  color: var(--n-text-color-2);
}

.threshold-input {
  width: 120px;
}

.color-picker {
  width: 100px;
}

.pipeline-actions {
  display: flex;
  gap: 8px;
}

.pipeline-dir {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--n-color-fill);
  border-radius: 8px;
  font-size: 12px;
}

.dir-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--n-text-color-3);
}
</style>
