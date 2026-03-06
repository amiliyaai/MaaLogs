# MaaLogs AI Agent 编码指南

欢迎参与 MaaLogs 的开发！本指南旨在帮助 AI Agent 快速理解项目结构及编码规范，以提供更高质量的代码建议。

## 项目概览

**MaaLogs** 是一个 MaaFramework 日志分析工具，基于 Tauri + Vue 3 + TypeScript 构建。

- **主体流程**：用户选择日志文件，解析器提取任务和节点信息，以可视化方式展示任务执行流程。
- **解析器架构**：采用可扩展的解析器架构，每个项目解析器封装该项目的日志解析逻辑，位于 `src/parsers/projects`。
- **复杂逻辑**：对于嵌套识别、多线程日志交错等复杂场景，需在解析器中特殊处理。
- **配置入口**：解析器通过 `project-registry.ts` 注册，用户选择的解析器 ID 通过 `useStorage` 持久化。
- **配置集中管理**：应用配置集中在 `src/config/` 目录，方便统一修改。
- **搜索功能**：支持页面内搜索，包括任务、节点、识别、动作、辅助日志，支持模糊搜索、高亮显示、跳转定位。

## 目录结构

```
src/
├── config/                  # 应用配置
│   ├── index.ts            # 配置入口
│   ├── ai.ts              # AI 服务配置
│   ├── parser.ts          # 解析器配置
│   ├── file.ts            # 文件处理配置
│   └── knowledge.ts       # AI 知识库配置
├── parsers/                # 解析器模块
│   ├── index.ts           # 模块入口
│   ├── baseParser.ts      # 基础解析器（共享 maa.log 解析逻辑）
│   ├── project-registry.ts # 项目解析器注册表
│   ├── shared.ts          # 共享解析工具函数
│   ├── correlate.ts       # 日志关联模块
│   └── projects/          # 项目解析器实现
│       ├── m9a.ts         # M9A 项目解析器
│       └── maaend.ts      # MaaEnd 项目解析器
├── types/                  # TypeScript 类型定义
│   ├── logTypes.ts        # 日志相关类型
│   └── parserTypes.ts    # 解析器相关类型
├── utils/                  # 工具函数
│   ├── parse.ts           # 日志解析核心功能
│   ├── format.ts          # 数据格式化
│   ├── file.ts            # 文件处理
│   ├── logger.ts          # 日志系统
│   ├── crypto.ts          # 加密工具
│   ├── aiAnalyzer.ts      # AI 分析
│   └── updater.ts         # 应用更新
├── composables/           # Vue Composables
│   ├── useLogParser.ts    # 日志解析
│   ├── useSearch.ts       # 文本搜索（原始日志）
│   ├── useInPageSearch.ts # 页面内搜索（结构化数据）
│   ├── useStatistics.ts   # 统计分析
│   ├── useFileSelection.ts # 文件选择
│   └── useStore.ts        # 持久化存储
├── components/            # Vue 组件
│   ├── AppTopBar.vue      # 顶部导航栏
│   ├── AnalysisPanel.vue  # 分析面板
│   ├── NodeFlowChart.vue  # 节点流程图
│   ├── StatisticsPanel.vue # 统计面板
│   └── ...
└── App.vue                # 应用入口
```

## 关键文件

- [`src/config/`](src/config/): 应用配置文件（ai.ts, knowledge.ts, parser.ts, file.ts）。
- [`src/config/knowledge.ts`](src/config/knowledge.ts): AI 知识库，包含识别算法、动作类型、控制器等知识。
- [`src/parsers/projects/`](src/parsers/projects/): 项目解析器实现（m9a.ts, maaend.ts）。
- [`src/types/`](src/types/): TypeScript 类型定义（logTypes.ts, parserTypes.ts）。
- [`src/utils/`](src/utils/): 工具函数（parse.ts, format.ts, aiAnalyzer.ts）。
- [`src/components/`](src/components/): Vue 组件（AnalysisPanel.vue 等）。
- [`src/composables/useInPageSearch.ts`](src/composables/useInPageSearch.ts): 页面内搜索 composable，实现任务、节点、识别、动作的搜索和跳转。
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

### 4. 配置管理规范

- **集中管理**：所有可配置项应放在 `src/config/` 目录下的对应文件中。
- **类型定义**：配置必须有 TypeScript 类型注解。
- **JSDoc 注释**：配置文件必须包含详细的 JSDoc 注释，说明各配置项的用途和影响。

### 5. 代码格式化规范

- **ESLint 约束**：所有代码必须通过 `npm run lint` 检查。
- **Prettier 约束**：代码格式遵循 `.prettierrc.json` 配置。
- **提交前检查**：运行 `npm run typecheck` 确保类型正确。

### 6. 注释规范

- **文件头注释**：每个文件应包含 `@fileoverview` 注释，说明文件用途和主要功能。
- **函数注释**：公共函数应包含 JSDoc 注释，说明参数、返回值和使用示例。
- **类型注释**：复杂类型应包含属性说明和使用示例。
- **避免冗余**：简单、自解释的代码无需注释。

## 审查重点

在审查代码（Review）时，请重点关注以下事项：

- **接口实现完整性**：检查解析器是否完整实现了 `ProjectParser` 接口的所有方法。
- **类型定义一致性**：检查新增类型是否在正确的文件中定义，是否已导出。
- **解析器注册**：新增解析器是否已在 `index.ts` 中导出，是否在 `main.ts` 中注册。
- **配置集中管理**：检查是否将新的配置项添加到 `src/config/` 目录，而非硬编码。
- **性能考虑**：避免在循环中创建大量临时对象，避免不必要的重复解析。
- **嵌套识别处理**：检查嵌套识别是否正确附加到父节点的 `nested_nodes` 中。
- **日志关联正确性**：检查 `correlateAuxLogs` 是否正确关联辅助日志与任务。
- **UI 显示完整性**：检查组件是否正确显示解析结果（如嵌套识别、disabled 状态）。
- **搜索功能完整性**：检查搜索结果是否正确显示、跳转动画是否正常、滚动定位是否准确。

## 解析器实现要点

### M9A 解析器特殊处理

1. **Next List 提取**：从 `TaskBase::run_recognition` 行的 `list=[...]` 参数提取。
2. **嵌套识别**：通过 `MaaContextRunRecognition` API 调用检测，注意不同进程/线程日志交错。
3. **Disabled 节点**：检测 `node disabled` 日志行，设置 `status: "disabled"`。
4. **Direct Hit**：`direct_hit` 节点不设置 next_list（除非有多个 next）。

### 日志行格式

```
[时间戳][级别][进程ID][线程ID][源文件位置] 消息 [参数]
```

示例（来自 MaaEnd 项目真实日志）：

```bash
# 任务开始事件
[2026-03-06 00:27:36.184][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Tasker.Task.Starting] [details={"entry":"SellProductMain","hash":"db798f091cd70cd7","task_id":200000001,"uuid":"94d79698b0266e69"}]

# 节点识别执行（enter）
[2026-03-06 00:27:36.192][DBG][Px45380][Tx38246][PipelineTask.cpp][L237] [cur_node_=SellProductMain] [list=[{"anchor":false,"jump_back":false,"name":"SellProductMain"}]] | enter

# 节点识别执行（leave）
[2026-03-06 00:27:44.334][TRC][Px45380][Tx38246][TaskBase.cpp][L54] | leave, 584ms

# 节点识别成功
[2026-03-06 00:27:44.334][INF][Px45380][Tx38246][TaskBase.cpp][L94] reco hit [result.name=SellProductGoToInfrastructureOutpost] [result.box=[514,87,84,21]]

# 节点成功事件（DirectHit 算法）
[2026-03-06 00:27:36.210][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.PipelineNode.Succeeded] [details={"action_details":{"action":"DoNothing","action_id":500000001,"box":[0,0,0,0],"detail":{},"name":"SellProductMain","success":true},"focus":null,"name":"SellProductMain","node_details":{"action_id":500000001,"completed":true,"name":"SellProductMain","node_id":300000001,"reco_id":400000001},"node_id":300000001,"reco_details":{"algorithm":"DirectHit","box":[0,0,0,0],"detail":null,"name":"SellProductMain","reco_id":400000001},"task_id":200000001}]

# 节点成功事件（And 算法，包含 OCR 和 TemplateMatch）
[2026-03-06 00:27:36.939][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.PipelineNode.Succeeded] [details={"action_details":{"action":"DoNothing","action_id":500000002,"box":[0,0,0,0],"detail":{},"name":"SellProductAtDevelopment","success":true},"focus":null,"name":"SellProductMain","node_details":{"action_id":500000002,"completed":true,"name":"SellProductAtDevelopment","node_id":300000002,"reco_id":400000002},"node_id":300000002,"reco_details":{"algorithm":"And","box":[40,25,94,19],"detail":[{"algorithm":"And","box":[40,25,94,19],"detail":[{"algorithm":"OCR","box":[40,25,94,19],"detail":{"all":[{"box":[40,25,94,19],"score":0.883039,"text":"//地区建设"}],"best":{"box":[40,25,94,19],"score":0.883039,"text":"//地区建设"},"filtered":[{"box":[40,25,94,19],"score":0.883039,"text":"//地区建设"}]},"name":"CheckRegionalDevelopmentText","reco_id":400000004},{"algorithm":"TemplateMatch","box":[1193,127,27,25],"detail":{"all":[{"box":[1193,127,27,25],"score":0.960613},{"box":[1194,128,26,24],"score":1.000000}],"best":{"box":[1193,127,27,25],"score":0.960613},"filtered":[{"box":[1193,127,27,25],"score":0.960613},{"box":[1194,128,26,24],"score":1.000000}]},"name":"IncomeReportButton","reco_id":400000005}],"name":"InRegionalDevelopment","reco_id":400000003}],"name":"SellProductAtDevelopment","reco_id":400000002},"task_id":200000001}]

# 动作执行 - DoNothing
[2026-03-06 00:27:36.209][INF][Px45380][Tx38246][Actuator.cpp][L56] action [i=0] [pipeline_data.repeat=1] [result={"action":"DoNothing","action_id":500000001,"box":[0,0,0,0],"detail":{},"name":"SellProductMain","success":true}]

# 动作执行 - Click
[2026-03-06 00:27:38.171][INF][Px45380][Tx38246][Actuator.cpp][L56] action [i=0] [pipeline_data.repeat=1] [result={"action":"Click","action_id":500000011,"box":[766,196,132,35],"detail":{"contact":0,"point":[815,211],"pressure":1},"name":"SellProductEnterValleyIVOutpost","success":true}]

# 动作执行 - Custom
[2026-03-06 00:27:37.562][INF][Px45380][Tx38246][Actuator.cpp][L56] action [i=0] [pipeline_data.repeat=1] [result={"action":"Custom","action_id":500000005,"box":[0,0,0,0],"detail":{},"name":"SellProductValleyIV","success":true}]

# 识别失败 - TemplateMatch（低于阈值）
[2026-03-06 00:27:37.576][DBG][Px45380][Tx38246][TemplateMatcher.cpp][L45] SellProductEnterOutpostLocked [all_results_=[{"box":[1178,185,35,48],"score":0.209733}]] [filtered_results_=[]] [best_result_=null] [cost=3ms] [param_.template_=["SellProduct/SellProductDevelopmentLocked.png"]] [templates_.size()=1] [param_.thresholds=[0.700000]] [param_.method=5] [param_.green_mask=false]

# 识别失败 - OCR（未匹配期望文本）
[2026-03-06 00:27:37.645][DBG][Px45380][Tx38246][OCRer.cpp][L90] SellProductCheckOutpostText [cache_=null] [all_results_=[{"box":[40,25,94,19],"score":0.883039,"text":"//地区建设"}]] [filtered_results_=[]] [best_result_=null] [cost=19ms] [param_.model=] [param_.only_rec=false] [param_.expected=["据点","據點","Outpost","拠点","거점"]]

# ADB 控制器创建
[2026-03-06 00:27:17.452][DBG][Px45380][Tx56166][MaaFramework.cpp][L20] MaaAdbControllerCreate [adb_path=C:/Program Files/NetEase/MuMu Player 12/nx_main/adb.exe] [address=127.0.0.1:16384] [screencap_methods=64] [input_methods=18446744073709551607] [config={"extras":{"mumu":{"enable":true,"index":0,"path":"C:/Program Files/NetEase/MuMu Player 12"}}}] [agent_path=C:\Users\hmy01\Works\Working\Game\Endfield\MaaEnd\install\maafw\MaaAgentBinary] | enter

# 节点动作开始
[2026-03-06 00:27:44.335][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.Action.Starting] [details={"action_id":500000022,"focus":null,"name":"SellProductGoToInfrastructureOutpost","task_id":200000001}]

# 节点动作成功
[2026-03-06 00:27:44.394][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.Action.Succeeded] [details={"action_details":{"action":"Click","action_id":500000022,"box":[514,87,84,21],"detail":{"contact":0,"point":[571,92],"pressure":1},"name":"SellProductGoToInfrastructureOutpost","success":true},"action_id":500000022,"focus":null,"name":"SellProductGoToInfrastructureOutpost","task_id":200000001}]

# Next List 成功
[2026-03-06 00:27:44.334][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.NextList.Succeeded] [details={"focus":null,"list":[{"anchor":false,"jump_back":false,"name":"SellProductInfrastructureOutpostSell"},{"anchor":false,"jump_back":true,"name":"SellProductGoToInfrastructureOutpost"}],"name":"SellProductInfrastructureOutpost","task_id":200000001}]
```

> **注意**：以上日志示例来自 MaaEnd 项目。其他项目日志格式略有不同。

## 搜索功能实现要点

### 页面内搜索特殊处理

1. **模糊搜索**：数字字段支持部分匹配，使用 `includes()` 而非严格相等。
2. **搜索范围**：支持任务、节点、识别、动作、辅助日志的全方位搜索。
3. **高亮显示**：搜索结果项高亮显示，对应条目标红突出。
4. **跳转动画**：使用 CSS `highlight-flash` 动画实现高亮闪烁效果。
5. **滚动定位**：搜索结果自动滚动到视图中心位置，确保用户体验更好。
6. **状态自动选择**：搜索任务 ID 时自动选择第一个节点，避免显示"请选择节点"。
7. **搜索结果样式**：搜索面板宽度 500px，文本使用省略号避免单词断开问题。
8. **时序控制**：高亮状态在动画结束后自动清除，避免残留样式。

### 错误截图展开逻辑

1. **响应式展开**：使用 `v-model:expanded-names` 与 `screenshotExpanded` ref。
2. **状态同步**：节点切换时自动根据是否有截图同步展开/折叠状态。
3. **watch 监听**：使用 `watch` 监听节点变化，自动调整截图展开状态。

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

最后更新: 2026-03-06
