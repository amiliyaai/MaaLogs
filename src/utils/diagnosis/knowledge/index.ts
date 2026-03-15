/**
 * @fileoverview 诊断知识库
 *
 * 包含识别算法知识、动作类型知识、语义知识等。
 * 用于辅助诊断推理。
 *
 * @module utils/diagnosis/knowledge
 */

interface RecognitionKnowledge {
  algorithm: string;
  displayName: string;
  description: string;
  commonIssues: Array<{
    issue: string;
    cause: string;
    suggestion: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  parameters: Array<{
    name: string;
    type: 'number' | 'string' | 'boolean' | 'array' | 'object';
    description: string;
    defaultValue?: unknown;
  }>;
}

interface ActionKnowledge {
  type: string;
  displayName: string;
  description: string;
  requirements: Array<{
    param: string;
    required: boolean;
    description: string;
    defaultValue?: unknown;
  }>;
  commonIssues: Array<{
    issue: string;
    cause: string;
    suggestion: string;
  }>;
}

interface SemanticsKnowledge {
  nodeKeywords: Record<string, {
    keywords: string[];
    intent: string;
    target?: string;
    state?: string;
    action?: string;
  }>;
  sceneKeywords: Record<string, string[]>;
  actionKeywords: Record<string, string[]>;
  stateKeywords: Record<string, string[]>;
}

interface ThresholdKnowledge {
  algorithm: string;
  defaultThreshold: number;
  recommendedRange: [number, number];
  description: string;
  factors: Array<{
    factor: string;
    adjustment: 'increase' | 'decrease';
    reason: string;
  }>;
}

interface CausalKnowledge {
  effect: string;
  causes: Array<{
    cause: string;
    probability: number;
    conditions: string[];
    evidence: string[];
  }>;
}

export interface KnowledgeBase {
  recognition: RecognitionKnowledge[];
  actions: ActionKnowledge[];
  semantics: SemanticsKnowledge;
  thresholds: ThresholdKnowledge[];
  causal: CausalKnowledge[];
}

function buildKnowledgeBase(): KnowledgeBase {
  const recognition: RecognitionKnowledge[] = [
    {
      algorithm: 'TemplateMatch',
      displayName: '模板匹配',
      description: '使用预定义的图像模板在屏幕上进行匹配',
      commonIssues: [
        {
          issue: '模板图片与实际屏幕差异大',
          cause: '模板图片分辨率、颜色空间或UI变化',
          suggestion: '更新模板图片或使用多种模板',
          severity: 'high',
        },
        {
          issue: '阈值过高',
          cause: '默认阈值 0.85 过高导致匹配失败',
          suggestion: '适当降低阈值到 0.7-0.8',
          severity: 'medium',
        },
        {
          issue: 'ROI 范围不当',
          cause: 'ROI 范围过小或位置偏移',
          suggestion: '扩大 ROI 或调整位置',
          severity: 'medium',
        },
      ],
      parameters: [
        { name: 'template', type: 'string', description: '模板图片路径' },
        { name: 'threshold', type: 'number', description: '匹配阈值', defaultValue: 0.85 },
        { name: 'roi', type: 'array', description: '感兴趣区域 [x, y, w, h]' },
        { name: 'method', type: 'string', description: '匹配方法', defaultValue: 'TM_CCOEFF_NORMED' },
      ],
    },
    {
      algorithm: 'OCR',
      displayName: '光学字符识别',
      description: '识别屏幕上的文字',
      commonIssues: [
        {
          issue: '文字未识别',
          cause: '字体过小、颜色相近或语言不支持',
          suggestion: '调整 ROI、降低阈值或使用专用语言包',
          severity: 'high',
        },
        {
          issue: '识别错误',
          cause: '相似字符、多语言混淆',
          suggestion: '使用 expected 参数限定范围',
          severity: 'medium',
        },
      ],
      parameters: [
        { name: 'expected', type: 'array', description: '期望识别到的文字列表' },
        { name: 'threshold', type: 'number', description: '识别阈值', defaultValue: 0.7 },
        { name: 'roi', type: 'array', description: '感兴趣区域' },
        { name: 'replace', type: 'object', description: '识别后替换映射' },
      ],
    },
    {
      algorithm: 'ColorMatch',
      displayName: '颜色匹配',
      description: '匹配指定颜色的区域',
      commonIssues: [
        {
          issue: '颜色范围过窄',
          cause: '屏幕色差导致匹配失败',
          suggestion: '适当扩大颜色范围',
          severity: 'medium',
        },
      ],
      parameters: [
        { name: 'lower', type: 'array', description: '颜色下限 [r, g, b]' },
        { name: 'upper', type: 'array', description: '颜色上限 [r, g, b]' },
        { name: 'roi', type: 'array', description: '感兴趣区域' },
        { name: 'method', type: 'string', description: '匹配方法', defaultValue: 'RGB' },
      ],
    },
    {
      algorithm: 'FeatureMatch',
      displayName: '特征匹配',
      description: '使用 SIFT/ORB 等特征点匹配',
      commonIssues: [
        {
          issue: '特征点不足',
          cause: '图像纹理少或角度变化大',
          suggestion: '使用更多模板或改用其他算法',
          severity: 'high',
        },
      ],
      parameters: [
        { name: 'template', type: 'string', description: '模板图片路径' },
        { name: 'threshold', type: 'number', description: '匹配阈值', defaultValue: 0.7 },
        { name: 'roi', type: 'array', description: '感兴趣区域' },
      ],
    },
    {
      algorithm: 'NeuralNetwork',
      displayName: '神经网络识别',
      description: '使用深度学习模型进行识别',
      commonIssues: [
        {
          issue: '模型无法加载',
          cause: '模型路径错误或格式不支持',
          suggestion: '检查模型路径和格式',
          severity: 'high',
        },
        {
          issue: '识别结果不稳定',
          cause: '模型精度不足或场景变化',
          suggestion: '使用后处理或调整阈值',
          severity: 'medium',
        },
      ],
      parameters: [
        { name: 'model', type: 'string', description: '模型路径' },
        { name: 'threshold', type: 'number', description: '识别阈值', defaultValue: 0.6 },
        { name: 'roi', type: 'array', description: '感兴趣区域' },
      ],
    },
    {
      algorithm: 'DirectHit',
      displayName: '直接命中',
      description: '无需识别，直接执行动作',
      commonIssues: [],
      parameters: [],
    },
  ];

  const actions: ActionKnowledge[] = [
    {
      type: 'Click',
      displayName: '点击',
      description: '在指定位置或区域执行点击操作',
      requirements: [
        { param: 'x', required: false, description: '点击 X 坐标' },
        { param: 'y', required: false, description: '点击 Y 坐标' },
        { param: 'box', required: false, description: '点击区域 [x, y, w, h]' },
        { param: 'target_offset', required: false, description: '相对于识别结果的偏移' },
      ],
      commonIssues: [
        {
          issue: '点击位置偏移',
          cause: 'target_offset 计算错误或未设置',
          suggestion: '检查 target_offset 参数',
        },
        {
          issue: '点击无反应',
          cause: '坐标超出屏幕或层级不正确',
          suggestion: '检查坐标是否在屏幕范围内',
        },
      ],
    },
    {
      type: 'Swipe',
      displayName: '滑动',
      description: '在指定区域执行滑动操作',
      requirements: [
        { param: 'begin', required: true, description: '起始点 [x, y]' },
        { param: 'end', required: true, description: '结束点 [x, y]' },
        { param: 'duration', required: false, description: '滑动时长(ms)', defaultValue: 300 },
      ],
      commonIssues: [
        {
          issue: '滑动距离不足',
          cause: 'duration 过短或距离计算错误',
          suggestion: '增加 duration 或调整坐标',
        },
      ],
    },
    {
      type: 'InputText',
      displayName: '输入文本',
      description: '在焦点位置输入文本',
      requirements: [
        { param: 'text', required: true, description: '要输入的文本' },
      ],
      commonIssues: [
        {
          issue: '输入位置错误',
          cause: '未正确聚焦到输入框',
          suggestion: '先执行点击聚焦',
        },
      ],
    },
    {
      type: 'Key',
      displayName: '按键',
      description: '模拟按键操作',
      requirements: [
        { param: 'key', required: true, description: '按键码' },
      ],
      commonIssues: [],
    },
    {
      type: 'Wait',
      displayName: '等待',
      description: '等待指定时间',
      requirements: [
        { param: 'time', required: true, description: '等待时长(ms)' },
      ],
      commonIssues: [],
    },
    {
      type: 'Custom',
      displayName: '自定义动作',
      description: '执行自定义动作',
      requirements: [
        { param: 'name', required: true, description: '动作名称' },
      ],
      commonIssues: [
        {
          issue: '动作执行失败',
          cause: '自定义动作未实现或参数错误',
          suggestion: '检查动作实现和参数',
        },
      ],
    },
  ];

  const semantics: SemanticsKnowledge = {
    nodeKeywords: {
      click: {
        keywords: ['click', 'tap', 'press', 'enter', 'go', 'select', 'buy', 'sell'],
        intent: 'click_interaction',
        action: 'click',
      },
      navigation: {
        keywords: ['goto', 'back', 'return', 'next', 'prev', 'open', 'close'],
        intent: 'navigation',
        action: 'navigate',
      },
      scroll: {
        keywords: ['scroll', 'swipe', 'drag', 'move'],
        intent: 'scroll_interaction',
        action: 'swipe',
      },
      wait: {
        keywords: ['wait', 'sleep', 'delay'],
        intent: 'waiting',
        action: 'wait',
      },
      collect: {
        keywords: ['collect', 'gather', 'pick', 'receive', 'claim'],
        intent: 'collect',
        target: 'resource',
      },
      upgrade: {
        keywords: ['upgrade', 'enhance', 'levelup', 'evolve'],
        intent: 'upgrade',
        target: 'item',
      },
      locked: {
        keywords: ['locked', 'lock', 'seal', 'unavailable'],
        intent: 'check_state',
        state: 'locked',
      },
      ready: {
        keywords: ['ready', 'available', 'active', 'on'],
        intent: 'check_state',
        state: 'ready',
      },
    },
    sceneKeywords: {
      shop: ['shop', 'store', 'buy', 'sell', 'trade', 'merchant'],
      battle: ['battle', 'fight', 'combat', 'enemy', 'boss'],
      resource: ['resource', 'collect', 'mine', 'farm', 'gather'],
      upgrade: ['upgrade', 'enhance', 'levelup', 'evolve'],
      inventory: ['inventory', 'bag', 'store', 'item'],
      main: ['main', 'home', 'base', 'village'],
    },
    actionKeywords: {
      click: ['click', 'tap', 'press'],
      swipe: ['swipe', 'scroll', 'drag'],
      input: ['input', 'type', 'enter'],
    },
    stateKeywords: {
      locked: ['locked', 'seal', 'disable', 'unavailable'],
      ready: ['ready', 'available', 'active', 'on'],
      disabled: ['disabled', 'gray', 'grey'],
    },
  };

  const thresholds: ThresholdKnowledge[] = [
    {
      algorithm: 'TemplateMatch',
      defaultThreshold: 0.85,
      recommendedRange: [0.7, 0.9],
      description: '模板匹配推荐阈值',
      factors: [
        { factor: '模板质量高', adjustment: 'increase', reason: '高质量模板可以设置更高阈值' },
        { factor: '屏幕分辨率变化大', adjustment: 'decrease', reason: '需要更宽松的匹配条件' },
        { factor: 'UI 经常变化', adjustment: 'decrease', reason: '适应 UI 变化' },
      ],
    },
    {
      algorithm: 'OCR',
      defaultThreshold: 0.7,
      recommendedRange: [0.5, 0.85],
      description: 'OCR 推荐阈值',
      factors: [
        { factor: '文字清晰', adjustment: 'increase', reason: '清晰文字可提高阈值' },
        { factor: '多语言混合', adjustment: 'decrease', reason: '需要更宽松匹配' },
        { factor: '使用 expected 限制', adjustment: 'increase', reason: '有 expected 时可提高阈值' },
      ],
    },
    {
      algorithm: 'FeatureMatch',
      defaultThreshold: 0.7,
      recommendedRange: [0.5, 0.85],
      description: '特征匹配推荐阈值',
      factors: [
        { factor: '特征点丰富', adjustment: 'increase', reason: '丰富特征可提高阈值' },
        { factor: '图像角度变化', adjustment: 'decrease', reason: '需要更宽松匹配' },
      ],
    },
  ];

  const causal: CausalKnowledge[] = [
    {
      effect: '识别无匹配',
      causes: [
        {
          cause: '目标不在屏幕上',
          probability: 0.3,
          conditions: ['allResults.length === 0', 'box === null'],
          evidence: ['识别结果为空', '未找到目标'],
        },
        {
          cause: '阈值过高',
          probability: 0.25,
          conditions: ['score < threshold', 'allResults.length > 0'],
          evidence: ['有结果但被过滤', '分数低于阈值'],
        },
        {
          cause: 'ROI 范围不正确',
          probability: 0.2,
          conditions: ['box 不在 ROI 内'],
          evidence: ['识别区域与预期不符'],
        },
        {
          cause: '模板图片过时',
          probability: 0.15,
          conditions: ['算法为 TemplateMatch', '最近 UI 有更新'],
          evidence: ['模板与实际界面差异大'],
        },
        {
          cause: '识别算法选择不当',
          probability: 0.1,
          conditions: ['算法不适合当前场景'],
          evidence: ['其他算法可能更适合'],
        },
      ],
    },
    {
      effect: '识别结果分数低',
      causes: [
        {
          cause: '目标区域图像质量差',
          probability: 0.35,
          conditions: ['图像模糊', '颜色失真'],
          evidence: ['截图质量不佳'],
        },
        {
          cause: '阈值设置过高',
          probability: 0.3,
          conditions: ['threshold > 0.85'],
          evidence: ['阈值超过推荐范围'],
        },
        {
          cause: '模板匹配度下降',
          probability: 0.2,
          conditions: ['模板与实际有差异'],
          evidence: ['模板需要更新'],
        },
        {
          cause: '屏幕分辨率不匹配',
          probability: 0.15,
          conditions: ['模板分辨率与屏幕不同'],
          evidence: ['需要缩放处理'],
        },
      ],
    },
    {
      effect: '动作执行失败',
      causes: [
        {
          cause: '目标矩形无效',
          probability: 0.35,
          conditions: ['rect 无效', '坐标超出范围'],
          evidence: ['错误信息包含 rect'],
        },
        {
          cause: 'target_offset 参数错误',
          probability: 0.3,
          conditions: ['offset 计算错误'],
          evidence: ['错误信息包含 offset'],
        },
        {
          cause: '点击位置被遮挡',
          probability: 0.2,
          conditions: ['UI 层级变化'],
          evidence: ['点击了其他元素'],
        },
        {
          cause: '窗口失去焦点',
          probability: 0.15,
          conditions: ['应用不在前台'],
          evidence: ['窗口状态异常'],
        },
      ],
    },
  ];

  return {
    recognition,
    actions,
    semantics,
    thresholds,
    causal,
  };
}

export const knowledgeBase: KnowledgeBase = buildKnowledgeBase();

export function getRecognitionKnowledge(
  algorithm: string
): RecognitionKnowledge | undefined {
  return knowledgeBase.recognition.find(
    r => r.algorithm.toLowerCase() === algorithm.toLowerCase()
  );
}

export function getActionKnowledge(
  actionType: string
): ActionKnowledge | undefined {
  return knowledgeBase.actions.find(
    a => a.type.toLowerCase() === actionType.toLowerCase()
  );
}

export function getThresholdKnowledge(
  algorithm: string
): ThresholdKnowledge | undefined {
  return knowledgeBase.thresholds.find(
    t => t.algorithm.toLowerCase() === algorithm.toLowerCase()
  );
}

export function getCausalKnowledge(
  effect: string
): CausalKnowledge | undefined {
  return knowledgeBase.causal.find(
    c => c.effect === effect
  );
}
