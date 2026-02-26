<script setup lang="ts">
import { computed } from "vue";
import type { TaskInfo } from "../types/logTypes";

const props = defineProps<{
  tasks: TaskInfo[];
}>();

interface GanttTask {
  key: string;
  name: string;
  startMs: number;
  endMs: number;
  duration: number;
  status: "running" | "succeeded" | "failed";
  nodes: GanttNode[];
}

interface GanttNode {
  id: number;
  name: string;
  startMs: number;
  endMs: number;
  duration: number;
  status: "success" | "failed";
}

const parseTimestamp = (timestamp: string): number => {
  const date = new Date(timestamp);
  return date.getTime();
};

const ganttTasks = computed<GanttTask[]>(() => {
  return props.tasks.map(task => {
    const startMs = parseTimestamp(task.start_time);
    const endMs = task.end_time ? parseTimestamp(task.end_time) : startMs;
    
    const nodes: GanttNode[] = task.nodes.map(node => {
      const nodeStartMs = parseTimestamp(node.timestamp);
      let nodeEndMs = nodeStartMs;
      
      const nextNode = task.nodes.find(n => n.node_id > node.node_id);
      if (nextNode) {
        nodeEndMs = parseTimestamp(nextNode.timestamp);
      } else if (task.end_time) {
        nodeEndMs = endMs;
      }
      
      return {
        id: node.node_id,
        name: node.name,
        startMs: nodeStartMs,
        endMs: nodeEndMs,
        duration: nodeEndMs - nodeStartMs,
        status: node.status,
      };
    });
    
    return {
      key: task.key,
      name: task.entry,
      startMs,
      endMs,
      duration: endMs - startMs,
      status: task.status,
      nodes,
    };
  }).sort((a, b) => a.startMs - b.startMs);
});

const timeRange = computed(() => {
  if (ganttTasks.value.length === 0) {
    return { min: 0, max: 0, total: 0 };
  }
  
  const allStartTimes = ganttTasks.value.flatMap(t => [
    t.startMs,
    ...t.nodes.map(n => n.startMs)
  ]);
  const allEndTimes = ganttTasks.value.flatMap(t => [
    t.endMs,
    ...t.nodes.map(n => n.endMs)
  ]);
  
  const min = Math.min(...allStartTimes);
  const max = Math.max(...allEndTimes);
  const total = max - min;
  
  return { min, max, total };
});

const getPosition = (ms: number): string => {
  if (timeRange.value.total === 0) return "0%";
  const pos = ((ms - timeRange.value.min) / timeRange.value.total) * 100;
  return `${Math.max(0, Math.min(100, pos))}%`;
};

const getWidth = (startMs: number, endMs: number): string => {
  if (timeRange.value.total === 0) return "100%";
  const width = ((endMs - startMs) / timeRange.value.total) * 100;
  return `${Math.max(1, width)}%`;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case "succeeded":
    case "success":
      return "var(--n-success-color)";
    case "failed":
      return "var(--n-error-color)";
    case "running":
      return "var(--n-info-color)";
    default:
      return "var(--n-border-color)";
  }
};
</script>

<template>
  <div class="gantt-container">
    <div v-if="ganttTasks.length === 0" class="empty">
      暂无任务数据
    </div>
    <div v-else class="gantt-content">
      <div class="gantt-header">
        <div class="task-label">任务 / 节点</div>
        <div class="time-axis">
          <div
            v-for="i in 10"
            :key="i"
            class="time-marker"
            :style="{ left: `${(i - 1) * 10}%` }"
          >
            {{ formatDuration(timeRange.total * (i - 1) / 10) }}
          </div>
        </div>
      </div>
      
      <div class="gantt-body">
        <div
          v-for="task in ganttTasks"
          :key="task.key"
          class="task-row"
        >
          <div class="task-label">
            <span class="task-name" :style="{ color: getStatusColor(task.status) }">
              {{ task.name }}
            </span>
            <span class="task-duration">
              {{ formatDuration(task.duration) }}
            </span>
          </div>
          <div class="task-bar-container">
            <div
              class="task-bar"
              :style="{
                left: getPosition(task.startMs),
                width: getWidth(task.startMs, task.endMs),
                backgroundColor: getStatusColor(task.status),
              }"
            >
              <div class="task-bar-label">
                {{ formatDuration(task.duration) }}
              </div>
            </div>
            
            <div
              v-for="node in task.nodes"
              :key="node.id"
              class="node-bar"
              :style="{
                left: getPosition(node.startMs),
                width: getWidth(node.startMs, node.endMs),
                backgroundColor: getStatusColor(node.status),
              }"
              :title="`${node.name}: ${formatDuration(node.duration)}`"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  background: var(--n-color-modal);
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--n-text-color-3);
  font-size: 14px;
}

.gantt-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.gantt-header {
  display: flex;
  border-bottom: 1px solid var(--n-border-color);
  background: var(--n-color);
  flex-shrink: 0;
}

.task-label {
  width: 200px;
  padding: 12px;
  border-right: 1px solid var(--n-border-color);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.task-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-duration {
  color: var(--n-text-color-3);
  font-size: 12px;
  flex-shrink: 0;
}

.time-axis {
  flex: 1;
  position: relative;
  height: 44px;
  padding: 12px;
  box-sizing: border-box;
}

.time-marker {
  position: absolute;
  top: 12px;
  font-size: 11px;
  color: var(--n-text-color-3);
  transform: translateX(-50%);
}

.gantt-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.task-row {
  display: flex;
  border-bottom: 1px solid var(--n-border-color);
  min-height: 56px;
}

.task-bar-container {
  flex: 1;
  position: relative;
  padding: 8px 12px;
  box-sizing: border-box;
  background: var(--n-color);
}

.task-bar {
  position: absolute;
  height: 20px;
  border-radius: 4px;
  top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: white;
  font-weight: 500;
  opacity: 0.7;
  min-width: 40px;
  overflow: hidden;
}

.task-bar-label {
  padding: 0 4px;
  white-space: nowrap;
}

.node-bar {
  position: absolute;
  height: 12px;
  border-radius: 2px;
  top: 32px;
  opacity: 0.9;
  min-width: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.node-bar:hover {
  opacity: 1;
  z-index: 1;
}
</style>