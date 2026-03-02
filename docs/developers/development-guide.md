# 项目开发指南

本文档介绍 MaaLogs 项目的开发环境搭建、项目结构、开发流程等内容。

## 环境要求

- **Node.js** >= 18
- **Rust** >= 1.70（Tauri 桌面应用开发）
- **pnpm** 或 **npm**

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# Web 版本（仅前端）
npm run dev

# Tauri 桌面应用（前端 + Rust 后端）
npm run tauri:dev
```

### 构建发布

```bash
# Web 版本
npm run build

# Tauri 桌面应用
npm run tauri:build
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Web 开发服务器 |
| `npm run tauri:dev` | 启动 Tauri 开发模式 |
| `npm run build` | 构建 Web 版本 |
| `npm run tauri:build` | 构建 Tauri 桌面应用 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run lint:fix` | 自动修复 ESLint 问题 |
| `npm run format` | 检查代码格式 |
| `npm run format:write` | 格式化代码 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | 运行测试（监视模式） |
| `npm run test:run` | 运行测试（单次） |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |

## 项目结构

```
src/
├── components/           # Vue 组件
│   ├── AIResultCard.vue      # AI 分析结果卡片
│   ├── AISettingsModal.vue   # AI 设置弹窗
│   ├── AnalysisPanel.vue     # 分析面板
│   ├── NodeFlowChart.vue     # 节点流程图
│   └── ...
├── composables/          # Vue Composables
│   ├── useLogParser.ts       # 日志解析
│   ├── useSearch.ts          # 文本搜索
│   ├── useStatistics.ts      # 统计分析
│   ├── useFileSelection.ts   # 文件选择
│   └── useStore.ts           # 持久化存储
├── parsers/              # 日志解析器
│   ├── projects/             # 项目解析器实现
│   │   ├── m9a.ts            # M9A 解析器
│   │   └── maaend.ts         # MaaEnd 解析器
│   ├── baseParser.ts         # 基础解析器
│   ├── shared.ts             # 共享工具函数
│   ├── correlate.ts          # 日志关联
│   └── project-registry.ts   # 解析器注册表
├── types/                # TypeScript 类型定义
│   ├── logTypes.ts           # 日志相关类型
│   └── parserTypes.ts        # 解析器相关类型
├── utils/                # 工具函数
│   ├── aiAnalyzer.ts         # AI 分析
│   ├── crypto.ts             # 加密工具
│   ├── file.ts               # 文件处理
│   ├── format.ts             # 数据格式化
│   ├── logger.ts             # 日志系统
│   ├── parse.ts              # 解析工具
│   └── updater.ts            # 应用更新
├── config/               # 应用配置
│   └── index.ts              # 环境配置
├── __tests__/            # 单元测试
│   ├── parsers/              # 解析器测试
│   ├── utils/                # 工具函数测试
│   ├── composables/          # Composables 测试
│   └── integration/          # 集成测试
├── App.vue               # 根组件
└── main.ts               # 应用入口
```

## 技术栈

### 前端

- **Vue 3** - 渐进式 JavaScript 框架，使用 Composition API
- **TypeScript** - 类型安全开发
- **Naive UI** - Vue 3 组件库
- **Vue Flow** - 流程图可视化
- **Vite** - 快速构建工具

### 桌面应用

- **Tauri 2** - 跨平台桌面应用框架
- **Rust** - 后端逻辑

### 开发工具

- **ESLint** - 代码检查
- **Prettier** - 代码格式化
- **Vitest** - 单元测试框架
- **Commitlint** - Commit 信息规范检查

## 开发规范

### 代码风格

- 使用 TypeScript 进行类型安全开发
- 遵循 Vue 3 Composition API 风格
- 组件使用 `<script setup>` 语法
- 文件注释遵循 JSDoc 规范

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `AnalysisPanel.vue` |
| Composable 文件 | camelCase，use 前缀 | `useLogParser.ts` |
| 工具函数文件 | camelCase | `aiAnalyzer.ts` |
| 类型文件 | camelCase | `logTypes.ts` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_CONFIG` |
| 函数 | camelCase | `parseBracketLine` |
| 接口/类型 | PascalCase | `TaskInfo`, `NodeInfo` |

### 注释规范

每个文件应包含 `@fileoverview` 注释：

```typescript
/**
 * @fileoverview 文件简短描述
 *
 * 详细说明...
 *
 * @module path/to/file
 * @author MaaLogs Team
 * @license MIT
 */
```

公共函数应包含 JSDoc 注释：

```typescript
/**
 * 函数简短描述
 *
 * @param {Type} param - 参数说明
 * @returns {Type} 返回值说明
 *
 * @example
 * const result = functionName(arg);
 */
```

## 添加新功能

### 添加新的日志解析器

详见 [解析器开发指南](./parser-guide.md)。

### 添加新的 AI 服务商

1. 在 `src/utils/aiAnalyzer.ts` 中添加服务商类型：

```typescript
export type AIProvider = 
  | "openai" 
  | "claude" 
  | "myprovider"; // 新增

export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  // ...
  myprovider: ["model-1", "model-2"],
};

export const PROVIDER_INFO: Record<AIProvider, ProviderInfo> = {
  // ...
  myprovider: {
    name: "My Provider",
    baseUrl: "https://api.myprovider.com",
    // ...
  },
};
```

2. 在 `analyzeWithAI` 函数中添加请求处理逻辑。

### 添加新的 Vue 组件

1. 在 `src/components/` 下创建组件文件
2. 使用 `<script setup lang="ts">` 语法
3. 定义 props 类型：

```vue
<script setup lang="ts">
interface Props {
  title: string;
  count?: number;
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
});
</script>

<template>
  <div class="my-component">
    <h2>{{ title }}</h2>
    <p>Count: {{ count }}</p>
  </div>
</template>
```

### 添加新的 Composable

1. 在 `src/composables/` 下创建文件
2. 导出以 `use` 开头的函数：

```typescript
export function useMyFeature() {
  const state = ref(0);
  
  const increment = () => {
    state.value++;
  };
  
  return {
    state,
    increment,
  };
}
```

## 调试技巧

### 使用 logger

```typescript
import { createLogger } from "@/utils/logger";

const logger = createLogger("MyModule");

logger.debug("调试信息", { data });
logger.info("普通信息");
logger.warn("警告信息");
logger.error("错误信息", { error });
```

### Vue DevTools

安装 Vue DevTools 浏览器扩展，可以查看组件树、状态、事件等。

### Tauri 调试

在 Tauri 开发模式下，按 `shift+ctrl+i` 打开开发者工具。

## 测试指南

### 运行测试

```bash
# 运行所有测试
npm run test:run

# 运行特定文件测试
npm run test:run -- path/to/test.test.ts

# 运行测试并生成覆盖率
npm run test:coverage
```

### 编写测试

测试文件放在 `src/__tests__/` 目录下，与源码目录结构对应：

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../../utils/myModule";

describe("myFunction", () => {
  it("should return expected value", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });
});
```

### 测试样本数据

测试样本数据放在 `src/__tests__/fixtures/` 目录下：

```typescript
export const SAMPLE_DATA = {
  input: "test input",
  expected: "expected output",
};
```

## 发布流程

1. 更新版本号（`package.json` 和 `src-tauri/tauri.conf.json`）
2. 运行测试和类型检查：
   ```bash
   npm run typecheck
   npm run test:run
   ```
3. 创建 Git Tag 并推送

## 常见问题

### Q: Tauri 开发模式启动慢？

首次启动需要编译 Rust 代码，后续启动会快很多。可以尝试：
- 使用 `--release` 模式（但编译更慢）
- 确保 Rust 工具链是最新的

### Q: 类型检查报错但代码能运行？

可能是 TypeScript 缓存问题，尝试：
```bash
rm -rf node_modules/.vite
npm run typecheck
```

### Q: 如何查看 Tauri 后端日志？

Tauri 后端日志会输出到终端，在开发模式下可以直接查看。

## 相关文档

- [AGENTS.md](../../AGENTS.md) - AI Agent 编码指南
- [解析器开发指南](./parser-guide.md) - 解析器架构与开发
- [贡献指南](./CONTRIBUTING.md) - Commit 和 PR 规范
