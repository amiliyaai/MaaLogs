<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { NModal } from "naive-ui";
import GeneralSettings from "./settings/GeneralSettings.vue";
import AISettings from "./settings/AISettings.vue";
import type { AIConfig } from "@/config/ai";

type ThemeMode = "light" | "dark" | "auto";

const props = defineProps<{
  show: boolean;
  themeMode: ThemeMode;
  aiConfig: AIConfig | null;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "update:theme-mode", value: ThemeMode): void;
  (e: "update:ai-config", value: AIConfig): void;
  (e: "save-ai-config", value: AIConfig): void;
}>();

const contentRef = ref<HTMLElement | null>(null);
const activeSection = ref("general");

const sections = [
  { id: "general", label: "通用设置", icon: "⚙️" },
  { id: "ai", label: "AI 设置", icon: "🤖" },
];

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
    const offsetTop = htmlSection.offsetTop - 20;
    const height = htmlSection.offsetHeight;

    if (scrollTop >= offsetTop && scrollTop < offsetTop + height) {
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
    style="width: 680px; max-width: 90vw; height: 480px; max-height: 80vh"
    :bordered="false"
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
          <GeneralSettings :theme-mode="props.themeMode" @update:theme-mode="handleThemeChange" />
        </section>

        <section id="ai" class="settings-section">
          <h3 class="section-title">AI 设置</h3>
          <AISettings
            :config="props.aiConfig"
            @update:config="handleAIConfigUpdate"
            @save="handleAIConfigSave"
          />
        </section>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.settings-container {
  display: flex;
  height: 100%;
  margin: -12px -20px;
}

.settings-nav {
  width: 160px;
  flex-shrink: 0;
  padding: 8px 0;
  border-right: 1px solid var(--n-border-color);
  background: var(--n-color-modal);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
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
  color: var(--n-primary-color);
  border-right: 2px solid var(--n-primary-color);
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
  padding: 16px 24px;
  scroll-behavior: smooth;
}

.settings-section {
  padding-bottom: 32px;
  margin-bottom: 16px;
}

.settings-section:not(:last-child) {
  border-bottom: 1px solid var(--n-border-color);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--n-text-color-1);
  margin: 0 0 16px 0;
  padding-bottom: 8px;
}
</style>
