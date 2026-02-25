<!--
@component SearchPanel
@description 文本搜索面板组件，提供全文搜索和结果展示功能
@author MaaLogs Team
@license MIT

@summary
该组件提供日志文件的全文搜索功能，包含：
- 搜索输入框
- 搜索选项（区分大小写、正则表达式、隐藏调试信息）
- 最大结果数选择
- 快捷搜索按钮
- 搜索结果列表（虚拟滚动）

@features
- 支持普通文本和正则表达式搜索
- 支持区分大小写选项
- 快捷搜索按钮
- 虚拟滚动优化大列表性能
- 搜索结果高亮显示

@emits update:searchText - 搜索文本更新事件
@emits update:searchCaseSensitive - 区分大小写选项更新事件
@emits update:searchUseRegex - 正则表达式选项更新事件
@emits update:hideDebugInfo - 隐藏调试信息选项更新事件
@emits update:searchMaxResults - 最大结果数更新事件
@emits perform-search - 执行搜索事件

@example
<SearchPanel
  :search-text="keyword"
  :search-case-sensitive="caseSensitive"
  :search-use-regex="useRegex"
  :hide-debug-info="hideDebug"
  :search-max-results="200"
  :search-results="results"
  :search-message="message"
  :quick-search-options="['error', 'fail', 'exception']"
  :has-raw-lines="true"
  :search-item-height="60"
  :split-match="splitMatch"
  @update:search-text="handleTextChange"
  @update:search-case-sensitive="handleCaseChange"
  @update:search-use-regex="handleRegexChange"
  @update:hide-debug-info="handleHideDebug"
  @update:search-max-results="handleMaxResults"
  @perform-search="handleSearch"
/>
-->

<script setup lang="ts">
/**
 * 导入依赖
 * - Naive UI 组件：按钮、卡片、复选框、输入框、选择器
 * - vue-virtual-scroller：虚拟滚动组件
 */
import { NButton, NCard, NCheckbox, NInput, NSelect } from "naive-ui";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import type { SearchResult } from "../types/logTypes";

/**
 * 组件属性定义
 * @property {string} searchText - 当前搜索文本
 * @property {boolean} searchCaseSensitive - 是否区分大小写
 * @property {boolean} searchUseRegex - 是否使用正则表达式
 * @property {boolean} hideDebugInfo - 是否隐藏调试信息
 * @property {number} searchMaxResults - 最大搜索结果数
 * @property {SearchResult[]} searchResults - 搜索结果列表
 * @property {string} searchMessage - 搜索状态消息
 * @property {string[]} quickSearchOptions - 快捷搜索选项列表
 * @property {boolean} hasRawLines - 是否有原始日志行数据
 * @property {number} searchItemHeight - 搜索结果项高度（用于虚拟滚动）
 * @property {Function} splitMatch - 分割匹配文本函数，返回 before/match/after 三部分
 */
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

/**
 * 组件事件定义
 * @event update:searchText - 更新搜索文本
 * @event update:searchCaseSensitive - 更新区分大小写选项
 * @event update:searchUseRegex - 更新正则表达式选项
 * @event update:hideDebugInfo - 更新隐藏调试信息选项
 * @event update:searchMaxResults - 更新最大结果数
 * @event perform-search - 执行搜索
 */
const emit = defineEmits<{
  (e: "update:searchText", value: string): void;
  (e: "update:searchCaseSensitive", value: boolean): void;
  (e: "update:searchUseRegex", value: boolean): void;
  (e: "update:hideDebugInfo", value: boolean): void;
  (e: "update:searchMaxResults", value: number): void;
  (e: "perform-search"): void;
}>();

/**
 * 最大结果数选项
 * 用于选择器下拉列表
 */
const searchMaxOptions = [
  { label: "200条", value: 200 },
  { label: "500条", value: 500 },
  { label: "1000条", value: 1000 }
];
</script>

<!--
  模板部分
  - 搜索控制区域：输入框、选项、按钮
  - 快捷搜索按钮
  - 搜索结果列表（虚拟滚动）
-->
<template>
  <n-card
    class="panel"
    size="small"
  >
    <!-- 标题 -->
    <template #header>
      文本搜索
    </template>
    <!-- 搜索控制区域 -->
    <div class="search-controls">
      <!-- 搜索输入框 -->
      <n-input
        :value="searchText"
        placeholder="输入搜索内容"
        :disabled="!hasRawLines"
        @update:value="emit('update:searchText', $event)"
      />
      <!-- 区分大小写选项 -->
      <n-checkbox
        :checked="searchCaseSensitive"
        @update:checked="emit('update:searchCaseSensitive', $event)"
      >
        区分大小写
      </n-checkbox>
      <!-- 正则表达式选项 -->
      <n-checkbox
        :checked="searchUseRegex"
        @update:checked="emit('update:searchUseRegex', $event)"
      >
        正则表达式
      </n-checkbox>
      <!-- 隐藏调试信息选项 -->
      <n-checkbox
        :checked="hideDebugInfo"
        @update:checked="emit('update:hideDebugInfo', $event)"
      >
        隐藏调试信息
      </n-checkbox>
      <!-- 最大结果数选择 -->
      <n-select
        size="small"
        :options="searchMaxOptions"
        :value="searchMaxResults"
        @update:value="emit('update:searchMaxResults', $event)"
      />
      <!-- 搜索按钮 -->
      <n-button
        type="primary"
        size="small"
        :disabled="!hasRawLines"
        @click="emit('perform-search')"
      >
        搜索
      </n-button>
    </div>
    <!-- 快捷搜索按钮 -->
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
    <!-- 搜索状态消息 -->
    <div class="search-message">
      {{ searchMessage || '输入关键字后点击搜索' }}
    </div>
    <!-- 空状态：无搜索结果 -->
    <div
      v-if="searchResults.length === 0"
      class="empty"
    >
      暂无搜索结果
    </div>
    <!-- 搜索结果列表（虚拟滚动） -->
    <div
      v-else
      class="search-results"
    >
      <DynamicScroller
        class="virtual-scroller"
        :items="searchResults"
        key-field="key"
        :min-item-size="searchItemHeight"
      >
        <template #default="{ item, active }">
          <DynamicScrollerItem
            :item="item"
            :active="active"
            :size-dependencies="[item.line, item.matchStart, item.matchEnd]"
          >
            <!-- 搜索结果行 -->
            <div class="search-row">
              <!-- 文件名和行号 -->
              <div class="search-meta">
                {{ item.fileName }} · L{{ item.lineNumber }}
              </div>
              <!-- 匹配行内容（高亮显示匹配部分） -->
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
