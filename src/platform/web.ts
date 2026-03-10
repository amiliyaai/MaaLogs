/**
 * @fileoverview Web 平台后备实现
 *
 * 在非 Tauri 环境下提供最小可用的 Platform 实现：
 * - VFS：不直接访问宿主文件系统，仅提供路径拼接、占位接口
 * - Storage：使用 localStorage 模拟键值存储
 * - UpdaterWindow：以安全方式打开外链，返回固定版本号 "web"
 * - DragDrop/Picker：仅返回空实现，避免在浏览器触发原生对话框
 *
 * 该实现用于“回退”场景，保证 Web 环境可运行基础功能。
 */
import { createLogger } from "@/utils/logger";
import type { Platform } from "./types";

/**
 * 安全获取全局 window 对象（SSR/测试环境下为 null）
 */
function getWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

/**
 * 归一化路径片段，移除首尾的斜杠并将反斜杠替换为正斜杠
 */
function normalizePathSegment(part: string): string {
  const normalized = part.replace(/\\/g, "/");
  let start = 0;
  let end = normalized.length;
  while (start < end && normalized[start] === "/") {
    start++;
  }
  while (end > start && normalized[end - 1] === "/") {
    end--;
  }
  return normalized.slice(start, end);
}

/**
 * 使用浏览器 localStorage 的简单键值存储
 * - JSON 序列化/反序列化
 * - 失败时静默降级
 */
function createMemoryStorage() {
  return {
    async get<T>(key: string, defaultValue: T): Promise<T> {
      const win = getWindow();
      if (!win) {
        return defaultValue;
      }
      try {
        const raw = win.localStorage.getItem(key);
        if (!raw) {
          return defaultValue;
        }
        return JSON.parse(raw) as T;
      } catch {
        return defaultValue;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      const win = getWindow();
      if (!win) {
        return;
      }
      try {
        win.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        return;
      }
    },
    async remove(key: string): Promise<void> {
      const win = getWindow();
      if (!win) {
        return;
      }
      try {
        win.localStorage.removeItem(key);
      } catch {
        return;
      }
    },
  };
}

/**
 * 创建 Web 平台实现
 * - 所有与本地文件系统相关的能力以占位/固定返回值形式提供
 * - 仅实现 UI 层所必需的接口，避免抛出未捕获异常
 */
export async function createWebPlatform(): Promise<Platform> {
  const files = new Map<
    string,
    { type: "file" | "dir"; data?: Uint8Array; size?: number; mtime?: number; name: string }
  >();
  const blobCache = new Map<string, string>();
  type WebBridgeWindow = Window & {
    __maalogs_registerMemoryFiles?: (
      items: { path: string; data: Uint8Array | File }[]
    ) => Promise<void>;
  };
  function norm(p: string) {
    const s = normalizePathSegment(p);
    return s.startsWith("/") ? s : `/${s}`;
  }
  function parentDir(p: string) {
    const idx = p.lastIndexOf("/");
    return idx <= 0 ? "/" : p.slice(0, idx);
  }
  function ensureDir(p: string) {
    const cur = norm(p);
    const parts = cur.split("/").filter(Boolean);
    let path = "";
    for (const part of parts) {
      path = `${path}/${part}`;
      if (!files.has(path)) {
        files.set(path, { type: "dir", name: part });
      }
    }
    if (cur === "/") {
      files.set("/", { type: "dir", name: "" });
    }
  }
  function listChildren(dir: string) {
    const base = dir === "/" ? "/" : norm(dir);
    const seen = new Set<string>();
    const entries: {
      path: string;
      name: string;
      type: "file" | "dir";
      size?: number;
      mtime?: number;
    }[] = [];
    for (const p of files.keys()) {
      if (p === base) continue;
      if (!p.startsWith(base === "/" ? "/" : base + "/")) continue;
      const rest = p.slice(base === "/" ? 1 : base.length + 1);
      const seg = rest.split("/")[0];
      const childPath = base === "/" ? `/${seg}` : `${base}/${seg}`;
      if (seen.has(childPath)) continue;
      seen.add(childPath);
      const childMeta = files.get(childPath);
      if (childMeta) {
        entries.push({
          path: childPath,
          name: seg,
          type: childMeta.type,
          size: childMeta.size,
          mtime: childMeta.mtime,
        });
      } else {
        entries.push({ path: childPath, name: seg, type: "dir" });
      }
    }
    return entries;
  }
  const vfs = {
    async list(dir?: string) {
      const d = dir ? norm(dir) : "/";
      if (!files.has(d) && d !== "/") return [];
      return listChildren(d);
    },
    async readText() {
      throw new Error("VFS_FILE_NOT_FOUND");
    },
    async readBinary(path: string) {
      const p = norm(path);
      const meta = files.get(p);
      if (!meta || meta.type !== "file") throw new Error("VFS_FILE_NOT_FOUND");
      if (meta.data instanceof Uint8Array) return meta.data;
      throw new Error("VFS_FILE_NOT_FOUND");
    },
    async stat(path: string) {
      const p = norm(path);
      if (files.has(p)) {
        const m = files.get(p)!;
        return { type: m.type, size: m.size, mtime: m.mtime };
      }
      const existsAsDir = Array.from(files.keys()).some((k) =>
        k.startsWith(p.endsWith("/") ? p : p + "/")
      );
      if (existsAsDir) return { type: "dir" as const };
      throw new Error("VFS_FILE_NOT_FOUND");
    },
    async exists(path: string) {
      const p = norm(path);
      if (files.has(p)) return true;
      return Array.from(files.keys()).some((k) => k.startsWith(p.endsWith("/") ? p : p + "/"));
    },
    async getImageURL(path: string) {
      const p = norm(path);
      const meta = files.get(p);
      if (!meta || meta.type !== "file") return p;
      if (blobCache.has(p)) return blobCache.get(p)!;
      let blob: Blob;
      const lower = p.toLowerCase();
      let mime = "application/octet-stream";
      if (lower.endsWith(".png")) {
        mime = "image/png";
      } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        mime = "image/jpeg";
      }
      if (meta.data instanceof Uint8Array) {
        const ab = meta.data.buffer.slice(
          meta.data.byteOffset,
          meta.data.byteOffset + meta.data.byteLength
        ) as ArrayBuffer;
        blob = new Blob([ab], { type: mime });
      } else {
        return p;
      }
      const url = URL.createObjectURL(blob);
      blobCache.set(p, url);
      return url;
    },
    async resolveBySuffix() {
      return null;
    },
    async join(...parts: string[]) {
      return parts
        .filter((part) => !!part)
        .map((part) => normalizePathSegment(part))
        .join("/")
        .replace(/\/{2,}/g, "/");
    },
    async appCacheDir() {
      return "/";
    },
    async appDataDir() {
      return "/";
    },
    async appLogDir() {
      return "/";
    },
    async remove() {
      return;
    },
    async mkdir(path: string) {
      ensureDir(path);
    },
    async writeBinary(path: string, data: Uint8Array) {
      const p = norm(path);
      ensureDir(parentDir(p));
      files.set(p, {
        type: "file",
        data,
        size: data.length,
        mtime: Date.now(),
        name: p.split("/").pop() || "",
      });
    },
  } as const;
  const images = {
    async toURL(path: string) {
      return vfs.getImageURL(path);
    },
    revoke(url: string) {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    },
  };
  const platform: Platform = {
    vfs,
    images,
    storage: createMemoryStorage(),
    updater: {
      async checkForUpdate() {
        return false;
      },
      async openExternal(url: string) {
        const win = getWindow();
        if (!win) {
          return;
        }
        win.open(url, "_blank", "noopener,noreferrer");
      },
      async revealItem() {
        return;
      },
      async setTitle(title: string) {
        if (typeof document !== "undefined") {
          document.title = title;
        }
      },
      async resetWindowLayout() {
        return;
      },
      async openDevtools() {
        return;
      },
      async getVersion() {
        return "web";
      },
    },
    logger: {
      create(scope: string) {
        return createLogger(scope);
      },
    },
    dragDrop: {
      async onDrop() {
        return () => {};
      },
    },
    picker: {
      async selectDirectory() {
        return null;
      },
    },
  };
  const win = getWindow() as WebBridgeWindow | null;
  if (win) {
    win.__maalogs_registerMemoryFiles = async (
      items: { path: string; data: Uint8Array | File }[]
    ) => {
      for (const { path, data } of items) {
        await vfs.writeBinary(
          path,
          data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer())
        );
      }
    };
  }
  return platform;
}
