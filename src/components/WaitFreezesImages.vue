<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { NImage, NImageGroup, NCollapse, NCollapseItem } from "naive-ui";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

const props = defineProps<{
  visionDir: string;
  nodeName: string;
  startTime?: string;
  endTime?: string;
}>();

const imageUrls = ref<string[]>([]);

function parseTimestampToMs(ts: string): number {
  return new Date(ts).getTime();
}

function parseFileTimeToMs(fileName: string): number | null {
  const match = fileName.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})\.(\d{3})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, ms] = match;
  const dateStr = `${year}-${month}-${day} ${hour}:${minute}:${second}.${ms}`;
  return new Date(dateStr).getTime();
}

async function loadImages() {
  if (!props.nodeName || !props.visionDir) return;
  if (!props.startTime && !props.endTime) {
    imageUrls.value = [];
    return;
  }

  try {
    const entries = await readDir(props.visionDir);
    const pattern = `_${props.nodeName}_wait_freezes.jpg`;

    const startMs = props.startTime ? parseTimestampToMs(props.startTime) : -Infinity;
    const endMs = props.endTime ? parseTimestampToMs(props.endTime) : Infinity;

    const matched = entries
      .filter((entry) => {
        if (!entry.name || !entry.name.endsWith(pattern)) return false;
        const fileMs = parseFileTimeToMs(entry.name);
        if (fileMs === null) return false;
        return fileMs >= startMs && fileMs <= endMs;
      })
      .map((entry) => entry.name!)
      .sort();

    const urls = await Promise.all(
      matched.map(async (name) => {
        const filePath = await join(props.visionDir, name);
        return convertFileSrc(filePath);
      })
    );
    imageUrls.value = urls;
  } catch (err) {
    console.error("Failed to load wait_freezes images:", err);
    imageUrls.value = [];
  }
}

watch([() => props.nodeName, () => props.startTime, () => props.endTime, () => props.visionDir], loadImages);

onMounted(loadImages);
</script>

<template>
  <div v-if="imageUrls.length > 0" class="wait-freezes-images">
    <n-collapse :default-expanded-names="['wait-freezes']">
      <n-collapse-item name="wait-freezes">
        <template #header>
          <span>Wait Freezes 截图 ({{ imageUrls.length }})</span>
        </template>
        <div class="image-grid">
          <n-image-group v-if="imageUrls.length > 1">
            <n-image
              v-for="(url, idx) in imageUrls"
              :key="idx"
              :src="url"
              :alt="`${nodeName}-wait-freezes-${idx + 1}`"
              width="240"
              object-fit="contain"
              style="margin: 4px"
            />
          </n-image-group>
          <n-image
            v-else
            :src="imageUrls[0]"
            :alt="`${nodeName}-wait-freezes`"
            width="320"
            object-fit="contain"
          />
        </div>
      </n-collapse-item>
    </n-collapse>
  </div>
</template>

<style scoped>
.wait-freezes-images {
  margin-top: 12px;
}

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
