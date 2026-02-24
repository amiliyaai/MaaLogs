# MaaLogs

MaaLogs 是一个用于解析和可视化 MaaFramework 日志的桌面应用程序。它能够解析 MaaFramework 运行时产生的日志文件，提取任务执行信息、节点详情和 Custom 日志，并提供直观的可视化界面进行分析。

## 功能特性

- **日志解析**：支持解析 `maa.log` 和 `go-service.log` 格式的日志文件
- **任务可视化**：以树形结构展示任务执行流程，包括节点状态、识别详情、控制器和动作信息
- **Custom 日志关联**：自动关联 Custom 日志与对应的 任务
- **文本搜索**：支持正则表达式搜索，快速定位日志内容
- **统计分析**：统计节点执行次数、耗时分布和成功率
- **AI 智能分析**：集成多服务商 AI 模型，分析任务失败原因并提供建议

## 技术栈

- **前端框架**：Vue 3 + TypeScript
- **UI 组件库**：Naive UI
- **桌面框架**：Tauri 2.0
- **构建工具**：Vite

## 项目结构

```
src/
├── App.vue                 # 主应用组件
├── main.ts                 # 应用入口
├── components/             # Vue 组件
│   ├── AppTopBar.vue       # 顶部导航栏
│   ├── HeroPanel.vue       # 文件选择和解析控制面板
│   ├── FileListPanel.vue   # 已选文件列表
│   ├── AnalysisPanel.vue   # 任务分析面板
│   ├── SearchPanel.vue     # 日志搜索面板
│   └── StatisticsPanel.vue # 统计分析面板
├── composables/            # Vue Composables
│   ├── index.ts            # 导出入口
│   ├── useLogParser.ts     # 日志解析逻辑
│   ├── useSearch.ts        # 搜索功能
│   ├── useStatistics.ts    # 统计计算
│   └── useFileSelection.ts # 文件选择管理
├── parsers/                # 日志解析器
│   ├── index.ts            # 解析器注册表
│   ├── types.ts            # 解析器类型定义
│   ├── base.ts             # 基础解析器
│   ├── loguru.ts           # Loguru 格式解析器
│   ├── maaend.ts           # MaaEnd 格式解析器
│   ├── correlate.ts        # Custom 日志关联
│   └── registry.ts         # 解析器注册逻辑
├── types/                  # TypeScript 类型定义
│   └── logTypes.ts         # 日志相关类型
└── utils/                  # 工具函数
    ├── logger.ts           # 日志记录器
    ├── format.ts           # 格式化工具
    ├── parse.ts            # 解析工具
    ├── file.ts             # 文件处理工具
    └── aiAnalyzer.ts       # AI 分析工具
```

## 核心模块说明

### Composables

Composables 是 Vue 3 的组合式函数，用于封装和复用有状态的逻辑：

- **useLogParser**：核心日志解析逻辑，包括任务构建、节点提取和 Custom 日志关联
- **useSearch**：文本搜索功能，支持正则表达式和大小写敏感选项
- **useStatistics**：节点统计计算，包括执行次数、耗时分布和成功率
- **useFileSelection**：文件选择和拖拽处理，支持 Tauri 文件系统 API

### Parsers

日志解析器模块实现了可扩展的解析器架构：

- **BaseParser**：基础解析器类，提供通用的解析方法
- **LoguruParser**：解析 Loguru 格式的日志（Go 服务日志）
- **MaaEndParser**：解析 MaaEnd 格式的日志
- **correlateAuxLogs**：将 Custom 日志与 Pipeline 节点关联

### Utils

工具函数模块提供纯函数，无副作用：

- **format.ts**：格式化函数，如时间、大小、状态等
- **parse.ts**：解析函数，如日志行解析、任务构建等
- **file.ts**：文件处理函数，如文件类型判断、路径处理等
- **aiAnalyzer.ts**：AI 分析功能，支持多服务商配置、失败原因分析和 MAA 框架知识库

## 开发指南

### 环境要求

- Node.js >= 18
- Rust >= 1.70
- pnpm 或 npm

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri dev
```

### 构建发布

```bash
npm run tauri build
```

### 类型检查

```bash
npm run build
```

## 使用说明

1. **选择日志文件**：点击"选择日志文件"按钮或直接拖拽文件到窗口
2. **选择解析器**：根据日志类型选择合适的解析器（默认 MaaEnd）
3. **开始解析**：点击"开始解析"按钮
4. **查看结果**：
   - **分析视图**：查看任务列表、节点详情和 Custom 日志
   - **搜索视图**：在原始日志中搜索关键字
   - **统计视图**：查看节点执行统计信息

### AI 智能分析

在分析视图中，选择一个任务后，点击"AI 分析"按钮即可分析失败原因：

1. 点击"设置"按钮配置 AI 服务商和模型
2. 输入对应服务商的 API Key
3. 点击"AI 分析"按钮开始分析
4. 分析结果将显示失败节点的原因和建议

**支持的服务商**：
- OpenAI、Anthropic (Claude)、Google Gemini、xAI (Grok)、DeepSeek
- 智谱 AI、MiniMax、月之暗面、阶跃星辰
- 硅基流动、OpenRouter、火山引擎、阿里云、腾讯云
- 自定义（支持任意兼容 OpenAI API 的服务商）

## 日志格式支持

### maa.log 格式

```
[时间戳][等级][进程ID][线程ID][源文件][行号][函数名] 消息内容
```

### go-service.log（MaaEnd）、M9A Custom日志 格式

支持 M9A 和 MaaEnd 两种格式的 JSON 结构化日志。

## VSCode 插件

> ⚠️ **开发中** - 当前 VSCode 插件功能正在完善中（还不能用！）

MaaLogs 同时提供 VSCode 插件版本，可在 VSCode 中直接分析日志文件。

### 功能特性（开发中）

- 日志文件分析
- 任务树可视化
- AI 智能分析（集成桌面应用全部功能）

### 安装使用

```bash
cd vscode
npm install
```

按 `F5` 启动调试，或将插件打包后安装。

## 许可证

MIT License
