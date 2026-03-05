<script setup lang="ts">
import { computed } from "vue";
import { NForm, NFormItem, NSelect, NInput, NButton, NAlert } from "naive-ui";
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

function handleSave() {
  if (props.config) {
    emit("save", props.config);
  }
}

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
    <n-alert type="info" style="margin-bottom: 16px">
      目前 AI 分析仅供参考，推荐使用免费模型，如智谱 AI：glm-4.7-flash
    </n-alert>

    <n-form v-if="config" label-placement="left" label-width="100">
      <n-form-item label="服务商">
        <n-select
          :value="config.provider"
          :options="providerOptions"
          @update:value="updateConfig('provider', $event)"
        />
      </n-form-item>

      <n-form-item label="API Key">
        <n-input
          :value="config.apiKeys[config.provider]"
          type="password"
          placeholder="输入 API Key"
          show-password-on="click"
          @update:value="updateApiKey($event)"
        />
      </n-form-item>

      <n-form-item label="模型">
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
      </n-form-item>

      <n-form-item label="Base URL">
        <n-input
          :value="config.baseUrl"
          placeholder="留空使用默认地址"
          @update:value="updateConfig('baseUrl', $event)"
        />
      </n-form-item>

      <n-form-item :show-label="false">
        <n-button type="primary" :disabled="!config" @click="handleSave"> 保存设置 </n-button>
      </n-form-item>
    </n-form>
  </div>
</template>

<style scoped>
.ai-settings {
  display: flex;
  flex-direction: column;
}
</style>
