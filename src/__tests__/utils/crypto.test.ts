/* eslint-disable sonarjs/no-hardcoded-passwords */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { encrypt, decrypt } from "../../utils/crypto";

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

describe("encrypt and decrypt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should encrypt and decrypt data correctly", async () => {
    const originalData = "my-secret-api-key";
    const password = "user-password-1";

    const encrypted = await encrypt(originalData, password);
    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe("string");
    expect(encrypted).not.toBe(originalData);

    const decrypted = await decrypt(encrypted, password);
    expect(decrypted).toBe(originalData);
  });

  it("should produce different ciphertext for same data", async () => {
    const data = "same-data";
    const password = "same-password-2";

    const encrypted1 = await encrypt(data, password);
    const encrypted2 = await encrypt(data, password);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it("should fail to decrypt with wrong password", async () => {
    const data = "secret-data";
    const correctPassword = "correct-password-3";
    const wrongPassword = "wrong-password-4";

    const encrypted = await encrypt(data, correctPassword);

    await expect(decrypt(encrypted, wrongPassword)).rejects.toThrow("DECRYPTION_FAILED");
  });

  it("should handle empty data", async () => {
    const encrypted = await encrypt("", "password-5");
    const decrypted = await decrypt(encrypted, "password-5");
    expect(decrypted).toBe("");
  });

  it("should handle unicode characters", async () => {
    const data = "你好世界 🌍 Hello World";
    const password = "密码测试";

    const encrypted = await encrypt(data, password);
    const decrypted = await decrypt(encrypted, password);
    expect(decrypted).toBe(data);
  });

  it("should handle long data", async () => {
    const data = "a".repeat(10000);
    const password = "password-6";

    const encrypted = await encrypt(data, password);
    const decrypted = await decrypt(encrypted, password);
    expect(decrypted).toBe(data);
  });

  it("should fail to decrypt invalid base64", async () => {
    await expect(decrypt("invalid-base64!@#", "password-7")).rejects.toThrow("DECRYPTION_FAILED");
  });

  it("should fail to decrypt truncated data", async () => {
    const encrypted = await encrypt("data", "password-8");
    const truncated = encrypted.slice(0, -10);
    await expect(decrypt(truncated, "password-8")).rejects.toThrow("DECRYPTION_FAILED");
  });
});
