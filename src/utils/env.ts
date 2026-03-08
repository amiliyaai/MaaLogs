/**
 * 检测是否运行在 Tauri 环境
 *
 * 通过检查注入在全局 window 上的 Tauri 标识：
 * - __TAURI__（公开 API）
 * - __TAURI_INTERNALS__（内部注入，某些版本存在）
 *
 * 在浏览器或 SSR 环境返回 false。
 */
export function isTauriEnv(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const win = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return !!win.__TAURI__ || !!win.__TAURI_INTERNALS__;
}
