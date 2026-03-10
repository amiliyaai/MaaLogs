# MaaLogs AI Agent Coding Guide

Welcome to MaaLogs development! This guide helps AI Agents quickly understand the project structure and coding standards.

## Project Overview

**MaaLogs** is a MaaFramework log analysis tool built with Tauri + Vue 3 + TypeScript.

- **Main Flow**: User selects log files, parsers extract task and node information, visualize task execution flow.
- **Parser Architecture**: Extensible parser architecture where each project parser encapsulates its log parsing logic in `src/parsers/projects`.
- **Complex Logic**: Special handling required for nested recognition, multi-threaded log interleaving, etc.
- **Configuration Entry**: Parsers registered via `project-registry.ts`, user-selected parser ID persisted via `useStorage`.
- **Centralized Configuration**: All app configuration centralized in `src/config/` directory.
- **Search Feature**: In-page search supporting tasks, nodes, recognitions, actions, auxiliary logs with fuzzy search, highlight, and navigation.
- **Task Comparison**: Compare two runs of tasks, uses Needleman-Wunsch algorithm to align nodes and identify differences.

## Directory Structure

```
src/
├── App.vue                # Root component
├── main.ts                # Application entry
├── config/                # Application configuration
│   ├── index.ts           # Configuration entry, exports all configs
│   ├── ai.ts              # AI service configuration
│   ├── compare.ts         # Task comparison configuration
│   ├── constants.ts       # Application constants (log filenames, extensions)
│   ├── file.ts            # File processing configuration
│   ├── knowledge.ts        # AI knowledge base configuration
│   └── parser.ts          # Parser configuration
├── platform/              # Platform adaptation layer (Facade pattern)
│   ├── index.ts           # Platform selector, dynamic loading based on environment
│   ├── types.ts           # Platform interface definitions
│   ├── web.ts             # Web implementation (degraded)
│   └── tauri.ts           # Tauri desktop implementation (full)
├── components/            # Vue components
│   ├── AIResultCard.vue   # AI analysis result card
│   ├── AISettingsModal.vue # AI settings modal
│   ├── AnalysisPanel.vue  # Analysis panel (three-column layout)
│   ├── ComparePanel.vue   # Task comparison panel
│   ├── CustomLogPanel.vue # Custom log panel
│   ├── NodeFlowChart.vue  # Node flow chart
│   ├── RouteMap.vue       # Comparison route map
│   ├── SearchPanel.vue    # Search panel
│   └── ...
├── composables/           # Vue Composables
│   ├── useLogParser.ts    # Log parsing
│   ├── useSearch.ts       # Text search (raw logs)
│   ├── useInPageSearch.ts # In-page search (structured data)
│   ├── useStatistics.ts   # Statistics
│   ├── useFileSelection.ts # File selection
│   ├── useCompareSlots.ts # Comparison panel slot management
│   ├── useRunComparison.ts # Task comparison execution
│   └── useStore.ts        # Persistent storage
├── parsers/               # Log parsers
│   ├── index.ts           # Module entry
│   ├── baseParser.ts      # Base parser (shared maa.log parsing)
│   ├── shared.ts          # Shared utility functions
│   ├── correlate.ts       # Log correlation
│   ├── project-registry.ts # Parser registry
│   └── projects/          # Project parser implementations
│       ├── m9a.ts         # M9A parser
│       └── maaend.ts      # MaaEnd parser
├── types/                 # TypeScript type definitions
│   ├── logTypes.ts        # Log-related types
│   └── parserTypes.ts     # Parser-related types
├── utils/                 # Utility functions
│   ├── aiAnalyzer.ts      # AI analysis
│   ├── crypto.ts          # Cryptography utilities
│   ├── diffDetection.ts   # Diff detection (task comparison)
│   ├── file.ts            # File processing
│   ├── format.ts          # Data formatting
│   ├── logger.ts          # Logging system
│   ├── parse.ts           # Parsing utilities
│   ├── pathBuilder.ts     # Task comparison path building (Needleman-Wunsch)
│   └── updater.ts         # App update
├── __tests__/            # Unit tests
│   ├── parsers/           # Parser tests
│   ├── utils/             # Utility tests
│   ├── composables/       # Composable tests
│   ├── platform/          # Platform adapter tests
│   └── integration/       # Integration tests
└── docs/                  # Test sample data
    └── go-service.log     # go-service log sample
```

## Key Files

- [`src/config/`](src/config/): Application configuration files (ai.ts, constants.ts, knowledge.ts, parser.ts, file.ts, compare.ts).
- [`src/config/constants.ts`](src/config/constants.ts): Application constants including LOG_FILE_NAMES, FILE_EXTENSIONS, LOG_LEVELS, LOG_SOURCES.
- [`src/config/knowledge.ts`](src/config/knowledge.ts): AI knowledge base containing recognition algorithms, action types, controllers, etc.
- [`src/parsers/projects/`](src/parsers/projects/): Project parser implementations (m9a.ts, maaend.ts).
- [`src/types/`](src/types/): TypeScript type definitions (logTypes.ts, parserTypes.ts).
- [`src/utils/`](src/utils/): Utility functions (parse.ts, format.ts, aiAnalyzer.ts, file.ts).
- [`src/utils/pathBuilder.ts`](src/utils/pathBuilder.ts): Task comparison path building, implements Needleman-Wunsch global sequence alignment.
- [`src/utils/diffDetection.ts`](src/utils/diffDetection.ts): Task comparison diff detection, identifies failed nodes, duration anomalies, path divergences, etc.
- [`src/components/`](src/components/): Vue components (AnalysisPanel.vue, ComparePanel.vue, etc.).
- [`src/composables/useInPageSearch.ts`](src/composables/useInPageSearch.ts): In-page search composable for tasks, nodes, recognitions, actions.
- [`src/platform/`](src/platform/): Platform adaptation layer with facade pattern.
- [`docs/developers/parser-guide.md`](docs/developers/parser-guide.md): Parser architecture and development guide.

## Coding Standards

### 1. Parser Development Standards

- **Interface Compliance**: All parsers must implement `ProjectParser` interface with `parseMainLog`, `parseAuxLog`, `getAuxLogParserInfo` methods.
- **Single Responsibility**: Each parser handles one project's log format only, do not handle UI logic in parsers.
- **Reuse Shared Functions**: Use utilities from `shared.ts` (e.g., `parseBracketLine`, `extractIdentifier`).
- **Error Handling**: Use try-catch for parsing exceptions to prevent single line failure from crashing entire parsing.

### 2. Type Definition Standards

- **Type Safety**: All function parameters and return values must have explicit TypeScript types.
- **Type Export**: New types must be defined and exported in `parserTypes.ts` or `logTypes.ts`.
- **Avoid any**: Forbidden to use `any` type, use `unknown` with type guards when necessary.

### 3. Vue Component Standards

- **Composition API**: Use Vue 3 Composition API with `<script setup>` syntax.
- **Composables**: Encapsulate reusable logic in `composables/` directory (e.g., `useLogParser`, `useSearch`).
- **Props Types**: Component props must use TypeScript type definitions.

### 4. Configuration Management Standards

- **Centralized Management**: All configurable items should be in `src/config/` directory.
- **Type Annotations**: Configuration must have TypeScript type annotations.
- **JSDoc Comments**: Configuration files must include detailed JSDoc comments explaining each config item's purpose and impact.

### 5. Code Formatting Standards

- **ESLint**: All code must pass `npm run lint`.
- **Prettier**: Code format follows `.prettierrc.json` config.
- **Pre-commit Check**: Run `npm run typecheck` to ensure type correctness.

### 6. Constants Definition Standards

- **Avoid Magic Strings**: Use constants from `src/config/constants.ts` instead of hardcoded strings.
- **Constant Structure**: Use `as const` for immutable constants:

```typescript
export const LOG_FILE_NAMES = {
  MAA_LOG: "maa.log",
  MAA_BAK_LOG: "maa.bak.log",
  GO_SERVICE_LOG: "go-service.log",
} as const;
```

### 7. Comment Standards

- **File Header**: Each file should have `@fileoverview` comment explaining file purpose and main functionality.
- **Function Comments**: Public functions should have JSDoc comments with parameters, return values, and usage examples.
- **Type Comments**: Complex types should include property descriptions and usage examples.
- **Avoid Redundancy**: Simple, self-explanatory code does not need comments.

## Platform Adaptation Layer

MaaLogs uses **Facade Pattern** to share code between Web and Desktop versions. The `platform/` directory provides unified abstract interfaces:

```
                         ┌─────────────────────────────┐
                         │     Upper Business Code     │
                         │  (composables, components)  │
                         └──────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │    platform/index.ts        │
                         │    getPlatform()           │
                         └──────────────┬──────────────┘
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              │                                                   │
              ▼                                                   ▼
┌─────────────────────────────┐         ┌─────────────────────────────┐
│    platform/web.ts          │         │    platform/tauri.ts        │
│    createWebPlatform()     │         │    createTauriPlatform()   │
│    (browser degraded)      │         │    (desktop full)          │
└─────────────────────────────┘         └─────────────────────────────┘
```

**Platform Interface** (`platform/types.ts`):

```typescript
interface Platform {
  vfs: Vfs; // File system
  images: ImageResolver; // Image resolution
  storage: Storage; // Persistent storage
  updater: UpdaterWindow; // Window operations
  logger: LoggerFactory; // Logger factory
  dragDrop: DragDrop; // Drag and drop
  picker: Picker; // Directory picker
}
```

## Code Review Focus

When reviewing code, pay attention to:

- **Interface Implementation Completeness**: Check if parser fully implements all methods of `ProjectParser` interface.
- **Type Definition Consistency**: Check if new types are defined in correct files and exported.
- **Parser Registration**: Check if new parser is exported in `index.ts` and registered.
- **Configuration Centralization**: Check if new config items are added to `src/config/` directory, not hardcoded.
- **Performance Considerations**: Avoid creating large temporary objects in loops, avoid unnecessary repeated parsing.
- **Nested Recognition Handling**: Check if nested recognition is correctly attached to parent node's `nested_nodes`.
- **Log Correlation Correctness**: Check if `correlateAuxLogs` correctly correlates auxiliary logs with tasks.
- **UI Display Completeness**: Check if components correctly display parsed results (nested recognition, disabled status).
- **Search Feature Completeness**: Check if search results display correctly, jump animation works, scroll positioning accurate.
- **Task Comparison Algorithm Correctness**: Check if Needleman-Wunsch algorithm correctly aligns nodes, diff detection accurate.
- **Task Comparison UI Completeness**: Check if diff summary, route map, node details correctly display comparison results.

## Parser Implementation Notes

### M9A Parser Special Handling

1. **Next List Extraction**: Extract from `TaskBase::run_recognition` line's `list=[...]` parameter.
2. **Nested Recognition**: Detected via `MaaContextRunRecognition` API calls, note different process/thread log interleaving.
3. **Disabled Nodes**: Detect `node disabled` log lines, set `status: "disabled"`.
4. **Direct Hit**: `direct_hit` nodes do not set next_list (unless multiple nexts).

### Log Line Format

```
[timestamp][level][processID][threadID][sourceLocation] message [params]
```

Examples (from real MaaEnd project logs):

```bash
# Task Start Event
[2026-03-06 00:27:36.184][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Tasker.Task.Starting] [details={"entry":"SellProductMain","hash":"db798f091cd70cd7","task_id":200000001,"uuid":"94d79698b0266e69"}]

# Node Recognition Execute (enter)
[2026-03-06 00:27:36.192][DBG][Px45380][Tx38246][PipelineTask.cpp][L237] [cur_node_=SellProductMain] [list=[{"anchor":false,"jump_back":false,"name":"SellProductMain"}]] | enter

# Node Recognition Execute (leave)
[2026-03-06 00:27:44.334][TRC][Px45380][Tx38246][TaskBase.cpp][L54] | leave, 584ms

# Node Recognition Success
[2026-03-06 00:27:44.334][INF][Px45380][Tx38246][TaskBase.cpp][L94] reco hit [result.name=SellProductGoToInfrastructureOutpost] [result.box=[514,87,84,21]]

# Node Success Event (DirectHit)
[2026-03-06 00:27:36.210][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.PipelineNode.Succeeded] [details={...}]

# Action Execute - Click
[2026-03-06 00:27:38.171][INF][Px45380][Tx38246][Actuator.cpp][L56] action [i=0] [pipeline_data.repeat=1] [result={"action":"Click","action_id":500000011,"box":[766,196,132,35],"detail":{"contact":0,"point":[815,211],"pressure":1},"name":"SellProductEnterValleyIVOutpost","success":true}]

# Recognition Failure - TemplateMatch
[2026-03-06 00:27:37.576][DBG][Px45380][Tx38246][TemplateMatcher.cpp][L45] SellProductEnterOutpostLocked [all_results_=[{"box":[1178,185,35,48],"score":0.209733}]] [filtered_results_=[]] [best_result_=null] [cost=3ms]

# Node Action Start
[2026-03-06 00:27:44.335][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.Action.Starting] [details={...}]

# Next List Success
[2026-03-06 00:27:44.334][INF][Px45380][Tx38246][Utils/EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.NextList.Succeeded] [details={...}]
```

> **Note**: Above log examples are from MaaEnd project. Other projects have slightly different log formats.

## Search Feature Implementation Notes

### In-Page Search Special Handling

1. **Fuzzy Search**: Numeric fields support partial matching using `includes()`.
2. **Search Scope**: Supports comprehensive search across tasks, nodes, recognitions, actions, auxiliary logs.
3. **Highlight Display**: Search results highlighted, corresponding entries marked in red.
4. **Jump Animation**: Uses CSS `highlight-flash` animation for highlight flashing effect.
5. **Scroll Positioning**: Search results automatically scroll to view center position.
6. **Auto Selection**: Search task ID automatically selects first node, avoiding "Please select node" message.
7. **Search Result Style**: Search panel width 500px, text uses ellipsis to avoid word breaking.
8. **Timing Control**: Highlight state automatically cleared after animation ends.

### Error Screenshot Expansion Logic

1. **Reactive Expansion**: Uses `v-model:expanded-names` with `screenshotExpanded` ref.
2. **State Sync**: Node switching automatically syncs expand/collapse state based on presence of screenshots.
3. **Watch Listener**: Uses `watch` to listen for node changes, automatically adjusts screenshot expansion state.

## Task Comparison Implementation Notes

### Core Algorithm

Task comparison uses **Needleman-Wunsch Global Sequence Alignment Algorithm** to align node sequences from two runs:

1. **Algorithm Principle**: Dynamic programming algorithm, finds optimal alignment between two sequences, allows insertions and deletions (gap).
2. **Score Settings**:
   - Match score: +2 (same node name)
   - Mismatch penalty: -1 (different node names)
   - Gap penalty: -1 (insertion or deletion)
3. **Implementation**: `needlemanWunsch` function in [`src/utils/pathBuilder.ts`](src/utils/pathBuilder.ts).

### Diff Detection Types

| Type               | Description                                     | Severity                  |
| ------------------ | ----------------------------------------------- | ------------------------- |
| Failed Node        | New failure, persistent failure, fixed          | critical / warning / info |
| Duration Anomaly   | Duration change exceeds threshold (default 50%) | warning / info            |
| Path Divergence    | Different branches from same node               | info                      |
| Recognition Change | Recognition algorithm changed                   | warning                   |
| Action Change      | Action type changed                             | info                      |
| Node Count Change  | Total node count different                      | warning                   |

### Implementation Files

- [`src/utils/pathBuilder.ts`](src/utils/pathBuilder.ts): Path building and alignment algorithm
- [`src/utils/diffDetection.ts`](src/utils/diffDetection.ts): Diff detection logic
- [`src/components/ComparePanel.vue`](src/components/ComparePanel.vue): Comparison panel UI
- [`src/components/RouteMap.vue`](src/components/RouteMap.vue): Route map component
- [`src/components/PathDetail.vue`](src/components/PathDetail.vue): Node detail component

### Configuration

Task comparison configuration in [`src/config/compare.ts`](src/config/compare.ts):

```typescript
export const compareConfig = {
  durationChangeThreshold: 0.5,           // Duration change threshold
  reportFirstPathDivergenceOnly: true,    // Report only first path divergence
  diffSeverityOrder: [...],               // Diff severity order
};
```

## Related Documentation

- [Parser Architecture and Development Guide](docs/developers/parser-guide.md)
- [Development Guide](docs/developers/development-guide.md)
- [Contribution Guide](docs/developers/CONTRIBUTING.md)
- [MaaFramework](https://github.com/MaaXYZ/MaaFramework) - Automation framework
- [Naive UI Documentation](https://www.naiveui.com/)
- [Tauri Documentation](https://tauri.app/)

## Dynamic Adjustment Area

> The following content can be dynamically adjusted during development

### Current Development Focus

- Task comparison feature improvement
- Parser stability optimization
- AI analysis feature improvement
- User experience enhancement

### Known Issues

- None

### TODO

- None

---

Last updated: 2026-03-09
