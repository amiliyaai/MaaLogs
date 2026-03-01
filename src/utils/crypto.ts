/**
 * @fileoverview 加密工具模块
 *
 * 本文件提供安全的数据加密和解密功能，用于保护敏感数据（如 API 密钥）。
 * 使用 Web Crypto API 实现 AES-GCM 加密算法，结合 PBKDF2 密钥派生。
 *
 * 主要功能：
 * - AES-256-GCM 对称加密
 * - PBKDF2 密钥派生（100,000 次迭代）
 * - 自动密钥管理和持久化
 * - 安全的随机盐和 IV 生成
 *
 * 加密数据格式：Base64(salt + iv + ciphertext)
 * - salt: 16 字节随机盐
 * - iv: 12 字节初始化向量
 * - ciphertext: 加密后的数据
 *
 * @module utils/crypto
 * @author MaaLogs Team
 * @license MIT
 */

import type { Store } from "@tauri-apps/plugin-store";

/** 盐值长度（字节） */
const SALT_LENGTH = 16;

/** 初始化向量长度（字节） */
const IV_LENGTH = 12;

/** 加密算法名称 */
const ALGORITHM = "AES-GCM";

/** 密钥存储键名 */
const STORAGE_KEY = "maa-logs-crypto-key";

/**
 * 从密码派生加密密钥
 *
 * 使用 PBKDF2 算法从用户密码派生 AES-256-GCM 密钥。
 * 采用 100,000 次迭代和 SHA-256 哈希，确保密钥派生的安全性。
 *
 * @param {string} password - 用户密码
 * @param {Uint8Array} salt - 随机盐值（16 字节）
 * @returns {Promise<CryptoKey>} 派生的加密密钥
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 将 Uint8Array 转换为 Base64 字符串
 *
 * @param {Uint8Array} arr - 字节数组
 * @returns {string} Base64 编码字符串
 */
function arrayToBase64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

/**
 * 加密数据
 *
 * 使用 AES-256-GCM 算法加密数据。每次加密生成新的随机盐和 IV，
 * 确保相同数据的多次加密产生不同的密文。
 *
 * @param {string} data - 待加密的原始数据
 * @param {string} password - 加密密码
 * @returns {Promise<string>} Base64 编码的加密数据
 *
 * @example
 * const encrypted = await encrypt('my-secret-api-key', 'user-password');
 * console.log(encrypted); // "YWJjZGVm..." (Base64 编码)
 */
export async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, dataBytes);

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return arrayToBase64(combined);
}

/**
 * 解密数据
 *
 * 使用 AES-256-GCM 算法解密数据。从加密数据中提取盐和 IV，
 * 重新派生密钥并解密。
 *
 * @param {string} encryptedData - Base64 编码的加密数据
 * @param {string} password - 解密密码
 * @returns {Promise<string>} 解密后的原始数据
 * @throws {Error} 解密失败时抛出 "DECRYPTION_FAILED" 错误
 *
 * @example
 * const decrypted = await decrypt(encrypted, 'user-password');
 * console.log(decrypted); // "my-secret-api-key"
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  try {
    const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const data = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data);

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error("DECRYPTION_FAILED");
    }
    throw new Error("DECRYPTION_FAILED");
  }
}

/** Store 实例缓存 */
let store: Store | null = null;

/**
 * 获取或创建 Store 实例
 *
 * 使用单例模式管理 Tauri Store 实例，用于持久化加密密钥。
 *
 * @returns {Promise<Store>} Store 实例
 */
export async function getStore(): Promise<Store> {
  if (!store) {
    const { Store } = await import("@tauri-apps/plugin-store");
    store = await Store.load("app-settings.json", { autoSave: 500, defaults: {} });
  }
  return store;
}

/**
 * 获取或创建加密密钥
 *
 * 从 Store 中读取已保存的密钥，如果不存在则生成新的随机密钥。
 * 密钥为 32 字节的随机值，以 Base64 格式存储。
 *
 * @returns {Promise<string>} Base64 编码的加密密钥
 */
async function getOrCreateKey(): Promise<string> {
  const s = await getStore();
  let key = (await s.get(STORAGE_KEY)) as string | undefined;
  if (!key) {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    key = arrayToBase64(array);
    await s.set(STORAGE_KEY, key);
  }
  return key;
}

/**
 * 使用自动管理的密钥加密数据
 *
 * 便捷方法，使用自动生成和管理的密钥加密数据。
 * 适用于需要加密存储但不需要用户输入密码的场景（如 API 密钥存储）。
 *
 * @param {string} data - 待加密的原始数据
 * @returns {Promise<string>} Base64 编码的加密数据
 *
 * @example
 * const encrypted = await encryptSecure('sk-xxxxx');
 * await store.set('api-key', encrypted);
 */
export async function encryptSecure(data: string): Promise<string> {
  return encrypt(data, await getOrCreateKey());
}

/**
 * 使用自动管理的密钥解密数据
 *
 * 便捷方法，使用自动管理的密钥解密数据。
 * 与 encryptSecure 配对使用。
 *
 * @param {string} encryptedData - Base64 编码的加密数据
 * @returns {Promise<string>} 解密后的原始数据
 * @throws {Error} 解密失败时抛出 "DECRYPTION_FAILED" 错误
 *
 * @example
 * const encrypted = await store.get<string>('api-key');
 * const apiKey = await decryptSecure(encrypted);
 */
export async function decryptSecure(encryptedData: string): Promise<string> {
  return decrypt(encryptedData, await getOrCreateKey());
}
