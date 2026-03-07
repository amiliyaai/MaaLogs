<template>
  <div
    class="path-node"
    :class="[statusClass, compareClass]"
    @click="emit('click', node)"
  >
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
  background: #f5f7fa;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.path-node:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.path-node.success {
  border-color: #10b981;
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
}

.path-node.failed {
  border-color: #ef4444;
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
}

.path-node.skipped {
  border-color: #9ca3af;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
}

.path-node.equal {
  border-color: #10b981;
}

.path-node.diverged {
  border-color: #f59e0b;
}

.path-node.a-only {
  border-color: #3b82f6;
}

.path-node.b-only {
  border-color: #8b5cf6;
}

.node-name {
  font-weight: 500;
  color: #374151;
}

.loop-count {
  color: #f59e0b;
  font-weight: 600;
}

.node-index {
  color: #9ca3af;
  font-size: 12px;
  margin-left: auto;
}
</style>
