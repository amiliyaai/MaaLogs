/**
 * @fileoverview AI 配置
 *
 * 本文件定义 AI 分析功能相关的所有配置项，包括：
 * - AI 服务商类型定义（支持 OpenAI、Anthropic、Google 等多个服务商）
 * - AI 配置接口和默认值
 * - 各服务商的可用模型列表
 * - 各服务商的基本信息（名称、默认API地址）
 * - AI 请求参数配置（最大 token 数、温度参数等）
 *
 * 使用说明：
 * - 直接导入需要的配置项即可使用
 * - DEFAULT_AI_CONFIG 包含所有服务商的 API Key 存储结构
 * - PROVIDER_MODELS 和 PROVIDER_INFO 用于构建设置界面的选项
 *
 * @module config/ai
 */

/**
 * AI 服务商类型
 *
 * 支持的 AI 服务商枚举，包含以下选项：
 * - openai: OpenAI (GPT 系列模型)
 * - anthropic: Anthropic (Claude 系列模型)
 * - gemini: Google Gemini
 * - xai: xAI (Grok 系列模型)
 * - deepseek: DeepSeek
 * - zhipu: 智谱 AI (GLM 系列)
 * - minimax: MiniMax
 * - moonshot: 月之暗面 (Moonshot AI)
 * - step: 阶跃星辰 (StepFun)
 * - siliconflow: 硅基流动 (SiliconFlow)
 * - openrouter: OpenRouter (聚合多个服务商)
 * - volcengine: 火山引擎 (字节跳动)
 * - aliyun: 阿里云 (通义千问)
 * - tencent: 腾讯云 (混元)
 * - custom: 自定义 API (兼容 OpenAI 格式)
 *
 * @example
 * const config: AIConfig = {
 *   provider: "deepseek",
 *   model: "deepseek-chat",
 *   apiKeys: { deepseek: "sk-xxx" },
 *   baseUrl: ""
 * };
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
 *
 * 定义用户配置的 AI 相关参数结构
 *
 * @property {AIProvider} provider - 当前选中的 AI 服务商
 * @property {Record<AIProvider, string>} apiKeys - 各服务商的 API Key 映射
 * @property {string} model - 当前选中的模型名称
 * @property {string} baseUrl - 自定义 API 地址（为空时使用服务商默认地址）
 *
 * @example
 * const config: AIConfig = {
 *   provider: "openai",
 *   apiKeys: {
 *     openai: "sk-xxx",
 *     anthropic: "",
 *     // ... 其他服务商
 *   },
 *   model: "gpt-4o-mini",
 *   baseUrl: ""
 * };
 */
export interface AIConfig {
  provider: AIProvider;
  apiKeys: Record<AIProvider, string>;
  model: string;
  baseUrl: string;
}

/**
 * localStorage 存储键名
 *
 * 用于持久化保存用户的 AI 配置（API Key 等敏感信息会加密存储）
 */
export const AI_CONFIG_KEY = "maa-logs-ai-config";

/**
 * 默认 AI 配置
 *
 * 应用首次启动时的默认配置，用户可以在设置界面修改
 * - 默认使用 OpenAI 服务商
 * - 默认模型为 gpt-4o-mini（性价比高）
 * - 所有 API Key 初始为空，需要用户配置
 * - baseUrl 为空表示使用服务商默认 API 地址
 *
 * @example
 * // 获取默认配置
 * const defaultConfig = DEFAULT_AI_CONFIG;
 * console.log(defaultConfig.provider); // "openai"
 * console.log(defaultConfig.model);   // "gpt-4o-mini"
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
    custom: "",
  },
  model: "gpt-4o-mini",
  baseUrl: "",
};

/**
 * AI 请求参数配置
 *
 * 控制 AI API 调用时的请求参数
 *
 * @property {number} maxTokens - 响应最大 token 数
 *   - 4000 约等于 3000-4000 个中文字符
 *   - 超出此限制的响应会被截断
 *   - 建议根据分析内容复杂度调整
 * @property {number} temperature - 生成随机性参数
 *   - 范围 0-2，值越低输出越确定性
 *   - 0.3 适合日志分析场景（保持准确性同时略有变化）
 *   - 0.9 适合需要创意性的场景
 *
 * @example
 * // 修改请求配置
 * const config = {
 *   maxTokens: 6000,  // 增加响应长度
 *   temperature: 0.2  // 降低随机性
 * };
 */
export const AI_REQUEST_CONFIG = {
  maxTokens: 4000,
  temperature: 0.3,
};

/**
 * 服务商可用模型映射表
 *
 * 记录各 AI 服务商支持的模型列表
 * 用于在设置界面动态生成模型选择下拉框
 *
 * 注意：模型列表会随服务商更新而变化，建议定期检查更新
 *
 * @example
 * // 获取某个服务商的可用模型
 * const models = PROVIDER_MODELS["deepseek"];
 * console.log(models); // ["deepseek-chat", "deepseek-reasoner"]
 */
export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openai: ["gpt-5.2", "gpt-5.1", "gpt-5-medium", "gpt-5-high"],
  anthropic: ["claude-3-5-sonnet-20241022"],
  gemini: ["gemini-3-pro", "gemini-3-flash", "gemini-2.5-pro", "gemini-2.5-flash"],
  xai: ["grok-2-1212", "grok-2-vision-1212"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  zhipu: ["glm-5", "glm-4.7-flash"],
  minimax: ["MiniMax-M2.5"],
  moonshot: ["moonshot-v1-8k-vision-preview"],
  step: ["step-1v-8k"],
  siliconflow: [
    "Qwen/Qwen2.5-14B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct",
    "DeepSeek-V2-Chat",
    "meta-llama/Llama-3.1-8B-Instruct",
    "THUDM/glm-4-9b-chat",
  ],
  openrouter: [
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash",
    "deepseek/deepseek-chat",
  ],
  volcengine: ["doubao-pro-32k"],
  aliyun: ["qwen-plus", "qwen-max", "qwen-flash"],
  tencent: ["hunyuan-pro"],
  custom: [],
};

/**
 * 服务商信息映射表
 *
 * 记录各 AI 服务商的基本信息
 * 用于在设置界面显示服务商名称和默认 API 地址
 *
 * @property {string} name - 服务商显示名称（中文）
 * @property {string} defaultBaseUrl - 默认 API 请求地址
 *
 * @example
 * // 获取服务商信息
 * const info = PROVIDER_INFO["deepseek"];
 * console.log(info.name);           // "DeepSeek"
 * console.log(info.defaultBaseUrl); // "https://api.deepseek.com/v1"
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
  custom: { name: "自定义", defaultBaseUrl: "" },
};
