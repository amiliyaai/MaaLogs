<script setup lang="ts">
import { NButton, NCard, NCheckbox, NInput, NSelect } from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import type { SearchResult } from "../types/logTypes";

defineProps<{
  searchText: string;
  searchCaseSensitive: boolean;
  searchUseRegex: boolean;
  hideDebugInfo: boolean;
  searchMaxResults: number;
  searchResults: SearchResult[];
  searchMessage: string;
  quickSearchOptions: string[];
  hasRawLines: boolean;
  searchItemHeight: number;
  splitMatch: (line: string, start: number, end: number) => { before: string; match: string; after: string };
}>();

const emit = defineEmits<{
  (e: "update:searchText", value: string): void;
  (e: "update:searchCaseSensitive", value: boolean): void;
  (e: "update:searchUseRegex", value: boolean): void;
  (e: "update:hideDebugInfo", value: boolean): void;
  (e: "update:searchMaxResults", value: number): void;
  (e: "perform-search"): void;
}>();

const searchMaxOptions = [
  { label: "200条", value: 200 },
  { label: "500条", value: 500 },
  { label: "1000条", value: 1000 }
];
</script>

<template>
  <n-card class="panel" size="small">
    <template #header>文本搜索</template>
    <div class="search-controls">
      <n-input
        :value="searchText"
        placeholder="输入搜索内容"
        :disabled="!hasRawLines"
        @update:value="emit('update:searchText', $event)"
      />
      <n-checkbox :checked="searchCaseSensitive" @update:checked="emit('update:searchCaseSensitive', $event)">
        区分大小写
      </n-checkbox>
      <n-checkbox :checked="searchUseRegex" @update:checked="emit('update:searchUseRegex', $event)">
        正则表达式
      </n-checkbox>
      <n-checkbox :checked="hideDebugInfo" @update:checked="emit('update:hideDebugInfo', $event)">
        隐藏调试信息
      </n-checkbox>
      <n-select
        size="small"
        :options="searchMaxOptions"
        :value="searchMaxResults"
        @update:value="emit('update:searchMaxResults', $event)"
      />
      <n-button type="primary" size="small" @click="emit('perform-search')" :disabled="!hasRawLines">
        搜索
      </n-button>
    </div>
    <div class="search-quick">
      <n-button
        v-for="item in quickSearchOptions"
        :key="item"
        size="tiny"
        @click="
          emit('update:searchText', item);
          emit('perform-search');
        "
      >
        {{ item }}
      </n-button>
    </div>
    <div class="search-message">{{ searchMessage || '输入关键字后点击搜索' }}</div>
    <div v-if="searchResults.length === 0" class="empty">暂无搜索结果</div>
    <div v-else class="search-results">
      <DynamicScroller class="virtual-scroller" :items="searchResults" key-field="key" :min-item-size="searchItemHeight">
        <template #default="{ item, active }">
          <DynamicScrollerItem :item="item" :active="active" :size-dependencies="[item.line, item.matchStart, item.matchEnd]">
            <div class="search-row">
              <div class="search-meta">
                {{ item.fileName }} · L{{ item.lineNumber }}
              </div>
              <div class="search-line">
                <span>{{ splitMatch(item.line, item.matchStart, item.matchEnd).before }}</span>
                <span class="search-hit">{{ splitMatch(item.line, item.matchStart, item.matchEnd).match }}</span>
                <span>{{ splitMatch(item.line, item.matchStart, item.matchEnd).after }}</span>
              </div>
            </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>
    </div>
  </n-card>
</template>
