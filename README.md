<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# MaaLogs

MaaFramework 日志分析利器

支持多格式日志解析、可视化任务流程、集成 AI 智能分析，一站式解决日志排查问题

</div>

<p align="center">
  <a href="https://vuejs.org/" target="_blank"><img alt="vue" src="https://img.shields.io/badge/Vue 3-4FC08D?logo=vue.js&logoColor=fff"></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img alt="ts" src="https://img.shields.io/badge/TypeScript 5-3178C6?logo=typescript&logoColor=fff"></a>
  <a href="https://www.naiveui.com/" target="_blank"><img alt="naive-ui" src="https://img.shields.io/badge/Naive UI-5FA04E?logo=vuedotjs&logoColor=fff"></a>
  <a href="https://tauri.app/" target="_blank"><img alt="tauri" src="https://img.shields.io/badge/Tauri 2-FFC131?logo=tauri&logoColor=000"></a>
  <br/>
  <a href="https://github.com/MaaXYZ/MaaLogs/blob/main/LICENSE" target="_blank"><img alt="license" src="https://img.shields.io/github/license/MaaXYZ/MaaLogs"></a>
  <a href="https://github.com/MaaXYZ/MaaLogs/commits/main/" target="_blank"><img alt="commits" src="https://img.shields.io/github/commit-activity/m/MaaXYZ/MaaLogs?color=%23ff69b4"></a>
</div>

<div align="center">

[📖 使用文档](#-使用方法) | [🔧 开发指南](#-开发指南)

</div>

## ✨ 功能特性

### 📊 日志分析

- **多格式支持**：支持解析 `maa.log` 和 `Custom` 格式的日志文件
- **任务可视化**：以树形结构展示任务执行流程
- **节点详情**：展示节点状态、识别详情、控制器和动作信息
- **Custom 日志关联**：自动关联 Custom 日志与对应的任务

### 🔍 文本搜索

- 全文搜索（支持正则表达式）
- 快速定位日志内容
- 搜索结果高亮显示

### 📈 统计分析

- 节点执行次数统计
- 耗时分布分析
- 成功率计算

### 🤖 AI 智能分析

- 集成多服务商 AI 模型
- 分析任务失败原因
- 提供修复建议
- 支持服务商：OpenAI、Claude、Gemini、DeepSeek、智谱 AI、MiniMax、月之暗面、硅基流动等

## 📖 使用方法

### 日志分析

1. 选择日志文件（点击按钮或拖拽文件）
2. 选择解析器（默认 MaaEnd）
3. 点击"开始解析"
4. 查看任务列表和节点详情
5. 选择任务后点击"AI 分析"分析失败原因

### AI 智能分析

1. 点击"设置"按钮配置 AI 服务商和模型
2. 输入对应服务商的 API Key
3. 选择一个任务
4. 点击"AI 分析"按钮

## 🛠️ 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全开发
- **Naive UI** - Vue 3 组件库
- **Vite** - 快速构建工具
- **Tauri** - 跨平台桌面应用框架

## 📁 项目结构

```plaintext
MaaLogs/
├── src/                        # 前端源码
│   ├── components/             # Vue 组件
│   │   ├── AIResultCard.vue   # AI 分析结果卡片
│   │   ├── AISettingsModal.vue # AI 设置弹窗
│   │   ├── AnalysisPanel.vue  # 任务分析面板
│   │   ├── AppTopBar.vue      # 顶部导航栏
│   │   ├── ControllerInfoCard.vue # 控制器信息卡片
│   │   ├── CustomLogPanel.vue # Custom 日志面板
│   │   ├── FileListPanel.vue  # 文件列表面板
│   │   ├── HeroPanel.vue      # 文件选择面板
│   │   ├── SearchPanel.vue    # 搜索面板
│   │   └── StatisticsPanel.vue # 统计面板
│   ├── composables/            # Vue Composables
│   │   ├── index.ts           # 导出入口
│   │   ├── useFileSelection.ts # 文件选择
│   │   ├── useLogParser.ts    # 日志解析
│   │   ├── useSearch.ts       # 搜索功能
│   │   └── useStatistics.ts   # 统计分析
│   ├── parsers/               # 日志解析器
│   │   ├── index.ts           # 解析器注册
│   │   ├── types.ts           # 类型定义
│   │   ├── base.ts            # 基础解析器
│   │   ├── correlate.ts       # 日志关联
│   │   ├── m9a.ts             # M9A 解析器
│   │   ├── maaend.ts          # MaaEnd 解析器
│   │   └── registry.ts        # 注册逻辑
│   ├── types/                 # TypeScript 类型
│   │   └── logTypes.ts       # 日志类型定义
│   ├── utils/                # 工具函数
│   │   ├── aiAnalyzer.ts      # AI 分析工具
│   │   ├── file.ts            # 文件处理
│   │   ├── format.ts          # 格式化工具
│   │   ├── logger.ts          # 日志记录器
│   │   └── parse.ts           # 解析工具
│   ├── App.vue                # 主应用组件
│   └── main.ts                # 应用入口
├── src-tauri/                 # Tauri 后端
│   ├── src/                  # Rust 源码
│   │   ├── lib.rs            # 库入口
│   │   └── main.rs            # 主入口
│   ├── Cargo.toml            # Rust 依赖
│   ├── tauri.conf.json       # Tauri 配置
│   └── capabilities/          # 权限配置
├── vscode/                    # VSCode 插件
│   ├── src/                  # 插件源码
│   │   ├── commands/         # 命令
│   │   ├── providers/        # 提供者
│   │   ├── types/            # 类型定义
│   │   ├── utils/            # 工具函数
│   │   ├── views/            # 视图
│   │   └── extension.ts      # 插件入口
│   ├── syntaxes/             # 语法高亮
│   ├── package.json          # 插件配置
│   └── .vscodeignore         # 忽略配置
├── public/                    # 静态资源
│   └── *.svg                 # 图标资源
├── index.html                # HTML 模板
├── package.json              # Node 依赖
├── vite.config.ts            # Vite 配置
├── tsconfig.json             # TypeScript 配置
└── README.md                 # 项目文档
```

## 🏗️ 架构说明

### 解析器架构

采用可扩展的解析器架构，支持多种日志格式：

- **BaseParser** - 基础解析器类
- **MaaEndParser** - 解析 MaaEnd 格式日志
- **M9AParser** - 解析 M9A 格式日志

### 组件设计

- **组件化** - 每个功能模块独立组件
- **Composables** - 封装可复用逻辑
- **类型安全** - 完整的 TypeScript 类型定义

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- Rust >= 1.70
- pnpm 或 npm

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 桌面应用
pnpm tauri:dev

# Web 版本
pnpm dev
```

### 构建发布

```bash
# Web 版本
pnpm build

# Tauri 桌面应用
pnpm tauri:build
```

## 🔗 相关链接

- [MaaFramework](https://github.com/MaaXYZ/MaaFramework) - 自动化框架
- [MaaLogAnalyzer](https://github.com/Windsland52/MAALogAnalyzer) - 另一个日志分析工具
- [Naive UI 文档](https://www.naiveui.com/)
- [Tauri 文档](https://tauri.app/)

## 📝 许可证

MIT License
