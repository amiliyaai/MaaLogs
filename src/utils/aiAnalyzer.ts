/**
 * @fileoverview AI 分析工具模块
 *
 * 本模块提供 AI 驱动的日志分析功能，包括：
 * - 多服务商支持（OpenAI、Anthropic、DeepSeek 等）
 * - 失败节点原因分析
 * - 系统提示词集成 MAA 框架知识库
 *
 * @module utils/aiAnalyzer
 * @author MaaLogs Team
 * @license MIT
 */

import type { TaskInfo, NodeInfo, AuxLogEntry } from "../types/logTypes";

/**
 * AI 服务商类型
 */
export type AIProvider = 
  | "openai" 
  | "anthropic" 
  | "gemini"
  | "xai"
  | "deepseek"
  | "zhipu" 
  | "minimax" 
  | "moonshot" 
  | "step"
  | "siliconflow"
  | "openrouter"
  | "volcengine"
  | "aliyun"
  | "tencent"
  | "custom";

/**
 * AI 配置接口
 */
export interface AIConfig {
  provider: AIProvider;
  apiKeys: Record<AIProvider, string>;
  model: string;
  baseUrl: string;
}

/**
 * 失败分析结果接口
 */
export interface FailureAnalysis {
  nodeName: string;
  nodeId: number;
  taskName: string;
  cause: string;
  suggestion: string;
  confidence: number;
}

/**
 * localStorage 键名
 */
export const AI_CONFIG_KEY = "maa-logs-ai-config";

/**
 * 默认 AI 配置
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: "openai",
  apiKeys: {
    openai: "",
    anthropic: "",
    gemini: "",
    xai: "",
    deepseek: "",
    zhipu: "",
    minimax: "",
    moonshot: "",
    step: "",
    siliconflow: "",
    openrouter: "",
    volcengine: "",
    aliyun: "",
    tencent: "",
    custom: ""
  },
  model: "gpt-4o-mini",
  baseUrl: ""
};

/**
 * 服务商模型映射表
 */
export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openai: ["gpt-5.2", "gpt-5.1", "gpt-5-medium", "gpt-5-high"],
  anthropic: ["claude-3-5-sonnet-20241022"],
  gemini: ["gemini-3-pro", "gemini-3-flash", "gemini-2.5-pro", "gemini-2.5-flash"],
  xai: ["grok-2-1212", "grok-2-vision-1212"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  zhipu: ["glm-5", "glm-4-flash"],
  minimax: ["MiniMax-M2.5"],
  moonshot: ["moonshot-v1-8k-vision-preview"],
  step: ["step-1v-8k"],
  siliconflow: [
    "Qwen/Qwen2.5-14B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct",
    "DeepSeek-V2-Chat",
    "meta-llama/Llama-3.1-8B-Instruct",
    "THUDM/glm-4-9b-chat"
  ],
  openrouter: [
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash",
    "deepseek/deepseek-chat"
  ],
  volcengine: [
    "doubao-pro-32k"
  ],
  aliyun: [
    "qwen-plus",
    "qwen-max",
    "qwen-flash"
  ],
  tencent: [
    "hunyuan-pro"
  ],
  custom: []
};

/**
 * 服务商信息映射表
 */
export const PROVIDER_INFO: Record<AIProvider, { name: string; defaultBaseUrl: string }> = {
  openai: { name: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  anthropic: { name: "Anthropic Claude", defaultBaseUrl: "https://api.anthropic.com" },
  gemini: { name: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1" },
  xai: { name: "xAI Grok", defaultBaseUrl: "https://api.x.ai/v1" },
  deepseek: { name: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com/v1" },
  zhipu: { name: "智谱 AI", defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  minimax: { name: "MiniMax", defaultBaseUrl: "https://api.minimax.chat/v1" },
  moonshot: { name: "月之暗面", defaultBaseUrl: "https://api.moonshot.cn/v1" },
  step: { name: "阶跃星辰", defaultBaseUrl: "https://api.stepfun.com/v1" },
  siliconflow: { name: "硅基流动", defaultBaseUrl: "https://api.siliconflow.cn/v1" },
  openrouter: { name: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1" },
  volcengine: { name: "火山引擎", defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  aliyun: { name: "阿里云", defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  tencent: { name: "腾讯云", defaultBaseUrl: "https://hunyuan.tencentcloudapi.com" },
  custom: { name: "自定义", defaultBaseUrl: "" }
};

/**
 * MAA 框架知识库
 * 
 * 包含识别算法、动作类型、节点状态等相关知识
 * 用于 RAG 检索增强
 */
const MAA_KNOWLEDGE = {
  recognition: {
    DirectHit: {
      desc: "直接命中，不进行识别，直接执行动作",
      failures: [],
      suggestions: []
    },
    TemplateMatch: {
      desc: "模板匹配，在屏幕中查找与模板相似的区域",
      params: ["template", "threshold", "roi", "method", "green_mask"],
      failures: [
        "模板图片过时，与当前界面差异大",
        "阈值(threshold)设置过高",
        "分辨率变化导致模板比例不匹配",
        "绿色蒙版(green_mask)区域设置不当"
      ],
      suggestions: [
        "更新模板图片为当前最新",
        "适当降低匹配阈值（0.7~0.8）",
        "确认分辨率是否为 720p (1280x720)",
        "减少不必要的 green_mask 区域"
      ]
    },
    FeatureMatch: {
      desc: "特征匹配，抗透视和尺寸变化",
      params: ["template", "count", "detector"],
      failures: [
        "模板特征点过少（建议 64x64 以上）",
        "特征检测器不支持",
        "重复纹理导致误匹配"
      ],
      suggestions: [
        "使用纹理丰富的模板",
        "使用 SIFT 检测器提高精度",
        "减少重复纹理区域"
      ]
    },
    ColorMatch: {
      desc: "颜色匹配，根据颜色判断",
      params: ["lower", "upper", "method"],
      failures: [
        "颜色阈值过窄",
        "偏差",
        "颜色范围(光照变化导致颜色lower/upper)设置错误"
      ],
      suggestions: [
        "使用 RGB 范围而非单一颜色",
        "增加颜色容差",
        "调整 lower/upper 范围"
      ]
    },
    OCR: {
      desc: "光学字符识别，识别屏幕文字",
      params: ["expected", "model", "with_prob"],
      failures: [
        "文字区域为空或无文字",
        "文字模糊不清晰",
        "字体不支持或语言包缺失",
        "expected 参数设置错误"
      ],
      suggestions: [
        "检查文字是否存在",
        "提高截图质量/分辨率",
        "尝试其他 OCR 参数",
        "确认 expected 文字是否正确"
      ]
    },
    NeuralNetworkClassify: {
      desc: "深度学习分类",
      params: ["model", "expected", "threshold"],
      failures: ["模型加载失败", "分类阈值过高", "输入图像异常"],
      suggestions: ["检查模型文件", "降低阈值", "检查输入图像"]
    },
    NeuralNetworkDetect: {
      desc: "深度学习目标检测",
      params: ["model", "expected", "threshold"],
      failures: ["模型加载失败", "检测阈值过高", "无检测结果"],
      suggestions: ["检查模型文件", "降低阈值", "检查目标是否存在"]
    },
    Custom: {
      desc: "自定义识别，由 Go Service 处理",
      params: ["custom_recognition"],
      failures: [
        "Go Service 未启动或崩溃",
        "自定义识别逻辑执行异常",
        "参数传递错误"
      ],
      suggestions: [
        "检查 Go Service 状态",
        "查看自定义识别日志",
        "确认参数格式正确"
      ]
    }
  },
  actions: {
    DoNothing: { desc: "不执行任何操作", failures: [], suggestions: [] },
    Click: {
      desc: "点击指定坐标或区域",
      params: ["target", "target_offset", "contact", "pressure"],
      failures: [
        "坐标超出屏幕范围",
        "点击无响应（设备问题）",
        "target 引用了不存在的节点"
      ],
      suggestions: [
        "检查坐标是否在屏幕范围内",
        "检查设备连接状态",
        "确认 target 节点是否存在"
      ]
    },
    LongPress: {
      desc: "长按",
      params: ["target", "duration", "contact"],
      failures: ["长按时间过短", "目标位置不正确"],
      suggestions: ["增加 duration 时间", "检查 target 坐标"]
    },
    Swipe: {
      desc: "滑动",
      params: ["begin", "end", "duration", "end_hold"],
      failures: ["滑动距离过短", "滑动速度过快"],
      suggestions: ["调整 begin/end 坐标", "增加 duration 时间"]
    },
    MultiSwipe: {
      desc: "多指滑动",
      params: ["swipes"],
      failures: ["多点触控不支持", "手势参数错误"],
      suggestions: ["检查设备是否支持多点触控", "验证 swipes 参数格式"]
    },
    ClickKey: {
      desc: "按键",
      params: ["key"],
      failures: ["按键码无效", "按键无响应"],
      suggestions: ["检查 key 值是否正确", "确认应用支持该按键"]
    },
    InputText: {
      desc: "输入文本",
      params: ["input_text"],
      failures: ["输入框未获得焦点", "文本编码问题"],
      suggestions: ["先点击输入框获取焦点", "检查文本编码"]
    },
    StartApp: {
      desc: "启动应用",
      params: ["package"],
      failures: ["应用包名错误", "应用未安装"],
      suggestions: ["确认 package 名称正确", "检查应用是否已安装"]
    },
    StopApp: {
      desc: "停止应用",
      params: ["package"],
      failures: ["应用包名错误", "应用未运行"],
      suggestions: ["确认 package 名称正确", "检查应用是否在运行"]
    },
    Command: {
      desc: "执行外部命令",
      params: ["exec", "args"],
      failures: ["命令不存在", "执行权限不足"],
      suggestions: ["检查命令路径", "确认执行权限"]
    },
    Shell: {
      desc: "执行 ADB Shell",
      params: ["cmd"],
      failures: ["ADB 命令错误", "设备未连接"],
      suggestions: ["检查 cmd 语法", "确认 ADB 连接正常"]
    },
    Custom: {
      desc: "自定义动作",
      params: ["custom_action"],
      failures: [
        "Go Service 未启动",
        "自定义动作执行异常"
      ],
      suggestions: [
        "检查 Go Service 日志",
        "确认动作已注册"
      ]
    }
  },
  controllers: {
    adb: {
      desc: "Android Debug Bridge，连接安卓设备/模拟器",
      screencap: ["EncodeToFileAndPull", "Encode", "RawWithGzip", "MinicapDirect", "MinicapStream"],
      input: ["AdbShell", "Minitouch", "Maatouch"]
    },
    win32: {
      desc: "Windows 窗口控制",
      screencap: ["FramePool", "PrintWindow", "GDI", "DXGI"],
      input: ["Seize", "SendMessage", "PostMessage"]
    },
    PlayCover: {
      desc: "iOS 模拟器控制"
    }
  }
};

/**
 * 获取 MAA 框架系统提示词
 *
 * @returns 系统提示词字符串
 */
function getFrameworkPrompt(): string {
  return `你是一个 MAA (MaaxX Auto) 自动化框架的专家。

## 框架概述
MAA 是一个基于图像识别技术的游戏自动化框架，使用 C++20 编写。
核心概念：Pipeline（流水线）、Node（节点）、Task（任务）、Controller（控制器）

## 识别算法类型
${Object.entries(MAA_KNOWLEDGE.recognition).map(([name, info]) => 
  `- ${name}: ${info.desc}`
).join('\n')}

## 动作类型
${Object.entries(MAA_KNOWLEDGE.actions).map(([name, info]) => 
  `- ${name}: ${info.desc}`
).join('\n')}

## 控制器类型
${Object.entries(MAA_KNOWLEDGE.controllers).map(([name, info]) => 
  `- ${name}: ${info.desc}`
).join('\n')}

## 日志字段含义
- reco_details: 识别结果详情（algorithm, box, detail, name）
- action_details: 动作执行详情（action, box, detail, success）
- next_list: 后续节点列表（name, anchor, jump_back）`;
}

/**
 * 构建 AI 分析提示词
 *
 * @param tasks - 任务列表
 * @param failedNodes - 失败节点列表
 * @param auxLogs - 附加日志（可选）
 * @returns 构建好的提示词
 */
export function buildAnalysisPrompt(tasks: TaskInfo[], failedNodes: NodeInfo[], auxLogs?: AuxLogEntry[]): string {
  let prompt = getFrameworkPrompt() + '\n\n';

  const uniqueAlgorithms = [...new Set(failedNodes.map(n => n.reco_details?.algorithm).filter(Boolean))];
  const uniqueActions = [...new Set(failedNodes.map(n => n.action_details?.action).filter(Boolean))];
  
  prompt += '## 本次分析相关的知识\n';
  
  for (const algo of uniqueAlgorithms) {
    const info = MAA_KNOWLEDGE.recognition[algo as keyof typeof MAA_KNOWLEDGE.recognition];
    if (info) {
      prompt += `\n### ${algo} 识别\n`;
      prompt += `描述: ${info.desc}\n`;
      if (info.failures?.length) prompt += `常见失败: ${info.failures.join('; ')}\n`;
      if (info.suggestions?.length) prompt += `建议: ${info.suggestions.join('; ')}\n`;
    }
  }

  for (const action of uniqueActions) {
    const info = MAA_KNOWLEDGE.actions[action as keyof typeof MAA_KNOWLEDGE.actions];
    if (info) {
      prompt += `\n### ${action} 动作\n`;
      prompt += `描述: ${info.desc}\n`;
      if (info.failures?.length) prompt += `常见失败: ${info.failures.join('; ')}\n`;
      if (info.suggestions?.length) prompt += `建议: ${info.suggestions.join('; ')}\n`;
    }
  }

  prompt += '\n## 失败节点详情\n';
  for (const node of failedNodes) {
    const task = tasks.find(t => t.task_id === node.task_id);
    prompt += `\n### 节点: ${node.name} (ID: ${node.node_id})\n`;
    prompt += `- 任务: ${task?.entry || 'Unknown'}\n`;
    prompt += `- 识别算法: ${node.reco_details?.algorithm || 'N/A'}\n`;
    prompt += `- 识别结果: ${JSON.stringify(node.reco_details?.detail || {})}\n`;
    prompt += `- 动作类型: ${node.action_details?.action || 'N/A'}\n`;
    prompt += `- 动作结果: ${JSON.stringify(node.action_details?.detail || {})}\n`;
    prompt += `- 是否成功: ${node.action_details?.success || false}\n`;
  }

  prompt += '\n## 输出要求\n';
  prompt += '请按以下 JSON 数组格式输出分析结果（只输出 JSON，不要其他内容）：\n';
  prompt += '[{"nodeName":"节点名","nodeId":1,"taskName":"任务名","cause":"失败原因","suggestion":"建议","confidence":0.8}]\n';

  if (auxLogs && auxLogs.length > 0) {
    prompt += '\n## 相关 Custom 日志\n';
    const taskIds = new Set(failedNodes.map(n => n.task_id));
    const relevantLogs = auxLogs.filter(log => 
      !log.task_id || taskIds.has(log.task_id) || log.level === "error"
    ).slice(-50);
    
    for (const log of relevantLogs) {
      prompt += `[${log.level.toUpperCase()}] ${log.timestamp} ${log.caller || log.source}: ${log.message}\n`;
    }
  }

  return prompt;
}

/**
 * 从 localStorage 加载 AI 配置
 *
 * @returns AI 配置对象
 */
export function getAIConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(AI_CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_AI_CONFIG, ...JSON.parse(stored) };
    }
  } catch {
    console.error("Failed to load AI config");
  }
  return { ...DEFAULT_AI_CONFIG };
}

/**
 * 保存 AI 配置到 localStorage
 *
 * @param config - AI 配置对象
 */
export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

/**
 * 使用 AI 分析任务失败原因
 *
 * @param config - AI 配置
 * @param tasks - 任务列表
 * @param auxLogs - 附加日志（可选）
 * @returns 失败分析结果列表
 */
export async function analyzeWithAI(config: AIConfig, tasks: TaskInfo[], auxLogs?: AuxLogEntry[]): Promise<FailureAnalysis[]> {
  const failedNodes = tasks.flatMap(t => t.nodes).filter(n => n.status === "failed");
  console.log(`[AI分析] 开始分析，失败节点数: ${failedNodes.length}, 任务数: ${tasks.length}, 日志数: ${auxLogs?.length || 0}`);
  
  if (failedNodes.length === 0) return [];

  const currentApiKey = config.apiKeys[config.provider] || "";
  if (!currentApiKey) throw new Error("请先配置 AI API Key");

  const prompt = buildAnalysisPrompt(tasks, failedNodes, auxLogs);
  console.log(`[AI分析] Prompt 长度: ${prompt.length} 字符`);
  
  const baseUrl = config.baseUrl || PROVIDER_INFO[config.provider]?.defaultBaseUrl || "";
  const isClaude = config.provider === "anthropic";
  const isGemini = config.provider === "gemini";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let requestBody: Record<string, unknown>;
  let endpoint: string;

  if (isClaude) {
    headers["x-api-key"] = currentApiKey;
    headers["anthropic-version"] = "2023-06-01";
    requestBody = { model: config.model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] };
    endpoint = `${baseUrl}/messages`;
  } else if (isGemini) {
    headers["x-goog-api-key"] = currentApiKey;
    requestBody = { contents: [{ parts: [{ text: prompt }] }] };
    endpoint = `${baseUrl}/models/${config.model}:generateContent`;
  } else {
    headers["Authorization"] = `Bearer ${currentApiKey}`;
    requestBody = { model: config.model, messages: [{ role: "user", content: prompt }], temperature: 0.3 };
    endpoint = `${baseUrl}/chat/completions`;
  }
  console.log(`[AI分析] 发送请求到: ${endpoint}, 模型: ${config.model}`);
  
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(requestBody) });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI分析] API 错误: ${response.status} - ${errorText}`);
    throw new Error(`API 错误: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = isClaude 
    ? result.content?.[0]?.text 
    : isGemini 
      ? result.candidates?.[0]?.content?.parts?.[0]?.text 
      : result.choices?.[0]?.message?.content;
  console.log(`[AI分析] 响应内容长度: ${content?.length || 0} 字符`);

  const analysisResults = parseAIResponse(content || "", failedNodes);
  console.log(`[AI分析] 解析出 ${analysisResults.length} 条分析结果`);
  
  return analysisResults;
}

/**
 * 解析 AI 返回的分析结果
 *
 * @param content - AI 返回的原始内容
 * @param failedNodes - 失败节点列表
 * @returns 解析后的失败分析结果列表
 */
function parseAIResponse(content: string, failedNodes: NodeInfo[]): FailureAnalysis[] {
  const match = content.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((item: Record<string, unknown>) => ({
          nodeName: String(item.nodeName || ""),
          nodeId: Number(item.nodeId) || 0,
          taskName: String(item.taskName || ""),
          cause: String(item.cause || "未知"),
          suggestion: String(item.suggestion || ""),
          confidence: Number(item.confidence) || 0.3
        }));
      }
    } catch {}
  }
  return failedNodes.map(n => ({ 
    nodeName: n.name, 
    nodeId: n.node_id, 
    taskName: "", 
    cause: "解析失败", 
    suggestion: "请手动检查日志详情", 
    confidence: 0.1 
  }));
}
