const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ALGORITHM = "AES-GCM";
const STORAGE_KEY = "maa-logs-crypto-key";

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

function arrayToBase64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    dataBytes
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return arrayToBase64(combined);
}

export async function decrypt(encryptedData: string, password: string): Promise<string> {
  try {
    const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const data = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch (e: any) {
    throw new Error("DECRYPTION_FAILED");
  }
}

let store: any = null;

export async function getStore() {
  if (!store) {
    const { Store } = await import("@tauri-apps/plugin-store");
    store = await Store.load("app-settings.json", { autoSave: 500, defaults: {} });
  }
  return store;
}

async function getOrCreateKey(): Promise<string> {
  const s = await getStore();
  let key = await s.get(STORAGE_KEY) as string | undefined;
  if (!key) {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    key = arrayToBase64(array);
    await s.set(STORAGE_KEY, key);
  }
  return key;
}

export async function encryptSecure(data: string): Promise<string> {
  return encrypt(data, await getOrCreateKey());
}

export async function decryptSecure(encryptedData: string): Promise<string> {
  return decrypt(encryptedData, await getOrCreateKey());
}
