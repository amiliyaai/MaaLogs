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
import { encryptSecure, decryptSecure, getStore } from "./crypto";
import {
  type AIProvider,
  type AIConfig,
  AI_CONFIG_KEY,
  DEFAULT_AI_CONFIG,
  PROVIDER_INFO,
  AI_REQUEST_CONFIG,
  MAA_KNOWLEDGE,
} from "../config";

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

export type {
  AIProvider,
  AIConfig,
};

export {
  AI_CONFIG_KEY,
  DEFAULT_AI_CONFIG,
  PROVIDER_MODELS,
  PROVIDER_INFO,
  AI_REQUEST_CONFIG,
} from "../config/ai";

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
${Object.entries(MAA_KNOWLEDGE.recognition)
  .map(([name, info]) => `- ${name}: ${info.desc}`)
  .join("\n")}

## 动作类型
${Object.entries(MAA_KNOWLEDGE.actions)
  .map(([name, info]) => `- ${name}: ${info.desc}`)
  .join("\n")}

## 控制器类型
${Object.entries(MAA_KNOWLEDGE.controllers)
  .map(([name, info]) => `- ${name}: ${info.desc}`)
  .join("\n")}

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
function buildKnowledgeSection(failedNodes: NodeInfo[]): string {
  const sections: string[] = ["## 本次分析相关的知识"];
  const uniqueAlgorithms = [
    ...new Set(failedNodes.map((n) => n.reco_details?.algorithm).filter(Boolean)),
  ];
  const uniqueActions = [
    ...new Set(failedNodes.map((n) => n.action_details?.action).filter(Boolean)),
  ];

  for (const algo of uniqueAlgorithms) {
    const info = MAA_KNOWLEDGE.recognition[algo as keyof typeof MAA_KNOWLEDGE.recognition];
    if (!info) continue;
    sections.push(`\n### ${algo} 识别`);
    sections.push(`描述: ${info.desc}`);
    if (info.failures?.length) sections.push(`常见失败: ${info.failures.join("; ")}`);
    if (info.suggestions?.length) sections.push(`建议: ${info.suggestions.join("; ")}`);
  }

  for (const action of uniqueActions) {
    const info = MAA_KNOWLEDGE.actions[action as keyof typeof MAA_KNOWLEDGE.actions];
    if (!info) continue;
    sections.push(`\n### ${action} 动作`);
    sections.push(`描述: ${info.desc}`);
    if (info.failures?.length) sections.push(`常见失败: ${info.failures.join("; ")}`);
    if (info.suggestions?.length) sections.push(`建议: ${info.suggestions.join("; ")}`);
  }

  return sections.join("\n");
}

function buildFailedNodesSection(tasks: TaskInfo[], failedNodes: NodeInfo[]): string {
  const sections: string[] = ["## 失败节点详情"];
  for (const node of failedNodes) {
    sections.push(...buildNodeFailureSection(tasks, node));
  }
  return sections.join("\n");
}

function buildNodeFailureSection(tasks: TaskInfo[], node: NodeInfo): string[] {
  const task = tasks.find((t) => t.task_id === node.task_id);
  const lines: string[] = [];
  lines.push(`\n### 节点: ${node.name} (ID: ${node.node_id})`);
  lines.push(`- 任务: ${task?.entry || "Unknown"}`);
  lines.push(`- 识别算法: ${node.reco_details?.algorithm || "N/A"}`);
  lines.push(`- 识别结果: ${JSON.stringify(node.reco_details?.detail || {})}`);
  lines.push(`- 动作类型: ${node.action_details?.action || "N/A"}`);
  lines.push(`- 动作结果: ${JSON.stringify(node.action_details?.detail || {})}`);
  lines.push(`- 是否成功: ${node.action_details?.success || false}`);
  lines.push(...buildRecognitionAttemptsSection(node.recognition_attempts));
  lines.push(...buildNestedRecognitionSection(node.nested_recognition_in_action));
  return lines;
}

function buildRecognitionAttemptsSection(attempts?: NodeInfo["recognition_attempts"]): string[] {
  if (!attempts || attempts.length === 0) return [];
  const lines: string[] = [];
  lines.push(`- 识别尝试次数: ${attempts.length}`);
  lines.push("  识别尝试详情:");
  for (const attempt of attempts) {
    const attemptStatus = attempt.status === "success" ? "成功" : "失败";
    lines.push(`    - ${attempt.name}: ${attemptStatus}`);
    if (attempt.reco_details) {
      lines.push(`      算法: ${attempt.reco_details.algorithm || "N/A"}`);
      lines.push(`      结果: ${JSON.stringify(attempt.reco_details.detail || {})}`);
    }
  }
  return lines;
}

function buildNestedRecognitionSection(
  nested?: NodeInfo["nested_recognition_in_action"]
): string[] {
  if (!nested || nested.length === 0) return [];
  const lines: string[] = [];
  lines.push(`- 动作中嵌套识别次数: ${nested.length}`);
  for (const entry of nested) {
    const nestedStatus = entry.status === "success" ? "成功" : "失败";
    lines.push(`    - ${entry.name}: ${nestedStatus}`);
    if (entry.reco_details) {
      lines.push(`      算法: ${entry.reco_details.algorithm || "N/A"}`);
    }
  }
  return lines;
}

function buildOutputSection(): string {
  return [
    "## 输出要求",
    "请按以下 JSON 数组格式输出分析结果（只输出 JSON，不要其他内容）：",
    '[{"nodeName":"节点名","nodeId":1,"taskName":"任务名","cause":"失败原因","suggestion":"建议","confidence":0.8}]',
  ].join("\n");
}

function buildAuxLogsSection(failedNodes: NodeInfo[], auxLogs?: AuxLogEntry[]): string | null {
  if (!auxLogs || auxLogs.length === 0) return null;
  const taskIds = new Set(failedNodes.map((n) => n.task_id));
  const relevantLogs = auxLogs
    .filter((log) => !log.task_id || taskIds.has(log.task_id) || log.level === "error")
    .slice(-50);
  if (relevantLogs.length === 0) return null;
  const sections: string[] = ["## 相关 Custom 日志"];
  for (const log of relevantLogs) {
    sections.push(
      `[${log.level.toUpperCase()}] ${log.timestamp} ${log.caller || log.source}: ${log.message}`
    );
  }
  return sections.join("\n");
}

export function buildAnalysisPrompt(
  tasks: TaskInfo[],
  failedNodes: NodeInfo[],
  auxLogs?: AuxLogEntry[]
): string {
  const sections = [
    getFrameworkPrompt(),
    buildKnowledgeSection(failedNodes),
    buildFailedNodesSection(tasks, failedNodes),
    buildOutputSection(),
  ];
  const auxLogsSection = buildAuxLogsSection(failedNodes, auxLogs);
  if (auxLogsSection) sections.push(auxLogsSection);
  return sections.join("\n\n") + "\n";
}

function getProviderFlags(provider: AIProvider): { isClaude: boolean; isGemini: boolean } {
  return { isClaude: provider === "anthropic", isGemini: provider === "gemini" };
}

function getApiKey(config: AIConfig): string {
  const apiKey = config.apiKeys[config.provider] || "";
  if (!apiKey) throw new Error("请先配置 AI API Key");
  return apiKey;
}

function buildRequestPayload(
  config: AIConfig,
  prompt: string,
  apiKey: string
): {
  endpoint: string;
  headers: Record<string, string>;
  requestBody: Record<string, unknown>;
  isClaude: boolean;
  isGemini: boolean;
} {
  const { isClaude, isGemini } = getProviderFlags(config.provider);
  const baseUrl = config.baseUrl || PROVIDER_INFO[config.provider]?.defaultBaseUrl || "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let requestBody: Record<string, unknown>;
  let endpoint: string;

  if (isClaude) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    requestBody = {
      model: config.model,
      max_tokens: AI_REQUEST_CONFIG.maxTokens,
      messages: [{ role: "user", content: prompt }],
    };
    endpoint = `${baseUrl}/messages`;
  } else if (isGemini) {
    headers["x-goog-api-key"] = apiKey;
    requestBody = { contents: [{ parts: [{ text: prompt }] }] };
    endpoint = `${baseUrl}/models/${config.model}:generateContent`;
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
    requestBody = {
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: AI_REQUEST_CONFIG.temperature,
    };
    endpoint = `${baseUrl}/chat/completions`;
  }

  return { endpoint, headers, requestBody, isClaude, isGemini };
}

/**
 * 加密的配置存储格式
 */
interface EncryptedConfig {
  version: number;
  encrypted: boolean;
  data: string;
}

/**
 * 当前配置版本
 */
const CONFIG_VERSION = 2;

/**
 * 从 Tauri store 加载 AI 配置（支持加密和未加密格式）
 *
 * @returns AI 配置对象
 */
export async function getAIConfig(): Promise<AIConfig> {
  try {
    const s = await getStore();
    const stored = (await s.get(AI_CONFIG_KEY)) as string | null;
    if (stored) {
      let parsed: unknown;

      try {
        parsed = JSON.parse(stored);
      } catch {
        return { ...DEFAULT_AI_CONFIG };
      }

      if (!parsed || typeof parsed !== "object") {
        return { ...DEFAULT_AI_CONFIG };
      }

      const storedConfig = parsed as Partial<AIConfig> & Partial<EncryptedConfig>;
      if (storedConfig.encrypted && storedConfig.version === CONFIG_VERSION && storedConfig.data) {
        try {
          const dataStr = String(storedConfig.data).trim();
          if (!dataStr) {
            return { ...DEFAULT_AI_CONFIG };
          }
          const decrypted = await decryptSecure(dataStr);
          const decryptedConfig = JSON.parse(decrypted);
          return { ...DEFAULT_AI_CONFIG, ...decryptedConfig };
        } catch (error) {
          console.warn("Failed to decrypt AI config", error);
          await s.delete(AI_CONFIG_KEY);
          await s.save();
          return { ...DEFAULT_AI_CONFIG };
        }
      }

      return { ...DEFAULT_AI_CONFIG, ...storedConfig };
    }
  } catch (e) {
    console.error("Failed to load AI config", e);
  }
  return { ...DEFAULT_AI_CONFIG };
}

/**
 * 保存 AI 配置到 Tauri store（加密敏感数据）
 *
 * @param config - AI 配置对象
 */
export async function saveAIConfig(config: AIConfig): Promise<void> {
  try {
    const s = await getStore();
    const configToSave = { ...config };
    const configString = JSON.stringify(configToSave);
    const encrypted = await encryptSecure(configString);

    const encryptedConfig: EncryptedConfig = {
      version: CONFIG_VERSION,
      encrypted: true,
      data: encrypted,
    };

    await s.set(AI_CONFIG_KEY, JSON.stringify(encryptedConfig));
    await s.save();
  } catch (e) {
    console.error("Failed to save AI config", e);
    try {
      const s = await getStore();
      const safeConfig: AIConfig = {
        ...config,
        apiKeys: { ...DEFAULT_AI_CONFIG.apiKeys },
      };
      await s.set(AI_CONFIG_KEY, JSON.stringify(safeConfig));
      await s.save();
    } catch (e2) {
      console.error("Failed to save AI config (fallback)", e2);
    }
  }
}

/**
 * 使用 AI 分析任务失败原因
 *
 * @param config - AI 配置
 * @param tasks - 任务列表
 * @param auxLogs - 附加日志（可选）
 * @returns 失败分析结果列表
 */
export async function analyzeWithAI(
  config: AIConfig,
  tasks: TaskInfo[],
  auxLogs?: AuxLogEntry[]
): Promise<FailureAnalysis[]> {
  const failedNodes = tasks.flatMap((t) => t.nodes).filter((n) => n.status === "failed");
  console.log(
    `[AI分析] 开始分析，失败节点数: ${failedNodes.length}, 任务数: ${tasks.length}, 日志数: ${auxLogs?.length || 0}`
  );

  if (failedNodes.length === 0) return [];

  const currentApiKey = getApiKey(config);
  const prompt = buildAnalysisPrompt(tasks, failedNodes, auxLogs);
  console.log(`[AI分析] Prompt 长度: ${prompt.length} 字符`);

  const { endpoint, headers, requestBody, isClaude, isGemini } = buildRequestPayload(
    config,
    prompt,
    currentApiKey
  );
  console.log(`[AI分析] 发送请求到: ${endpoint}, 模型: ${config.model}`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[AI分析] API 错误: ${response.status} - ${errorText}`);
    throw new Error(`API 错误: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = extractProviderContent(result, isClaude, isGemini);
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
function extractProviderContent(
  result: Record<string, unknown>,
  isClaude: boolean,
  isGemini: boolean
): string | undefined {
  if (isClaude) {
    return (result as { content?: { text?: string }[] }).content?.[0]?.text;
  }
  if (isGemini) {
    return (result as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      .candidates?.[0]?.content?.parts?.[0]?.text;
  }
  return (result as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
    ?.content;
}

function extractJsonArrayText(content: string): string | null {
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return content.slice(start, end + 1);
}

function buildFallbackAnalyses(failedNodes: NodeInfo[]): FailureAnalysis[] {
  return failedNodes.map((n) => ({
    nodeName: n.name,
    nodeId: n.node_id,
    taskName: "",
    cause: "解析失败",
    suggestion: "请手动检查日志详情",
    confidence: 0.1,
  }));
}

function parseAIResponse(content: string, failedNodes: NodeInfo[]): FailureAnalysis[] {
  const jsonText = extractJsonArrayText(content);
  if (!jsonText) return buildFallbackAnalyses(failedNodes);
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return buildFallbackAnalyses(failedNodes);
    return parsed.map((item: Record<string, unknown>) => ({
      nodeName: String(item.nodeName || ""),
      nodeId: Number(item.nodeId) || 0,
      taskName: String(item.taskName || ""),
      cause: String(item.cause || "未知"),
      suggestion: String(item.suggestion || ""),
      confidence: Number(item.confidence) || 0.3,
    }));
  } catch (error) {
    console.warn("Failed to parse AI response", error);
    return buildFallbackAnalyses(failedNodes);
  }
}
