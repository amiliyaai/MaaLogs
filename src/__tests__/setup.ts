import { vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `mocked://${path}`),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn((...args: string[]) => args.join("/")),
  appDataDir: vi.fn(() => Promise.resolve("/mocked/app-data")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(() => Promise.resolve([])),
  readTextFile: vi.fn(() => Promise.resolve("")),
  readFile: vi.fn(() => Promise.resolve(new Uint8Array())),
  writeTextFile: vi.fn(() => Promise.resolve()),
  rename: vi.fn(() => Promise.resolve()),
  exists: vi.fn(() => Promise.resolve(false)),
  mkdir: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: vi.fn(() =>
      Promise.resolve({
        get: vi.fn(() => Promise.resolve(null)),
        set: vi.fn(() => Promise.resolve()),
      })
    ),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.0.0-test")),
}));
