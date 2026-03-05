<script setup lang="ts">
import { NRadioGroup, NRadioButton } from "naive-ui";

type ThemeMode = "light" | "dark" | "auto";

const props = defineProps<{
  themeMode: ThemeMode;
}>();

const emit = defineEmits<{
  (e: "update:themeMode", value: ThemeMode): void;
}>();

const themeOptions = [
  { label: "☀️ 浅色", value: "light" },
  { label: "🌙 深色", value: "dark" },
  { label: "💻 跟随系统", value: "auto" },
];
</script>

<template>
  <div class="general-settings">
    <div class="setting-item">
      <div class="setting-label">
        <span class="label-text">主题模式</span>
        <span class="label-desc">选择应用的显示主题</span>
      </div>
      <div class="setting-control">
        <n-radio-group
          :value="props.themeMode"
          @update:value="emit('update:themeMode', $event as ThemeMode)"
        >
          <n-radio-button
            v-for="option in themeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </n-radio-button>
        </n-radio-group>
      </div>
    </div>
  </div>
</template>

<style scoped>
.general-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--n-color-fill-weak);
  border-radius: 8px;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--n-text-color-1);
}

.label-desc {
  font-size: 13px;
  color: var(--n-text-color-3);
  line-height: 1.5;
}

.setting-control {
  display: flex;
  justify-content: flex-start;
}
</style>
