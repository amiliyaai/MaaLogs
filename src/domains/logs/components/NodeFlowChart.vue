<script setup lang="ts">
import { ref, watch } from "vue";
import { VueFlow, useVueFlow } from "@vue-flow/core";
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
  height: "250px",
});

const emit = defineEmits<{
  (e: "select-node", nodeId: number): void;
}>();

const { fitView } = useVueFlow();

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 180;
const nodeHeight = 40;

const flowNodes = ref<any[]>([]);
const flowEdges = ref<any[]>([]);

const getLayoutedElements = () => {
  if (!props.nodes || props.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  dagreGraph.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 80 });

  const nodesWithEdges = props.nodes.map((node) => ({
    id: String(node.node_id),
    data: { label: node.name || `Node ${node.node_id}`, status: node.status },
    position: { x: 0, y: 0 },
    style: {
      background: node.status === "failed" ? "#fff1f0" : "#f6ffed",
      border: node.status === "failed" ? "1px solid #d03050" : "1px solid #18a058",
      color: node.status === "failed" ? "#d03050" : "#18a058",
      borderRadius: "6px",
      padding: "8px 12px",
      fontSize: "12px",
    },
    selected: node.node_id === props.selectedNodeId,
  }));

  const edges: any[] = [];
  const nodeMap = new Map(props.nodes.map((n) => [n.name || `Node ${n.node_id}`, n.node_id]));

  props.nodes.forEach((node) => {
    node.next_list?.forEach((nextItem) => {
      const targetNodeId = nodeMap.get(nextItem.name);
      if (targetNodeId !== undefined) {
        edges.push({
          id: `${node.node_id}-${targetNodeId}`,
          source: String(node.node_id),
          target: String(targetNodeId),
          type: "smoothstep",
          animated: nextItem.jump_back,
          style: {
            stroke: nextItem.jump_back ? "#f5222d" : "#999",
            strokeWidth: nextItem.jump_back ? 2 : 1,
          },
          label: nextItem.anchor ? "anchor" : undefined,
          labelStyle: { fill: "#666", fontSize: 10 },
          labelBgStyle: { fill: "#fff", stroke: "#ddd" },
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
      fitView({ padding: 0.2 });
    }, 100);
  },
  { immediate: true, deep: true }
);

const handleNodeClick = (event: any) => {
  const nodeId = parseInt(event.node.id);
  emit("select-node", nodeId);
};
</script>

<template>
  <div v-if="flowNodes.length > 0" class="flow-chart" :style="{ height }">
    <VueFlow
      v-model:nodes="flowNodes"
      v-model:edges="flowEdges"
      :fit-view-on-init="true"
      :default-viewport="{ zoom: 0.8 }"
      @node-click="handleNodeClick"
    >
      <Background pattern-color="#eee" :gap="16" />
      <Controls />
      <MiniMap
        node-color="#999"
        :mask-color="'rgba(0, 0, 0, 0.1)'"
        style="width: 100px; height: 60px"
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
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--n-color);
}

.flow-chart-empty {
  width: 100%;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--n-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.vue-flow__node) {
  cursor: pointer;
}

:deep(.vue-flow__edge-text) {
  font-size: 10px;
}
</style>
