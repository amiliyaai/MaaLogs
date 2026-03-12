<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from "vue";
import { NModal } from "naive-ui";
import GeneralSettings from "./settings/GeneralSettings.vue";
import AISettings from "./settings/AISettings.vue";
import AboutSettings from "./settings/AboutSettings.vue";
import type { AIConfig } from "@/config/ai";
import type { DurationDisplayConfig } from "@/config/display";
import { isTauriEnv } from "@/utils/env";

type ThemeMode = "light" | "dark" | "auto";

const props = defineProps<{
  show: boolean;
  themeMode: ThemeMode;
  aiConfig: AIConfig | null;
  importMaaBakLog: boolean;
  jsonExpandDepth: number;
  durationDisplay: DurationDisplayConfig;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "update:theme-mode", value: ThemeMode): void;
  (e: "update:ai-config", value: AIConfig): void;
  (e: "save-ai-config", value: AIConfig): void;
  (e: "update:import-maa-bak-log", value: boolean): void;
  (e: "update:json-expand-depth", value: number): void;
  (e: "update:duration-display", value: DurationDisplayConfig): void;
}>();

const contentRef = ref<HTMLElement | null>(null);
const activeSection = ref("general");

const isDesktop = computed(() => isTauriEnv());

const sections = computed(() => {
  const list = [
    { id: "general", label: "通用", icon: "⚙️" },
    { id: "about", label: "关于", icon: "ℹ️" },
  ];
  if (isDesktop.value) {
    list.splice(1, 0, { id: "ai", label: "AI 设置", icon: "🤖" });
  }
  return list;
});

watch(
  () => props.show,
  (newVal) => {
    if (newVal) {
      activeSection.value = "general";
      nextTick(() => {
        if (contentRef.value) {
          contentRef.value.scrollTop = 0;
        }
      });
    }
  }
);

function scrollToSection(sectionId: string) {
  const element = contentRef.value?.querySelector(`#${sectionId}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    activeSection.value = sectionId;
  }
}

function handleScroll() {
  if (!contentRef.value) return;

  const scrollTop = contentRef.value.scrollTop;
  const sectionElements = contentRef.value.querySelectorAll(".settings-section");

  for (const section of sectionElements) {
    const htmlSection = section as HTMLElement;
    const offsetTop = htmlSection.offsetTop;
    const height = htmlSection.offsetHeight;

    if (scrollTop >= offsetTop - 100 && scrollTop < offsetTop + height - 100) {
      activeSection.value = htmlSection.id;
      break;
    }
  }
}

function handleThemeChange(value: ThemeMode) {
  emit("update:theme-mode", value);
}

function handleAIConfigUpdate(value: AIConfig) {
  emit("update:ai-config", value);
}

function handleAIConfigSave(value: AIConfig) {
  emit("save-ai-config", value);
}

function handleImportMaaBakLogChange(value: boolean) {
  emit("update:import-maa-bak-log", value);
}

function handleJsonExpandDepthChange(value: number) {
  emit("update:json-expand-depth", value);
}

function handleDurationDisplayChange(value: DurationDisplayConfig) {
  emit("update:duration-display", value);
}

onMounted(() => {
  nextTick(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = 0;
    }
  });
});
</script>

<template>
  <n-modal
    :show="props.show"
    preset="card"
    title="设置"
    style="width: 720px; max-width: 90vw"
    :bordered="false"
    :content-style="{ padding: 0, height: '560px' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="settings-container">
      <nav class="settings-nav">
        <a
          v-for="section in sections"
          :key="section.id"
          :class="['nav-item', { active: activeSection === section.id }]"
          @click="scrollToSection(section.id)"
        >
          <span class="nav-icon">{{ section.icon }}</span>
          <span class="nav-label">{{ section.label }}</span>
        </a>
      </nav>

      <div ref="contentRef" class="settings-content" @scroll="handleScroll">
        <section id="general" class="settings-section">
          <h3 class="section-title">通用设置</h3>
          <GeneralSettings
            :theme-mode="props.themeMode"
            :import-maa-bak-log="props.importMaaBakLog"
            :json-expand-depth="props.jsonExpandDepth"
            :duration-display="props.durationDisplay"
            @update:theme-mode="handleThemeChange"
            @update:import-maa-bak-log="handleImportMaaBakLogChange"
            @update:json-expand-depth="handleJsonExpandDepthChange"
            @update:duration-display="handleDurationDisplayChange"
          />
        </section>

        <section v-if="isDesktop" id="ai" class="settings-section">
          <h3 class="section-title">AI 设置</h3>
          <AISettings
            :config="props.aiConfig"
            @update:config="handleAIConfigUpdate"
            @save="handleAIConfigSave"
          />
        </section>

        <section id="about" class="settings-section">
          <h3 class="section-title">关于</h3>
          <AboutSettings />
        </section>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.settings-container {
  display: flex;
  height: 100%;
}

.settings-nav {
  width: 160px;
  flex-shrink: 0;
  padding: 12px 0;
  border-right: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
  overflow-y: auto;
  max-height: 560px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  color: var(--n-text-color-2);
  transition: all 0.2s ease;
  text-decoration: none;
}

.nav-item:hover {
  background: var(--n-color-hover);
  color: var(--n-text-color-1);
}

.nav-item.active {
  background: var(--n-color-hover);
  color: var(--n-success-color);
  font-weight: 600;
  border-right: 3px solid var(--n-success-color);
}

.nav-icon {
  font-size: 16px;
}

.nav-label {
  font-size: 14px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  scroll-behavior: smooth;
  text-align: left;
  max-height: 560px;
}

.settings-section {
  padding-bottom: 20px;
  text-align: left;
}

.settings-section:not(:last-child) {
  margin-bottom: 16px;
  border-bottom: 1px solid var(--n-border-color);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--n-primary-color);
  display: inline-block;
  text-align: left;
}
</style>
