export type FileType = "file" | "dir";

export interface VfsEntry {
  path: string;
  name: string;
  type: FileType;
  size?: number;
  mtime?: number;
}

export interface Vfs {
  list(
    dir?: string,
    opts?: { recursive?: boolean; caseInsensitive?: boolean }
  ): Promise<VfsEntry[]>;
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  stat(path: string): Promise<{ type: FileType; size?: number; mtime?: number }>;
  exists(path: string): Promise<boolean>;
  getImageURL(path: string): Promise<string>;
  resolveBySuffix(
    suffix: string,
    opts?: { dir?: string; caseInsensitive?: boolean }
  ): Promise<string | null>;
  join(...parts: string[]): Promise<string>;
  appCacheDir(): Promise<string>;
  appDataDir(): Promise<string>;
  appLogDir(): Promise<string>;
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  writeBinary(path: string, data: Uint8Array): Promise<void>;
}

export interface ImageResolver {
  toURL(path: string): Promise<string>;
  revoke(url: string): void;
}

export interface Storage {
  get<T>(key: string, defaultValue: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface UpdaterWindow {
  checkForUpdate(showNoUpdate?: boolean): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  revealItem(path: string): Promise<void>;
  setTitle(title: string): Promise<void>;
  resetWindowLayout(): Promise<void>;
  openDevtools(): Promise<void>;
  getVersion(): Promise<string>;
}

export interface Logger {
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

export interface LoggerFactory {
  create(scope: string): Logger;
}

export interface DragDrop {
  onDrop(
    cb: (paths: string[]) => void,
    onOver: () => void,
    onLeave: () => void
  ): Promise<() => void>;
}

export interface Picker {
  selectDirectory(): Promise<string | null>;
}

export interface Platform {
  vfs: Vfs;
  images: ImageResolver;
  storage: Storage;
  updater: UpdaterWindow;
  logger: LoggerFactory;
  dragDrop: DragDrop;
  picker: Picker;
}
