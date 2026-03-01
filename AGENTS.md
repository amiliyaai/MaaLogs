# MaaLogs AI Agent 编码指南

欢迎参与 MaaLogs 的开发！本指南旨在帮助 AI Agent 快速理解项目结构及编码规范，以提供更高质量的代码建议。

## 项目概览

**MaaLogs** 是一个 MaaFramework 日志分析工具，基于 Tauri + Vue 3 + TypeScript 构建。

- **主体流程**：用户选择日志文件，解析器提取任务和节点信息，以可视化方式展示任务执行流程。
- **解析器架构**：采用可扩展的解析器架构，每个项目解析器封装该项目的日志解析逻辑，位于 `src/parsers/projects`。
- **复杂逻辑**：对于嵌套识别、多线程日志交错等复杂场景，需在解析器中特殊处理。
- **配置入口**：解析器通过 `project-registry.ts` 注册，用户选择的解析器 ID 通过 `useStorage` 持久化。

## 目录结构

```
src/
├── parsers/              # 解析器模块
│   ├── index.ts          # 模块入口
│   ├── baseParser.ts     # 基础解析器（共享 maa.log 解析逻辑）
│   ├── project-registry.ts # 项目解析器注册表
│   ├── shared.ts         # 共享解析工具函数
│   ├── correlate.ts      # 日志关联模块
│   └── projects/         # 项目解析器实现
│       ├── m9a.ts        # M9A 项目解析器
│       └── maaend.ts     # MaaEnd 项目解析器
├── types/                # TypeScript 类型定义
│   ├── logTypes.ts       # 日志相关类型
│   └── parserTypes.ts    # 解析器相关类型
├── utils/                # 工具函数
│   ├── parse.ts          # 日志解析核心功能
│   ├── format.ts         # 数据格式化
│   ├── file.ts           # 文件处理
│   ├── logger.ts         # 日志系统
│   ├── crypto.ts         # 加密工具
│   ├── aiAnalyzer.ts     # AI 分析
│   └── updater.ts        # 应用更新
├── composables/          # Vue Composables
│   ├── useLogParser.ts   # 日志解析
│   ├── useSearch.ts      # 文本搜索
│   ├── useStatistics.ts  # 统计分析
│   ├── useFileSelection.ts # 文件选择
│   └── useStore.ts       # 持久化存储
├── components/           # Vue 组件
│   ├── AnalysisPanel.vue # 分析面板
│   ├── NodeFlowChart.vue # 节点流程图
│   ├── StatisticsPanel.vue # 统计面板
│   └── ...
└── config/               # 应用配置
    └── index.ts          # 环境配置
```

## 关键文件

- [`src/parsers/projects/`](src/parsers/projects/): 项目解析器实现（m9a.ts, maaend.ts）。
- [`src/types/`](src/types/): TypeScript 类型定义（logTypes.ts, parserTypes.ts）。
- [`src/utils/`](src/utils/): 工具函数（parse.ts, format.ts, aiAnalyzer.ts）。
- [`src/components/`](src/components/): Vue 组件（AnalysisPanel.vue 等）。
- [`docs/developers/parser-guide.md`](docs/developers/parser-guide.md): 解析器架构与开发指南。

## 编码规范

### 1. 解析器开发规范

- **接口合规性**：所有解析器必须实现 `ProjectParser` 接口，包含 `parseMainLog`、`parseAuxLog`、`getAuxLogParserInfo` 方法。
- **单一职责**：每个解析器只负责一个项目的日志格式，不要在解析器中处理 UI 逻辑。
- **复用共享函数**：使用 `shared.ts` 中的工具函数（如 `parseBracketLine`、`extractIdentifier`）。
- **错误处理**：使用 try-catch 处理解析异常，避免因单行解析失败导致整体崩溃。

### 2. 类型定义规范

- **类型安全**：所有函数参数和返回值必须有明确的 TypeScript 类型。
- **类型导出**：新增类型需在 `parserTypes.ts` 或 `logTypes.ts` 中定义并导出。
- **避免 any**：禁止使用 `any` 类型，必要时使用 `unknown` 并进行类型守卫。

### 3. Vue 组件规范

- **Composition API**：使用 Vue 3 Composition API + `<script setup>` 语法。
- **Composables**：封装可复用逻辑到 `composables/` 目录（如 `useLogParser`、`useSearch`）。
- **Props 类型**：组件 props 必须使用 TypeScript 定义类型。

### 4. 代码格式化规范

- **ESLint 约束**：所有代码必须通过 `npm run lint` 检查。
- **Prettier 约束**：代码格式遵循 `.prettierrc.json` 配置。
- **提交前检查**：运行 `npm run typecheck` 确保类型正确。

### 5. 注释规范

- **文件头注释**：每个文件应包含 `@fileoverview` 注释，说明文件用途和主要功能。
- **函数注释**：公共函数应包含 JSDoc 注释，说明参数、返回值和使用示例。
- **类型注释**：复杂类型应包含属性说明和使用示例。
- **避免冗余**：简单、自解释的代码无需注释。

## 审查重点

在审查代码（Review）时，请重点关注以下事项：

- **接口实现完整性**：检查解析器是否完整实现了 `ProjectParser` 接口的所有方法。
- **类型定义一致性**：检查新增类型是否在正确的文件中定义，是否已导出。
- **解析器注册**：新增解析器是否已在 `index.ts` 中导出，是否在 `main.ts` 中注册。
- **性能考虑**：避免在循环中创建大量临时对象，避免不必要的重复解析。
- **嵌套识别处理**：检查嵌套识别是否正确附加到父节点的 `nested_nodes` 中。
- **日志关联正确性**：检查 `correlateAuxLogs` 是否正确关联辅助日志与任务。
- **UI 显示完整性**：检查组件是否正确显示解析结果（如嵌套识别、disabled 状态）。

## 解析器实现要点

### M9A 解析器特殊处理

1. **Next List 提取**：从 `TaskBase::run_recognition` 行的 `list=[...]` 参数提取。
2. **嵌套识别**：通过 `MaaContextRunRecognition` API 调用检测，注意不同进程/线程日志交错。
3. **Disabled 节点**：检测 `node disabled` 日志行，设置 `status: "disabled"`。
4. **Direct Hit**：`direct_hit` 节点不设置 next_list（除非有多个 next）。

### 日志行格式

```
[时间戳][级别][进程ID][线程ID][函数名] 消息 [参数]
```

示例：
```
[2025-06-14 11:55:17.115][INF][Px21136][Tx55018][TaskBase.cpp][L131] node hit [result.name=SummonlngSuccess] [result.box=[119 x 89 from (283, 300)]]
```

### 嵌套识别检测

M9A 使用 `MaaContextRunRecognition` API 进行嵌套识别，日志会交错：

```
[Px7892][Tx38319] MaaContextRunRecognition [entry=SummonlngCardFirst] | enter
[Px21136][Tx55018] node hit [result.name=SummonlngCardFirst]
[Px7892][Tx38319] MaaContextRunRecognition | leave
```

处理方式：检测 `MaaContextRunRecognition | enter` 设置嵌套上下文，后续 `node hit` 附加到父节点。

## 相关文档链接

建议调取以下文档以辅助理解和开发：

- [解析器架构与开发指南](docs/developers/parser-guide.md)
- [贡献指南](docs/developers/CONTRIBUTING.md)
- [MaaFramework](https://github.com/MaaXYZ/MaaFramework) - 自动化框架
- [Naive UI 文档](https://www.naiveui.com/)
- [Tauri 文档](https://tauri.app/)

## 实时调整区域

> 以下是可在开发过程中动态调整的内容

### 当前开发重点

- 解析器稳定性优化
- AI 分析功能完善
- 用户体验改进

### 已知问题

- 暂无

### 待办事项

- 暂无

---

最后更新: 2026-03-02
