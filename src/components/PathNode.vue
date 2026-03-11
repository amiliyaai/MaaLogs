<template>
  <div class="path-node" :class="[statusClass, compareClass]" @click="emit('click', node)">
    <span class="node-icon">{{ icon }}</span>
    <span class="node-name">{{ node.name }}</span>
    <span v-if="node.loopCount && node.loopCount > 1" class="loop-count">
      ×{{ node.loopCount }}
    </span>
    <span class="node-index">#{{ node.executionIndex }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PathNode } from "@/types/logTypes";

const props = defineProps<{
  node: PathNode;
}>();

const emit = defineEmits<{
  click: [node: PathNode];
}>();

const statusClass = computed(() => {
  switch (props.node.status) {
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    default:
      return "";
  }
});

const compareClass = computed(() => {
  switch (props.node.compareStatus) {
    case "equal":
      return "equal";
    case "diverged":
      return "diverged";
    case "a_only":
      return "a-only";
    case "b_only":
      return "b-only";
    default:
      return "";
  }
});

const icon = computed(() => {
  switch (props.node.compareStatus) {
    case "equal":
      return "⭕";
    case "diverged":
      return "⚡";
    case "a_only":
      return "🔵";
    case "b_only":
      return "🟣";
    default:
      return "⚪";
  }
});
</script>

<style scoped>
.path-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  background: var(--n-color-fill);
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.path-node:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.path-node.success {
  border-color: var(--n-success-color);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(16, 185, 129, 0.05));
}

.path-node.failed {
  border-color: var(--n-error-color);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
}

.path-node.skipped {
  border-color: var(--n-text-color-3);
  background: linear-gradient(135deg, rgba(156, 163, 175, 0.15), rgba(156, 163, 175, 0.05));
}

.path-node.equal {
  border-color: var(--n-success-color);
}

.path-node.diverged {
  border-color: var(--n-warning-color);
}

.path-node.a-only {
  border-color: var(--n-info-color);
}

.path-node.b-only {
  border-color: #a78bfa;
}

.node-name {
  font-weight: 500;
  color: var(--n-text-color-1);
}

.loop-count {
  color: var(--n-warning-color);
  font-weight: 600;
}

.node-index {
  color: var(--n-text-color-3);
  font-size: 12px;
  margin-left: auto;
}
</style>
