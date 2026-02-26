const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const STORAGE_KEY = "maalogsEncryptionKey";

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
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
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(data)
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  let binary = "";
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

export async function decrypt(encryptedData: string, password: string): Promise<string> {
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
}

let store: any = null;

async function getStore() {
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
    key = btoa(String.fromCharCode(...array));
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
