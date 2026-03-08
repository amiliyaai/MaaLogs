/**
 * @fileoverview 平台选择器
 *
 * 按运行环境动态选择 Platform 实现：
 * - Tauri 环境：加载 tauri.ts，提供完整桌面能力
 * - Web 环境：加载 web.ts，提供降级能力
 *
 * 采用模块级 Promise 缓存，确保全局只初始化一次，避免重复动态导入。
 */
import { isTauriEnv } from "@/utils/env";
import type { Platform } from "./types";

let platformPromise: Promise<Platform> | null = null;

/**
 * 获取当前平台实现（带缓存）
 *
 * 首次调用时根据环境动态导入对应实现，并在后续复用同一实例。
 */
export async function getPlatform(): Promise<Platform> {
  if (platformPromise) {
    return platformPromise;
  }
  platformPromise = isTauriEnv()
    ? import("./tauri").then((mod) => mod.createTauriPlatform())
    : import("./web").then((mod) => mod.createWebPlatform());
  return platformPromise;
}

/**
 * 测试用途：重置平台实例缓存
 *
 * 在单测中需要切换环境（Web/Tauri）时调用。
 */
export function resetPlatformForTests(): void {
  platformPromise = null;
}
