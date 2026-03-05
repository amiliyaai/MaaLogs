<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { NTag, NImage, NImageGroup } from "naive-ui";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { RecognitionDetail } from "@/types/logTypes";

const props = withDefaults(
  defineProps<{
    node: RecognitionDetail;
    depth?: number;
    visionDir?: string;
    isRoot?: boolean;
    visionOnly?: boolean;
  }>(),
  {
    depth: 0,
    visionDir: undefined,
    isRoot: false,
    visionOnly: false,
  }
);

const expanded = ref(props.depth < 2);
const imageUrls = ref<string[]>([]);

const hasChildren = computed(() => {
  return Array.isArray(props.node.detail) && props.node.detail.length > 0;
});

const scores = computed(() => {
  const detail = props.node.detail as Record<string, unknown> | undefined;
  if (!detail || typeof detail !== "object") return [];

  if (detail.best && typeof detail.best === "object") {
    const best = detail.best as Record<string, unknown>;
    if (typeof best.score === "number") {
      return [best.score];
    }
  }

  if (typeof detail.score === "number") {
    return [detail.score];
  }

  if (typeof detail.best_score === "number") {
    return [detail.best_score];
  }

  if (Array.isArray(detail.filtered) && detail.filtered.length > 0) {
    const filteredScores = detail.filtered
      .map((item) => (item as Record<string, unknown>)?.score)
      .filter((s): s is number => typeof s === "number");
    if (filteredScores.length > 0) {
      return filteredScores;
    }
  }

  if (Array.isArray(detail.all) && detail.all.length > 0) {
    const allScores = detail.all
      .map((item) => (item as Record<string, unknown>)?.score)
      .filter((s): s is number => typeof s === "number");
    if (allScores.length > 0) {
      return allScores;
    }
  }

  return [];
});

const scoreDisplay = computed(() => {
  if (scores.value.length === 0) return null;
  if (scores.value.length === 1) {
    return scores.value[0].toFixed(3);
  }
  return scores.value.map((s) => s.toFixed(3)).join(", ");
});

const algorithmColor = computed((): "success" | "warning" | "info" | "error" | "default" => {
  const map: Record<string, "success" | "warning" | "info" | "error"> = {
    And: "warning",
    Or: "info",
    TemplateMatch: "success",
    OCR: "error",
    DirectHit: "success",
  };
  return props.node.algorithm ? map[props.node.algorithm] || "default" : "default";
});

async function loadImage() {
  if (!props.node.name || !props.visionDir) return;

  try {
    const entries = await readDir(props.visionDir);
    const matched: string[] = [];

    if (props.node.reco_id) {
      const pattern = `_${props.node.name}_${props.node.reco_id}.jpg`;
      const recoMatched = entries
        .filter((entry) => entry.name && entry.name.endsWith(pattern))
        .map((entry) => entry.name!);
      matched.push(...recoMatched);
    }

    matched.sort();

    if (matched.length > 0) {
      const urls = await Promise.all(
        matched.map(async (name) => {
          const filePath = await join(props.visionDir!, name);
          return convertFileSrc(filePath);
        })
      );
      imageUrls.value = urls;
    }
  } catch (err) {
    console.error("Failed to load vision image:", err);
  }
}

function toggleExpand() {
  expanded.value = !expanded.value;
}

onMounted(() => {
  loadImage();
});
</script>

<template>
  <div v-if="visionOnly" class="recognition-tree">
    <div v-if="imageUrls.length > 0" class="image-preview">
      <n-image-group v-if="imageUrls.length > 1">
        <n-image
          v-for="(url, idx) in imageUrls"
          :key="idx"
          :src="url"
          :alt="`${node.name}-${idx + 1}`"
          width="320"
          object-fit="contain"
          style="margin-right: 8px"
        />
      </n-image-group>
      <n-image v-else :src="imageUrls[0]" :alt="node.name" width="320" object-fit="contain" />
    </div>
    <span v-else class="no-vision">无此id截图或目录里没有vision文件夹</span>
  </div>

  <template v-else-if="isRoot && hasChildren">
    <template v-for="(child, idx) in node.detail" :key="`${depth}-${idx}-${(child as RecognitionDetail)?.reco_id || idx}`">
      <RecognitionTree
        v-if="child && typeof child === 'object'"
        :node="child as RecognitionDetail"
        :depth="depth"
        :vision-dir="visionDir"
      />
    </template>
  </template>

  <div v-else-if="node.name || node.reco_id" class="recognition-tree" :style="{ paddingLeft: `${depth * 16}px` }">
    <div class="tree-node">
      <span v-if="hasChildren" class="toggle" @click="toggleExpand">
        {{ expanded ? "▼" : "▶" }}
      </span>
      <n-tag v-if="node.algorithm" :type="algorithmColor" size="small">{{ node.algorithm }}</n-tag>
      <span v-if="node.name" class="node-name">{{ node.name }}</span>
      <span v-if="node.reco_id" class="node-id">ID: [{{ node.reco_id }}]</span>
      <span v-if="node.box" class="node-box">box: [{{ node.box.join(", ") }}]</span>
      <span v-if="scoreDisplay" class="node-score">score: {{ scoreDisplay }}</span>
    </div>

    <div v-if="imageUrls.length > 0" class="image-preview" :style="{ paddingLeft: `${depth * 16 + 24}px` }">
      <n-image-group v-if="imageUrls.length > 1">
        <n-image
          v-for="(url, idx) in imageUrls"
          :key="idx"
          :src="url"
          :alt="`${node.name}-${idx + 1}`"
          width="320"
          object-fit="contain"
          style="margin-right: 8px"
        />
      </n-image-group>
      <n-image v-else :src="imageUrls[0]" :alt="node.name" width="320" object-fit="contain" />
    </div>

    <div v-if="hasChildren && expanded" class="children">
      <template v-for="(child, idx) in node.detail" :key="`${depth}-${idx}-${(child as RecognitionDetail)?.reco_id || idx}`">
        <RecognitionTree
          v-if="child && typeof child === 'object'"
          :node="child as RecognitionDetail"
          :depth="depth + 1"
          :vision-dir="visionDir"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.recognition-tree {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
}
.tree-node {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}
.toggle {
  width: 16px;
  text-align: center;
  cursor: pointer;
  user-select: none;
  color: #999;
}
.node-name {
  font-weight: 500;
}
.node-id,
.node-box,
.node-score {
  color: #666;
}
.image-preview {
  margin: 8px 0;
  padding: 8px;
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 6px;
  display: inline-block;
}
.children {
  border-left: 1px dashed #ddd;
  margin-left: 8px;
}
.no-vision {
  color: #999;
  font-size: 12px;
}
</style>
