/**
 * @fileoverview 内置最小知识集
 *
 * 作为兜底方案，当预构建数据不存在时使用
 * 包含 MaaFramework 核心知识
 *
 * @module rag/prebuilt/minimal
 */

import type { PrebuiltKnowledge } from '@/rag/types';

const MINIMAL_CHUNKS = [
  {
    id: 'min-recognition-template',
    text: `模板匹配识别 (TemplateMatch)

模板匹配是最基础的图像识别方式，通过在屏幕截图中搜索与模板图片相似的区域来定位目标。

参数：
- template: 模板图片路径
- threshold: 相似度阈值，默认 0.7，范围 0-1
- roi: 搜索区域，格式 [x, y, width, height]

常见问题：
- 识别失败：尝试降低 threshold 阈值
- 误识别：提高 threshold 阈值或缩小 roi 区域
- 性能慢：缩小 roi 区域减少搜索范围`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '模板匹配识别',
      category: '识别算法',
    },
    createdAt: 0,
  },
  {
    id: 'min-recognition-ocr',
    text: `OCR 文字识别

OCR 用于识别屏幕上的文字内容，支持中英文等多种语言。

参数：
- text: 期望识别到的文字内容
- roi: 识别区域
- language: 语言设置，如 "ch" "en"

常见问题：
- 识别错误：检查 language 设置是否正确
- 识别失败：尝试扩大 roi 区域或调整文字大小
- 性能慢：缩小 roi 区域`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: 'OCR 文字识别',
      category: '识别算法',
    },
    createdAt: 0,
  },
  {
    id: 'min-recognition-color',
    text: `颜色匹配识别 (ColorMatch)

颜色匹配用于检测屏幕特定区域是否包含目标颜色。

参数：
- color: 目标颜色，格式 [r, g, b]
- threshold: 颜色差异阈值
- roi: 检测区域
- count: 需要匹配的像素点数量

常见问题：
- 匹配失败：检查颜色值是否正确，调整 threshold
- 误匹配：提高 count 要求或缩小 roi`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '颜色匹配识别',
      category: '识别算法',
    },
    createdAt: 0,
  },
  {
    id: 'min-action-click',
    text: `点击动作 (Click)

点击动作用于模拟用户点击屏幕指定位置。

参数：
- target: 点击目标，可以是识别结果或固定坐标
- target_offset: 点击偏移，格式 [x, y]

常见问题：
- 点击位置不准：检查 target_offset 设置
- 点击无响应：确认点击位置是否正确，可能需要等待界面加载`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '点击动作',
      category: '动作类型',
    },
    createdAt: 0,
  },
  {
    id: 'min-action-swipe',
    text: `滑动动作 (Swipe)

滑动动作用于模拟用户在屏幕上滑动。

参数：
- start: 起始点坐标
- end: 结束点坐标
- duration: 滑动持续时间（毫秒）

常见问题：
- 滑动距离不对：检查 start 和 end 坐标
- 滑动太快/太慢：调整 duration 参数`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '滑动动作',
      category: '动作类型',
    },
    createdAt: 0,
  },
  {
    id: 'min-action-input',
    text: `文字输入动作 (InputText)

文字输入用于向输入框输入文字内容。

参数：
- text: 要输入的文字内容
- input_field: 输入框位置（可选）

常见问题：
- 输入失败：确保输入框已获得焦点
- 中文输入问题：检查输入法状态`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '文字输入动作',
      category: '动作类型',
    },
    createdAt: 0,
  },
  {
    id: 'min-action-wait',
    text: `等待动作 (Wait)

等待动作用于暂停执行，等待界面变化或加载完成。

参数：
- time: 等待时间（毫秒）
- target: 等待目标出现（可选）

常见问题：
- 等待时间不够：增加 time 参数
- 等待目标未出现：检查 target 识别是否正确`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '等待动作',
      category: '动作类型',
    },
    createdAt: 0,
  },
  {
    id: 'min-task-next',
    text: `任务流程控制 - Next 列表

Next 列表定义了任务执行成功后的下一步任务。

格式：
"next": ["TaskA", "TaskB"]

特点：
- 按顺序尝试执行列表中的任务
- 第一个成功的任务会被执行
- 可以用于实现条件分支

常见问题：
- 任务未执行：检查任务名称是否正确
- 循环执行：检查 next 链是否存在循环`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '任务流程控制',
      category: '任务配置',
    },
    createdAt: 0,
  },
  {
    id: 'min-task-on-error',
    text: `任务错误处理 - OnError

OnError 定义了任务执行失败时的处理方式。

格式：
"on_error": ["FallbackTask"]

常见错误处理策略：
- 重试：重新执行当前任务
- 回退：执行备用任务
- 跳过：跳过当前任务继续执行

常见问题：
- 错误处理未触发：检查任务是否真正失败
- 错误循环：避免 on_error 任务本身也失败`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '任务错误处理',
      category: '任务配置',
    },
    createdAt: 0,
  },
  {
    id: 'min-debug-log',
    text: `日志调试技巧

MaaFramework 提供详细的日志输出，帮助排查问题。

日志级别：
- INF: 普通信息
- WRN: 警告信息
- ERR: 错误信息
- DBG: 调试信息

关键日志：
- node hit: 识别成功
- node miss: 识别失败
- action: 动作执行
- error: 错误详情

调试建议：
1. 查看 node miss 日志了解识别失败原因
2. 检查 threshold 和 roi 参数
3. 使用截图工具确认实际画面`,
    embedding: [] as number[],
    metadata: {
      source: 'MaaFramework',
      sourceType: 'framework',
      title: '日志调试技巧',
      category: '调试',
    },
    createdAt: 0,
  },
];

function generateMinimalEmbedding(): number[] {
  return Array(384)
    .fill(0)
    .map((_, i) => Math.sin(i * 0.1) * 0.5);
}

MINIMAL_CHUNKS.forEach((chunk, index) => {
  chunk.embedding = generateMinimalEmbedding();
  chunk.createdAt = Date.now() + index;
});

export const minimalKnowledge: PrebuiltKnowledge = {
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  chunks: MINIMAL_CHUNKS,
  metadata: {
    totalChunks: MINIMAL_CHUNKS.length,
    sources: ['MaaFramework'],
  },
};

export default minimalKnowledge;
