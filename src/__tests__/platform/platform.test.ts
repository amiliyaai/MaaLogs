import { afterEach, describe, expect, it, vi } from "vitest";
import { resetPlatformForTests, getPlatform } from "@/platform";
import { createWebPlatform } from "@/platform/web";

function setWindow(value: Window | undefined): void {
  Object.defineProperty(globalThis, "window", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("platform", () => {
  afterEach(() => {
    resetPlatformForTests();
    vi.restoreAllMocks();
    setWindow(undefined);
  });

  it("returns cached instance before reset", async () => {
    const first = await getPlatform();
    const second = await getPlatform();
    expect(first).toBe(second);
  });

  it("creates new instance after reset", async () => {
    const first = await getPlatform();
    resetPlatformForTests();
    const second = await getPlatform();
    expect(first).not.toBe(second);
  });

  it("web storage falls back without window", async () => {
    const platform = await createWebPlatform();
    await expect(platform.storage.set("k", { v: 1 })).resolves.toBeUndefined();
    await expect(platform.storage.remove("k")).resolves.toBeUndefined();
    await expect(platform.storage.get("k", "default")).resolves.toBe("default");
  });

  it("web storage reads and writes localStorage", async () => {
    const storageData = new Map<string, string>();
    const localStorageMock = {
      getItem(key: string) {
        return storageData.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storageData.set(key, value);
      },
      removeItem(key: string) {
        storageData.delete(key);
      },
    };
    setWindow({ localStorage: localStorageMock, open: vi.fn() } as unknown as Window);

    const platform = await createWebPlatform();
    await platform.storage.set("theme", { dark: true });
    const value = await platform.storage.get("theme", { dark: false });
    expect(value).toEqual({ dark: true });
    await platform.storage.remove("theme");
    await expect(platform.storage.get("theme", "fallback")).resolves.toBe("fallback");
  });

  it("web vfs join trims slashes safely", async () => {
    const platform = await createWebPlatform();
    await expect(platform.vfs.join("/root/", "\\logs\\", "/maa.log/")).resolves.toBe(
      "root/logs/maa.log"
    );
  });
});
