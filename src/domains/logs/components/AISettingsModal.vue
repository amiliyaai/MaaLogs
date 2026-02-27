<script setup lang="ts">
import { computed } from "vue";
import { NModal, NForm, NFormItem, NSelect, NInput, NButton } from "naive-ui";
import {
  PROVIDER_INFO,
  PROVIDER_MODELS,
  type AIConfig,
  type AIProvider,
  DEFAULT_AI_CONFIG,
} from "../utils/aiAnalyzer";

const props = defineProps<{
  show: boolean;
  config: AIConfig | null;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
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

function handleClose() {
  emit("update:show", false);
}

function handleSave() {
  if (props.config) {
    emit("save", props.config);
  }
  emit("update:show", false);
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
  <n-modal
    :show="show"
    preset="card"
    title="AI 分析设置"
    style="width: 500px"
    @update:show="emit('update:show', $event)"
  >
    <div style="color: #666; margin-bottom: 16px;">目前ai分析仅供参考，推荐使用免费模型，如智谱 AI：glm-4.7-flash！！！</div>
    <n-form v-if="config">
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
      <n-form-item label="Base URL (可选)">
        <n-input
          :value="config.baseUrl"
          placeholder="留空使用默认"
          @update:value="updateConfig('baseUrl', $event)"
        />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-button @click="handleClose"> 取消 </n-button>
      <n-button type="primary" :disabled="!config" @click="handleSave"> 保存 </n-button>
    </template>
  </n-modal>
</template>
