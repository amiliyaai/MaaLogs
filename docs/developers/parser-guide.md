# 解析器架构与开发指南

本文档介绍 MaaLogs 解析器系统的架构设计、运行流程和开发指南。

## 架构概览

```
src/parsers/
├── index.ts              # 模块入口，导出所有公共 API
├── project-registry.ts   # 项目解析器注册表（单例）
├── shared.ts             # 共享解析工具函数
├── correlate.ts          # 日志关联模块
└── projects/
    ├── maaend.ts         # MaaEnd 项目解析器
    └── m9a.ts            # M9A 项目解析器
```

## 核心概念

### 1. ProjectParser 接口

每个项目解析器必须实现 `ProjectParser` 接口：

```typescript
interface ProjectParser {
  readonly id: string; // 唯一标识符
  readonly name: string; // 显示名称
  readonly description: string; // 描述

  parseMainLog(lines, config): MainLogParseResult; // 解析主日志
  parseAuxLog(lines, config): AuxLogParseResult; // 解析辅助日志
  getAuxLogParserInfo(): AuxLogParserInfo; // 获取解析器信息
}
```

### 2. 解析流程

```
用户选择文件
    ↓
useLogParser.handleParse()
    ↓
┌─────────────────────────────────────────────────────┐
│  遍历每个文件                                        │
│  ├─ maa.log → projectParser.parseMainLog()          │
│  │              ├─ 提取事件通知 (EventNotification)  │
│  │              ├─ 提取控制器信息 (ControllerInfo)   │
│  │              └─ 提取 identifier 映射             │
│  │                                                  │
│  └─ 其他日志 → projectParser.parseAuxLog()          │
│                   └─ 提取辅助日志条目 (AuxLogEntry)  │
└─────────────────────────────────────────────────────┘
    ↓
buildTasks() - 构建任务和节点结构
    ↓
correlateAuxLogs() - 关联辅助日志与任务
    ↓
输出: tasks, auxLogs, rawLines
```

### 3. 文件类型判断

```typescript
// 主日志文件（maa.log）
if (isMainLog(fileName)) {
  const result = projectParser.parseMainLog(lines, { fileName });
}

// 辅助日志文件（go-service.log, custom/*.log 等）
else {
  const result = projectParser.parseAuxLog(lines, { fileName });
}
```

## 数据结构

### EventNotification

事件通知，从 maa.log 中提取：

```typescript
interface EventNotification {
  timestamp: string; // 时间戳
  level: string; // 日志级别
  processId: string; // 进程 ID
  threadId: string; // 线程 ID
  message: string; // 事件消息（如 "Tasker.Started"）
  details: Record<string, unknown>; // 事件详情
  fileName: string; // 来源文件
  _lineNumber: number; // 行号
}
```

### TaskInfo

任务信息，由 `buildTasks()` 从事件构建：

```typescript
interface TaskInfo {
  task_id: number; // 任务 ID
  key: string; // 唯一键
  entry: string; // 入口任务名
  status: string; // 状态
  start_time: string; // 开始时间
  end_time?: string; // 结束时间
  nodes: NodeInfo[]; // 节点列表
  identifier?: string; // 唯一标识符
  processId: string; // 进程 ID
  threadId: string; // 线程 ID
}
```

### NodeInfo

节点信息：

```typescript
interface NodeInfo {
  node_id: number; // 节点 ID
  name: string; // 节点名称
  timestamp: string; // 时间戳
  status: "success" | "failed"; // 状态
  task_id: number; // 所属任务 ID
  reco_details?: RecognitionDetail; // 识别详情
  action_details?: ActionDetail; // 动作详情
  next_list: NextListItem[]; // 下一步列表
  recognition_attempts: RecognitionAttempt[]; // 识别尝试
}
```

### AuxLogEntry

辅助日志条目：

```typescript
interface AuxLogEntry {
  key: string; // 唯一键
  source: string; // 来源
  timestamp: string; // 时间戳
  timestampMs?: number; // 毫秒时间戳
  level: string; // 日志级别
  message: string; // 消息内容
  identifier?: string; // 唯一标识符
  task_id?: number; // 关联的任务 ID
  correlation?: CorrelationResult; // 关联结果
  fileName: string; // 来源文件
  lineNumber: number; // 行号
}
```

## 开发新项目解析器

### 步骤 1：创建解析器文件

在 `src/domains/logs/parsers/projects/` 下创建新文件：

```typescript
// myproject.ts
import type {
  EventNotification,
  ControllerInfo,
  AuxLogEntry,
  ProjectParser,
  MainLogParseResult,
  AuxLogParserConfig,
  AuxLogParseResult,
  AuxLogParserInfo,
} from "../../types/parserTypes";
import {
  parseBracketLine,
  extractIdentifier,
  createEventNotification,
  parseControllerInfo,
} from "../shared";

export const myProjectParser: ProjectParser = {
  id: "myproject",
  name: "MyProject",
  description: "MyProject 日志解析器",

  parseMainLog(lines, config): MainLogParseResult {
    const events: EventNotification[] = [];
    const controllers: ControllerInfo[] = [];
    const identifierMap = new Map<number, string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 1. 解析日志行
      const parsed = parseBracketLine(line);
      if (!parsed) continue;

      // 2. 提取事件通知（根据项目日志格式）
      // ...

      // 3. 提取控制器信息
      const controller = parseControllerInfo(parsed, config.fileName, i + 1);
      if (controller) {
        controllers.push(controller);
      }
    }

    return { events, controllers, identifierMap };
  },

  parseAuxLog(lines, config: AuxLogParserConfig): AuxLogParseResult {
    const entries: AuxLogEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      // 解析辅助日志行
      // ...
    }

    return { entries };
  },

  getAuxLogParserInfo(): AuxLogParserInfo {
    return {
      id: "myproject",
      name: "MyProject 解析器",
      description: "解析 MyProject 日志文件",
    };
  },
};
```

### 步骤 2：注册解析器

在 `src/domains/logs/parsers/index.ts` 中导出：

```typescript
export { myProjectParser } from "./projects/myproject";
```

### 步骤 3：在应用启动时注册

在 `src/App.vue` 中导入并注册：

```typescript
import { projectParserRegistry, myProjectParser } from "./domains/logs/parsers";

// 注册解析器（优先级越高越优先）
projectParserRegistry.register(myProjectParser, 50);
```

## 共享工具函数

### parseBracketLine

解析方括号格式的日志行：

```typescript
const result = parseBracketLine(
  "[2024-01-01 12:00:00.000][INFO][Px123][Tx456][functionName] message [key=value]"
);
// result.timestamp = "2024-01-01 12:00:00.000"
// result.level = "INFO"
// result.processId = "Px123"
// result.threadId = "Tx456"
// result.functionName = "functionName"
// result.message = "message"
// result.params = { key: "value" }
```

### extractIdentifier

从日志行中提取 UUID 格式的 identifier：

```typescript
const id = extractIdentifier("[identifier=abc123-def456-...] message");
// id = "abc123-def456-..."
```

### parseControllerInfo

解析控制器创建信息：

```typescript
const controller = parseControllerInfo(parsed, "maa.log", 100);
// 返回 ADB 或 Win32 控制器信息
```

## 日志关联

### 关联策略

`correlateAuxLogs()` 使用以下策略关联辅助日志与任务：

1. **identifier 匹配**（最精确，score: 1.0）

   - 日志条目中的 identifier 与任务的 identifier 完全匹配

2. **task_id 匹配**（score: 0.9）

   - 日志条目中的 task_id 与任务的 task_id 匹配

3. **时间窗口匹配**（score: 0.5-1.0）
   - 日志时间戳在任务执行时间范围内

### 使用示例

```typescript
import { correlateAuxLogs, getLogsForTask, getUnmatchedLogs } from "../parsers";

// 关联日志与任务
const correlated = correlateAuxLogs(auxEntries, tasks);

// 获取特定任务的日志
const taskLogs = getLogsForTask(correlated, "task-0");

// 获取未关联的日志
const unmatched = getUnmatchedLogs(correlated);
```

## UI 集成

### 解析器选择

用户选择的解析器 ID 通过 `useStorage` 持久化：

```typescript
const selectedParserId = useStorage<string>("selectedParserId", "maaend");
```

### 解析器列表

从注册表获取可用解析器：

```typescript
const parserOptions = ref<AuxLogParserInfo[]>(projectParserRegistry.getInfoList());
```

## 调试技巧

### 1. 使用 logger

```typescript
import { createLogger } from "../utils/logger";
const logger = createLogger("MyParser");

logger.debug("解析事件", { event });
logger.info("解析完成", { count: events.length });
logger.warn("未识别的格式", { line });
logger.error("解析失败", { error: String(e) });
```

### 2. 检查解析结果

```typescript
console.log("事件数量:", events.length);
console.log("任务数量:", tasks.length);
console.log("关联统计:", getCorrelationStats(auxLogs));
```

### 3. 单元测试

为解析器编写单元测试，覆盖典型日志格式：

```typescript
describe("myProjectParser", () => {
  it("should parse main log", () => {
    const lines = ["[2024-01-01 12:00:00.000][INFO]..."];
    const result = myProjectParser.parseMainLog(lines, { fileName: "maa.log" });
    expect(result.events.length).toBeGreaterThan(0);
  });
});
```

## 常见问题

### Q: 如何处理多行日志？

使用 `mergeMultilineLogs()` 合并多行日志：

```typescript
const merged = mergeMultilineLogs(rawLines);
```

### Q: 如何添加新的事件类型？

在 `parseMainLog()` 中添加新的解析逻辑：

```typescript
if (parsed.functionName === "MyCustomFunction") {
  const event = createEventNotification(parsed, fileName, lineNumber, "MyEvent", details);
  events.push(event);
}
```

### Q: 如何支持新的日志格式？

1. 在 `parseAuxLog()` 中添加新的解析逻辑
2. 或创建新的解析函数并在 `parseAuxLog()` 中调用

## 最佳实践

1. **单一职责**：每个解析器只负责一个项目的日志格式
2. **复用共享函数**：使用 `shared.ts` 中的工具函数
3. **完整注释**：为解析函数添加 JSDoc 注释
4. **错误处理**：使用 try-catch 处理解析异常
5. **性能优化**：避免在循环中创建大量临时对象
