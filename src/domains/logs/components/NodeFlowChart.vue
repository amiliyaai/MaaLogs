<script setup lang="ts">
import { ref, watch } from "vue";
import { VueFlow, useVueFlow, Position } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import { MiniMap } from "@vue-flow/minimap";
import { NEmpty } from "naive-ui";
import dagre from "dagre";
import type { NodeInfo } from "../types/logTypes";

interface Props {
  nodes: NodeInfo[];
  selectedNodeId: number | null;
  height?: string;
}

const props = withDefaults(defineProps<Props>(), {
  height: "400px",
});

const emit = defineEmits<{
  (e: "select-node", nodeId: number): void;
}>();

const { fitView } = useVueFlow();

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 160;
const nodeHeight = 56;

const flowNodes = ref<any[]>([]);
const flowEdges = ref<any[]>([]);

const getMiniMapNodeColor = (node: any) => {
  if (node.data?.isSuccess) return "#52c41a";
  if (node.data?.isFailed) return "#f5222d";
  return "#8c8c8c";
};

const statusConfig: Record<string, { bg: string; border: string; text: string; icon: string; label: string }> = {
  success: { 
    bg: "linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)", 
    border: "#52c41a", 
    text: "#237804",
    icon: "✓",
    label: "成功"
  },
  failed: { 
    bg: "linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%)", 
    border: "#f5222d", 
    text: "#a8071a",
    icon: "✗",
    label: "失败"
  },
  running: { 
    bg: "linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)", 
    border: "#1890ff", 
    text: "#0050b3",
    icon: "⟳",
    label: "运行中"
  },
  waiting: { 
    bg: "linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%)", 
    border: "#8c8c8c", 
    text: "#595959",
    icon: "○",
    label: "等待"
  },
};

const getStatus = (status?: string) => statusConfig[status || "waiting"];
const getNodeName = (node: { node_id: number; name: string }) => node.name || `Node ${node.node_id}`;
const getEdgeColor = (isJumpBack: boolean, isRunning: boolean) => {
  if (isJumpBack) return "#f5222d";
  if (isRunning) return "#1890ff";
  return "#bfbfbf";
};
const getNodeStatus = (status?: string) => (status || "waiting") as string;

const getLayoutedElements = () => {
  if (!props.nodes || props.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  dagreGraph.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 70 });

  const nodesWithEdges = props.nodes.map((node, index) => {
    const nodeStatus = getNodeStatus(node.status);
    const status = getStatus(nodeStatus);
    const orderNum = index + 1;
    const nodeName = getNodeName(node);
    
    return {
      id: String(node.node_id),
      type: "custom",
      position: { x: 0, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        orderNum,
        nodeName,
        status: status.label,
        icon: status.icon,
        isSuccess: nodeStatus === "success",
        isFailed: nodeStatus === "failed",
        isRunning: nodeStatus === "running",
      },
      style: {
        background: "transparent",
        border: "none",
        boxShadow: "none",
      },
    };
  });

  const edges: any[] = [];
  const nodeMap = new Map(props.nodes.map((n, idx) => [n.name || `Node ${n.node_id}`, { id: n.node_id, index: idx }]));

  props.nodes.forEach((node, nodeIdx) => {
    const nodeStatus = getNodeStatus(node.status);
    const isRunning = nodeStatus === "running";
    node.next_list?.forEach((nextItem) => {
      const nodeInfo = nodeMap.get(nextItem.name);
      if (nodeInfo) {
        const jumpBack = nextItem.jump_back;
        const isJumpBack = Boolean(jumpBack);
        const edgeOrder = nodeIdx + 1;
        edges.push({
          id: `${node.node_id}-${nodeInfo.id}`,
          source: String(node.node_id),
          target: String(nodeInfo.id),
          type: "smoothstep",
          animated: isJumpBack || isRunning,
          style: {
            stroke: getEdgeColor(isJumpBack, isRunning),
            strokeWidth: isJumpBack ? 2.5 : 2,
          },
          markerEnd: {
            type: "arrowclosed",
            color: getEdgeColor(isJumpBack, isRunning),
          },
          label: nextItem.anchor ? "🔗" : `${edgeOrder}→${nodeInfo.index + 1}`,
          labelStyle: { fill: "#8c8c8c", fontSize: 10, fontWeight: 500 },
          labelBgStyle: { fill: "#fff", stroke: "#e8e8e8" },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        });
      }
    });
  });

  nodesWithEdges.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodesWithEdges.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      };
    }
  });

  return { nodes: nodesWithEdges, edges };
};

watch(
  () => [props.nodes, props.selectedNodeId],
  () => {
    const result = getLayoutedElements();
    flowNodes.value = result.nodes;
    flowEdges.value = result.edges;
    setTimeout(() => {
      fitView({ padding: 0.15 });
    }, 100);
  },
  { immediate: true, deep: true }
);

const handleNodeClick = (_event: any) => {
  // 点击节点不触发选中
};

const CustomNode = {
  props: ["data", "selected"],
  template: `
    <div 
      class="custom-node"
      :class="{ 
        'is-success': data.isSuccess, 
        'is-failed': data.isFailed,
        'is-running': data.isRunning,
        'is-selected': selected
      }"
    >
      <div class="node-order">{{ data.orderNum }}</div>
      <div class="node-content">
        <div class="node-icon">{{ data.icon }}</div>
        <div class="node-info">
          <div class="node-name">{{ data.nodeName }}</div>
          <div class="node-status">{{ data.status }}</div>
        </div>
      </div>
    </div>
  `,
};

defineExpose({ CustomNode });
</script>

<template>
  <div v-if="flowNodes.length > 0" class="flow-chart" :style="{ height }">
    <VueFlow
      v-model:nodes="flowNodes"
      v-model:edges="flowEdges"
      :fit-view-on-init="true"
      :default-viewport="{ zoom: 0.7 }"
      :node-types="{ custom: CustomNode }"
      @node-click="handleNodeClick"
    >
      <Background pattern-color="#f0f0f0" :gap="20" />
      <Controls position="bottom-right" />
      <MiniMap
        position="bottom-left"
        :node-color="getMiniMapNodeColor"
        :mask-color="'rgba(0, 0, 0, 0.08)'"
        style="width: 120px; height: 80px"
      />
    </VueFlow>
  </div>
  <div v-else class="flow-chart-empty" :style="{ height }">
    <n-empty description="暂无节点数据" />
  </div>
</template>

<style scoped>
.flow-chart {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #fafafa;
}

.flow-chart-empty {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: var(--n-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.vue-flow__node-custom) {
  width: 160px;
  height: 56px;
}

:deep(.custom-node) {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  display: flex;
  align-items: center;
  padding: 6px;
  gap: 10px;
  cursor: pointer;
  transition: all 0.25s ease;
  border: 2px solid transparent;
  background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

:deep(.custom-node:hover) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

:deep(.custom-node.is-selected) {
  border-color: #1890ff;
  box-shadow: 0 0 0 4px rgba(24, 144, 255, 0.2), 0 6px 16px rgba(0, 0, 0, 0.12);
}

:deep(.custom-node.is-success) {
  background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%);
  border-color: #b7eb8f;
}

:deep(.custom-node.is-failed) {
  background: linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%);
  border-color: #ffccc7;
}

:deep(.custom-node.is-running) {
  background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
  border-color: #91d5ff;
}

:deep(.node-order) {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #595959;
  flex-shrink: 0;
}

:deep(.is-success .node-order) {
  background: #52c41a;
  color: #fff;
}

:deep(.is-failed .node-order) {
  background: #f5222d;
  color: #fff;
}

:deep(.is-running .node-order) {
  background: #1890ff;
  color: #fff;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

:deep(.node-content) {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

:deep(.node-icon) {
  font-size: 18px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
}

:deep(.is-success .node-icon) {
  color: #52c41a;
}

:deep(.is-failed .node-icon) {
  color: #f5222d;
}

:deep(.is-running .node-icon) {
  color: #1890ff;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

:deep(.node-info) {
  flex: 1;
  min-width: 0;
}

:deep(.node-name) {
  font-size: 13px;
  font-weight: 600;
  color: #262626;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.node-status) {
  font-size: 11px;
  color: #8c8c8c;
  margin-top: 2px;
}

:deep(.is-success .node-status) {
  color: #52c41a;
}

:deep(.is-failed .node-status) {
  color: #f5222d;
}

:deep(.is-running .node-status) {
  color: #1890ff;
}

:deep(.vue-flow__edge-text) {
  font-size: 10px;
  font-weight: 500;
}

:deep(.vue-flow__controls) {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: none;
}

:deep(.vue-flow__controls-button) {
  border: none;
  background: #fff;
  width: 28px;
  height: 28px;
}

:deep(.vue-flow__controls-button:hover) {
  background: #f5f5f5;
}

:deep(.vue-flow__controls-button svg) {
  fill: #595959;
}

:deep(.vue-flow__minimap) {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: none;
}

:deep(.vue-flow__background) {
  background: #fafafa;
}
</style>
