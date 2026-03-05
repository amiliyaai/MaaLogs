<script setup lang="ts">
import { computed, watch } from "vue";
import { NSelect, NInput, NAlert } from "naive-ui";
import {
  PROVIDER_INFO,
  PROVIDER_MODELS,
  type AIConfig,
  type AIProvider,
  DEFAULT_AI_CONFIG,
} from "@/utils/aiAnalyzer";

const props = defineProps<{
  config: AIConfig | null;
}>();

const emit = defineEmits<{
  (e: "update:config", value: AIConfig): void;
  (e: "save", config: AIConfig): void;
}>();

const currentConfig = computed(() => props.config || DEFAULT_AI_CONFIG);

const providerOptions = computed(() =>
  Object.entries(PROVIDER_INFO).map(([value, info]) => ({ label: info.name, value }))
);

const modelOptions = computed(() => {
  const models = PROVIDER_MODELS[currentConfig.value.provider as AIProvider] || [];
  return models.map((m) => ({ label: m, value: m }));
});

const isCustomProvider = computed(() => currentConfig.value.provider === "custom");

watch(
  () => props.config,
  (newConfig) => {
    if (newConfig) {
      emit("save", newConfig);
    }
  },
  { deep: true }
);

function updateConfig<K extends keyof AIConfig>(key: K, value: AIConfig[K]) {
  if (!props.config) return;

  const newConfig = { ...props.config, [key]: value };

  if (key === "provider") {
    const models = PROVIDER_MODELS[value as AIProvider];
    if (value === "custom") {
      newConfig.model = "";
    } else if (models && models.length > 0 && !models.includes(newConfig.model)) {
      newConfig.model = models[0];
    }
  }

  emit("update:config", newConfig as AIConfig);
}

function updateApiKey(value: string) {
  if (!props.config) return;

  const newConfig = {
    ...props.config,
    apiKeys: { ...props.config.apiKeys, [props.config.provider]: value },
  };
  emit("update:config", newConfig as AIConfig);
}
</script>

<template>
  <div class="ai-settings">
    <div class="setting-card">
      <div class="ai-content">
        <n-alert type="info" style="margin-bottom: 16px">
          目前 AI 分析仅供参考，推荐使用免费模型，如智谱 AI：glm-4.7-flash
        </n-alert>

        <div class="setting-item">
          <div class="setting-item-label">服务商</div>
          <n-select
            :value="config.provider"
            :options="providerOptions"
            @update:value="updateConfig('provider', $event)"
          />
        </div>

        <div class="setting-item">
          <div class="setting-item-label">API Key</div>
          <n-input
            :value="config.apiKeys[config.provider]"
            type="password"
            placeholder="输入 API Key"
            show-password-on="click"
            @update:value="updateApiKey($event)"
          />
        </div>

        <div class="setting-item">
          <div class="setting-item-label">模型</div>
          <n-select
            v-if="!isCustomProvider"
            :value="config.model"
            :options="modelOptions"
            @update:value="updateConfig('model', $event)"
          />
          <n-input
            v-else
            :value="config.model"
            placeholder="输入模型名称"
            @update:value="updateConfig('model', $event)"
          />
        </div>

        <div class="setting-item">
          <div class="setting-item-label">Base URL</div>
          <n-input
            :value="config.baseUrl"
            placeholder="留空使用默认地址"
            @update:value="updateConfig('baseUrl', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-card {
  background: var(--n-color-fill-weak);
  border-radius: 16px;
  padding: 20px;
}

.ai-content {
  margin-top: 0;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--n-color-fill-weak);
  border-radius: 8px;
  border: 1px solid var(--n-border-color);
  margin-bottom: 12px;
}

.setting-item-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color-2);
}

.ai-settings :deep(.n-form) {
  text-align: left;
}

.ai-settings :deep(.n-form-item) {
  margin-bottom: 20px;
  text-align: left;
}

.ai-settings :deep(.n-form-item-label) {
  font-weight: 500;
  text-align: left;
}
</style>
