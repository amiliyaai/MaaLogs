import { checkForUpdate, getCurrentVersion } from "@/utils/updater";
import { createLogger } from "@/utils/logger";
import type { Platform, VfsEntry } from "./types";

async function createVfs() {
  const fs = await import("@tauri-apps/plugin-fs");
  const path = await import("@tauri-apps/api/path");
  const core = await import("@tauri-apps/api/core");

  const normalize = (input: string): string => input.replace(/\\/g, "/");

  const list = async (
    dir?: string,
    opts?: { recursive?: boolean; caseInsensitive?: boolean }
  ): Promise<VfsEntry[]> => {
    if (!dir) {
      return [];
    }
    const walk = async (current: string): Promise<VfsEntry[]> => {
      const entries = await fs.readDir(current);
      const result: VfsEntry[] = [];
      for (const entry of entries) {
        const joined = await path.join(current, entry.name);
        const entryPath = normalize(joined);
        const item: VfsEntry = {
          path: entryPath,
          name: entry.name,
          type: entry.isDirectory ? "dir" : "file",
        };
        result.push(item);
        if (entry.isDirectory && opts?.recursive) {
          result.push(...(await walk(joined)));
        }
      }
      return result;
    };
    return walk(dir);
  };

  const resolveBySuffix = async (
    suffix: string,
    opts?: { dir?: string; caseInsensitive?: boolean }
  ): Promise<string | null> => {
    const baseDir = opts?.dir;
    if (!baseDir) {
      return null;
    }
    const items = await list(baseDir, { recursive: true, caseInsensitive: opts?.caseInsensitive });
    const normalizedSuffix = normalize(suffix);
    const compareSuffix = opts?.caseInsensitive ? normalizedSuffix.toLowerCase() : normalizedSuffix;
    for (const item of items) {
      if (item.type !== "file") {
        continue;
      }
      const filePath = opts?.caseInsensitive ? item.path.toLowerCase() : item.path;
      if (filePath.endsWith(compareSuffix)) {
        return item.path;
      }
    }
    return null;
  };

  return {
    list,
    readText: (filePath: string) => fs.readTextFile(filePath),
    readBinary: async (filePath: string) => {
      const data = await fs.readFile(filePath);
      return new Uint8Array(data);
    },
    stat: async (filePath: string) => {
      const metadata = await fs.stat(filePath);
      const type: "file" | "dir" = metadata.isDirectory ? "dir" : "file";
      const mtimeValue = metadata.mtime;
      let mtime: number | undefined;
      if (typeof mtimeValue === "number") {
        mtime = mtimeValue;
      } else if (mtimeValue instanceof Date) {
        mtime = mtimeValue.getTime();
      }
      return {
        type,
        size: metadata.size,
        mtime,
      };
    },
    exists: (filePath: string) => fs.exists(filePath),
    getImageURL: async (filePath: string) => core.convertFileSrc(filePath),
    resolveBySuffix,
    join: (...parts: string[]) => path.join(...parts),
    appCacheDir: () => path.appCacheDir(),
    appDataDir: () => path.appDataDir(),
    appLogDir: () => path.appLogDir(),
    remove: async (targetPath: string, options?: { recursive?: boolean }) => {
      await fs.remove(targetPath, { recursive: options?.recursive });
    },
    mkdir: async (targetPath: string, options?: { recursive?: boolean }) => {
      await fs.mkdir(targetPath, { recursive: options?.recursive });
    },
    writeBinary: async (targetPath: string, data: Uint8Array) => {
      await fs.writeFile(targetPath, data);
    },
  };
}

async function createStorage() {
  const { Store } = await import("@tauri-apps/plugin-store");
  const store = await Store.load("app-settings.json", {
    autoSave: 500,
    defaults: {},
  });
  return {
    async get<T>(key: string, defaultValue: T): Promise<T> {
      const value = await store.get<T>(key);
      return value === null || value === undefined ? defaultValue : value;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await store.set(key, value);
    },
    async remove(key: string): Promise<void> {
      await store.delete(key);
    },
  };
}

async function createUpdaterWindow() {
  return {
    checkForUpdate,
    async openExternal(url: string): Promise<void> {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    },
    async revealItem(path: string): Promise<void> {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(path);
    },
    async setTitle(title: string): Promise<void> {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setTitle(title);
    },
    async resetWindowLayout(): Promise<void> {
      const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
      const window = getCurrentWindow();
      await window.setSize(new LogicalSize(1280, 720));
      await window.center();
    },
    async openDevtools(): Promise<void> {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_devtools");
    },
    getVersion: getCurrentVersion,
  };
}

async function createDragDrop() {
  return {
    async onDrop(
      cb: (paths: string[]) => void,
      onOver: () => void,
      onLeave: () => void
    ): Promise<() => void> {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
        const payload = event.payload as { type: string; paths?: string[] };
        if (payload.type === "over") {
          onOver();
          return;
        }
        if (payload.type === "drop") {
          cb(Array.isArray(payload.paths) ? payload.paths : []);
          return;
        }
        onLeave();
      });
      return unlisten;
    },
  };
}

async function createPicker() {
  return {
    async selectDirectory(): Promise<string | null> {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (!selected) {
        return null;
      }
      return Array.isArray(selected) ? selected[0] ?? null : selected;
    },
  };
}

export async function createTauriPlatform(): Promise<Platform> {
  return {
    vfs: await createVfs(),
    images: {
      async toURL(path: string): Promise<string> {
        const { convertFileSrc } = await import("@tauri-apps/api/core");
        return convertFileSrc(path);
      },
      revoke: () => {},
    },
    storage: await createStorage(),
    updater: await createUpdaterWindow(),
    logger: {
      create(scope: string) {
        return createLogger(scope);
      },
    },
    dragDrop: await createDragDrop(),
    picker: await createPicker(),
  };
}
