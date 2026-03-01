<script setup lang="ts">
import { ref, watch, defineComponent, h, type PropType } from "vue";
import { VueFlow, useVueFlow, Position, MarkerType, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import { MiniMap } from "@vue-flow/minimap";
import { NEmpty } from "naive-ui";
import ELK from "elkjs/lib/elk.bundled.js";
import type { NodeInfo } from "../types/logTypes";

interface Props {
  nodes: NodeInfo[];
  selectedNodeId: number | null;
  height?: string;
}

const props = withDefaults(defineProps<Props>(), {
  height: "400px",
});

const { fitView } = useVueFlow();

const elk = new ELK();

const nodeWidth = 180;
const nodeHeight = 64;

type FlowNodeData = {
  orderNum: number;
  nodeName: string;
  status: string;
  icon: string;
  bg: string;
  border: string;
  shadow: string;
  isSuccess: boolean;
  isFailed: boolean;
  isRunning: boolean;
};

const flowNodes = ref<Node<FlowNodeData>[]>([]);
const flowEdges = ref<Edge[]>([]);

const getMiniMapNodeColor = (node: Node<FlowNodeData>) => {
  if (node.data?.isSuccess) return "#52c41a";
  if (node.data?.isFailed) return "#f5222d";
  return "#1890ff";
};

const getNodeStatus = (status?: string) => (status || "waiting") as string;

const getEdgeColor = (isJumpBack: boolean, isRunning: boolean) => {
  if (isJumpBack) return "#f5222d";
  if (isRunning) return "#1890ff";
  return "#91d5ff";
};

const statusStyles: Record<
  string,
  { bg: string; border: string; icon: string; label: string; shadow: string }
> = {
  success: {
    bg: "linear-gradient(135deg, #52c41a 0%, #73d13d 100%)",
    border: "#52c41a",
    icon: "✓",
    label: "成功",
    shadow: "0 4px 12px rgba(82, 196, 26, 0.3)",
  },
  failed: {
    bg: "linear-gradient(135deg, #f5222d 0%, #ff7875 100%)",
    border: "#f5222d",
    icon: "✗",
    label: "失败",
    shadow: "0 4px 12px rgba(245, 34, 45, 0.3)",
  },
  running: {
    bg: "linear-gradient(135deg, #1890ff 0%, #40a9ff 100%)",
    border: "#1890ff",
    icon: "⟳",
    label: "运行中",
    shadow: "0 4px 12px rgba(24, 144, 255, 0.3)",
  },
  waiting: {
    bg: "linear-gradient(135deg, #8c8c8c 0%, #bfbfbf 100%)",
    border: "#8c8c8c",
    icon: "○",
    label: "等待",
    shadow: "0 4px 12px rgba(140, 140, 140, 0.3)",
  },
};

const getLayoutedElements = async () => {
  if (!props.nodes || props.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const uniqueNodeMap = new Map<string, { node: (typeof props.nodes)[0]; index: number }>();
  props.nodes.forEach((node, index) => {
    const nodeName = node.name || `Node ${node.node_id}`;
    if (!uniqueNodeMap.has(nodeName)) {
      uniqueNodeMap.set(nodeName, { node, index });
    }
  });

  const nodesWithEdges = Array.from(uniqueNodeMap.entries()).map(([nodeName, { node, index }]) => {
    const nodeStatus = getNodeStatus(node.status);
    const style = statusStyles[nodeStatus] || statusStyles.waiting;
    const orderNum = index + 1;

    return {
      id: nodeName,
      type: "custom",
      position: { x: 0, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        orderNum,
        nodeName,
        status: style.label,
        icon: style.icon,
        bg: style.bg,
        border: style.border,
        shadow: style.shadow,
        isSuccess: nodeStatus === "success",
        isFailed: nodeStatus === "failed",
        isRunning: nodeStatus === "running",
      },
    };
  });

  const edges: Edge[] = [];
  const nameToNodeMap = new Map(
    Array.from(uniqueNodeMap.entries()).map(([name, { index }]) => [name, { id: name, index }])
  );

  props.nodes.forEach((node, nodeIdx) => {
    const nodeStatus = getNodeStatus(node.status);
    const isRunning = nodeStatus === "running";
    const sourceName = node.name || `Node ${node.node_id}`;
    node.next_list?.forEach((nextItem) => {
      const targetInfo = nameToNodeMap.get(nextItem.name);
      if (targetInfo) {
        const jumpBack = nextItem.jump_back;
        const isJumpBack = Boolean(jumpBack);
        const edgeOrder = nodeIdx + 1;
        edges.push({
          id: `${sourceName}-${targetInfo.id}-${nodeIdx}`,
          source: sourceName,
          target: targetInfo.id,
          type: "smoothstep",
          animated: isJumpBack || isRunning,
          style: {
            stroke: getEdgeColor(isJumpBack, isRunning),
            strokeWidth: isJumpBack ? 3 : 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: getEdgeColor(isJumpBack, isRunning),
          },
          label: nextItem.anchor ? "🔗" : `${edgeOrder}→${targetInfo.index + 1}`,
          labelStyle: { fill: "#fff", fontSize: 10, fontWeight: 600 },
          labelBgStyle: { fill: getEdgeColor(isJumpBack, isRunning), stroke: "none" },
          labelBgPadding: [6, 2] as [number, number],
          labelBgBorderRadius: 4,
        });
      }
    });
  });

  const elkNodes = nodesWithEdges.map((node) => ({
    id: node.id,
    width: nodeWidth,
    height: nodeHeight,
  }));

  const elkEdges = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  try {
    const layoutedGraph = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
        "elk.spacing.nodeNode": "60",
        "elk.direction": "DOWN",
      },
      children: elkNodes,
      edges: elkEdges,
    });

    if (layoutedGraph.children) {
      layoutedGraph.children.forEach((elkNode) => {
        const node = nodesWithEdges.find((n) => n.id === elkNode.id);
        if (node && elkNode.x && elkNode.y) {
          node.position = {
            x: elkNode.x,
            y: elkNode.y,
          };
        }
      });
    }
  } catch (e) {
    console.error("ELK layout error:", e);
  }

  const validNodes = nodesWithEdges.filter(
    (n) => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
  );
  const validEdges = edges.filter((e) => e.source && e.target);

  return { nodes: validNodes, edges: validEdges };
};

const CustomNode = defineComponent({
  props: {
    id: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    data: {
      type: Object as PropType<FlowNodeData>,
      required: true,
    },
    selected: {
      type: Boolean,
      required: true,
    },
    connectable: {
      type: Boolean,
      required: true,
    },
    position: {
      type: Object as PropType<{ x: number; y: number }>,
      required: true,
    },
    dimensions: {
      type: Object as PropType<{ width: number; height: number }>,
      required: true,
    },
    dragging: {
      type: Boolean,
      required: true,
    },
    resizing: {
      type: Boolean,
      required: true,
    },
    zIndex: {
      type: Number,
      required: true,
    },
    events: {
      type: Object as PropType<any>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const { data, selected, zIndex } = props;
      return h(
        "div",
        {
          class: [
            "flow-node",
            selected && "is-selected",
            data.isSuccess && "is-success",
            data.isFailed && "is-failed",
            data.isRunning && "is-running",
          ],
          style: { background: data.bg, boxShadow: data.shadow, zIndex },
        },
        [
          h("div", { class: "node-order" }, data.orderNum),
          h("div", { class: "node-content" }, [
            h("div", { class: "node-icon" }, data.icon),
            h("div", { class: "node-info" }, [
              h("div", { class: "node-name" }, data.nodeName),
              h("div", { class: "node-status" }, data.status),
            ]),
          ]),
        ]
      );
    };
  },
});

const nodeTypes = {
  custom: CustomNode,
};

watch(
  () => [props.nodes, props.selectedNodeId],
  async () => {
    const result = await getLayoutedElements();
    flowNodes.value = result.nodes;
    flowEdges.value = result.edges;
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
  },
  { immediate: true, deep: true }
);
</script>

<template>
  <div v-if="flowNodes.length > 0 && flowEdges.length > 0" class="flow-chart" :style="{ height }">
    <VueFlow
      v-model:nodes="flowNodes"
      v-model:edges="flowEdges"
      :fit-view-on-init="true"
      :default-viewport="{ zoom: 0.8 }"
      :node-types="nodeTypes"
    >
      <Background pattern-color="#e8f4ff" :gap="16" />
      <Controls position="bottom-right" />
      <MiniMap
        position="bottom-left"
        :node-color="getMiniMapNodeColor"
        :mask-color="'rgba(24, 144, 255, 0.1)'"
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
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(180deg, #f0f9ff 0%, #e6f7ff 100%);
}

.flow-chart-empty {
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  background: var(--n-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.vue-flow__node-custom) {
  width: 180px;
  height: 64px;
}

:deep(.flow-node) {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 8px;
  gap: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid rgba(255, 255, 255, 0.5);
  color: #fff;
}

:deep(.flow-node:hover) {
  transform: scale(1.05);
}

:deep(.flow-node.is-selected) {
  border-color: #fff;
  transform: scale(1.08);
}

:deep(.flow-node.is-running .node-icon) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

:deep(.node-order) {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  backdrop-filter: blur(4px);
}

:deep(.node-content) {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

:deep(.node-icon) {
  font-size: 20px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  flex-shrink: 0;
}

:deep(.node-info) {
  flex: 1;
  min-width: 0;
}

:deep(.node-name) {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

:deep(.node-status) {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 2px;
}

:deep(.vue-flow__edge-text) {
  font-size: 10px;
  font-weight: 600;
}

:deep(.vue-flow__controls) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.15);
  border: none;
}

:deep(.vue-flow__controls-button) {
  border: none;
  background: #fff;
  width: 32px;
  height: 32px;
}

:deep(.vue-flow__controls-button:hover) {
  background: #e6f7ff;
}

:deep(.vue-flow__controls-button svg) {
  fill: #1890ff;
}

:deep(.vue-flow__minimap) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.15);
  border: none;
}

:deep(.vue-flow__background) {
  background: linear-gradient(180deg, #f0f9ff 0%, #e6f7ff 100%);
}
</style>
