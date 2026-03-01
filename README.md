<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="src-tauri/icons/512x512.png" alt="MaaLogs Logo" width="128">

# MaaLogs

MaaFramework 日志分析利器

支持多项目日志解析、可视化任务流程、集成 AI 智能分析，一站式解决日志排查问题

</div>

<p align="center">
  <a href="https://vuejs.org/" target="_blank"><img alt="vue" src="https://img.shields.io/badge/Vue 3-4FC08D?logo=vue.js&logoColor=fff"></a>
  <a href="https://www.typescriptlang.org/" target="_blank"><img alt="ts" src="https://img.shields.io/badge/TypeScript 5-3178C6?logo=typescript&logoColor=fff"></a>
  <a href="https://www.naiveui.com/" target="_blank"><img alt="naive-ui" src="https://img.shields.io/badge/Naive UI-5FA04E?logo=vuedotjs&logoColor=fff"></a>
  <a href="https://tauri.app/" target="_blank"><img alt="tauri" src="https://img.shields.io/badge/Tauri 2-FFC131?logo=tauri&logoColor=000"></a>
  <br/>
  <img alt="license" src="https://img.shields.io/github/license/amiliyaai/MaaLogs">
  <img alt="commit" src="https://img.shields.io/github/commit-activity/m/amiliyaai/MaaLogs?color=%23ff69b4">
</p>

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
- **Tauri 2** - 跨平台桌面应用框架

## 📁 项目结构

```plaintext
MaaLogs/
├── src/                        # 前端源码
│   ├── components/             # Vue 组件
│   ├── composables/            # Vue Composables
│   ├── parsers/                # 日志解析器
│   ├── types/                  # TypeScript 类型
│   ├── utils/                  # 工具函数
│   └── config/                 # 应用配置
├── src-tauri/                  # Tauri 后端
│   ├── src/                    # Rust 源码
│   ├── icons/                  # 应用图标
│   └── tauri.conf.json         # Tauri 配置
├── vscode/                     # VSCode 插件
├── public/                     # 静态资源
└── docs/                       # 文档
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- Rust >= 1.70

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 桌面应用
npm run tauri:dev

# Web 版本
npm run dev
```

### 构建发布

```bash
# Tauri 桌面应用
npm run tauri:build

# Web 版本
npm run build
```

## 🔗 相关链接

- [MaaFramework](https://github.com/MaaXYZ/MaaFramework) - 自动化框架
- [MaaEnd](https://github.com/MaaEnd/MaaEnd) - 《明日方舟：终末地》游戏小助手
- [M9A](https://github.com/MAA1999/M9A) - 重返未来：1999 小助手
- [Naive UI 文档](https://www.naiveui.com/)
- [Tauri 文档](https://tauri.app/)

## 🔧 开发指南

详细开发指南请参考 [AGENTS.md](AGENTS.md) 和 [docs/developers/](docs/developers/) 目录。

### 代码规范

- 使用 TypeScript 进行类型安全开发
- 遵循 Vue 3 Composition API 风格
- 组件使用 `<script setup>` 语法
- 文件注释遵循 JSDoc 规范

### 添加新的日志解析器

1. 在 `src/parsers/projects/` 目录下创建新的解析器文件
2. 实现 `ProjectParser` 接口
3. 在 `src/parsers/index.ts` 中导出解析器

### 添加新的 AI 服务商

1. 在 `src/utils/aiAnalyzer.ts` 中添加服务商类型
2. 更新 `PROVIDER_MODELS` 和 `PROVIDER_INFO`
3. 在 `analyzeWithAI` 函数中添加对应请求处理

## 📝 许可证

MIT License
