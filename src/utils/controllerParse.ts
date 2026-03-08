/**
 * @fileoverview 控制器能力位掩码解析
 *
 * 提供 ADB 与 Win32 的截屏与输入方式解析工具。
 */
import type {
  AdbScreencapMethod,
  AdbInputMethod,
  Win32ScreencapMethod,
  Win32InputMethod,
} from "@/types/logTypes";

const ADB_SCREENCAP_METHOD_MAP: Record<number, AdbScreencapMethod> = {
  1: "EncodeToFileAndPull",
  2: "Encode",
  4: "RawWithGzip",
  8: "RawByNetcat",
  16: "MinicapDirect",
  32: "MinicapStream",
  64: "EmulatorExtras",
};

const ADB_INPUT_METHOD_MAP: Record<number, AdbInputMethod> = {
  1: "AdbShell",
  2: "MinitouchAndAdbKey",
  4: "Maatouch",
  8: "EmulatorExtras",
};

const WIN32_SCREENCAP_METHOD_MAP: Record<number, Win32ScreencapMethod> = {
  1: "GDI",
  2: "FramePool",
  4: "DXGI_DesktopDup",
  8: "DXGI_DesktopDup_Window",
  16: "PrintWindow",
  32: "ScreenDC",
};

const WIN32_INPUT_METHOD_MAP: Record<number, Win32InputMethod> = {
  1: "Seize",
  2: "SendMessage",
  4: "PostMessage",
  8: "LegacyEvent",
  16: "PostThreadMessage",
  32: "SendMessageWithCursorPos",
  64: "PostMessageWithCursorPos",
  128: "SendMessageWithWindowPos",
  256: "PostMessageWithWindowPos",
};

function toBigInt(value: number | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function toSafeNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

/**
 * 解析 ADB 截屏方式位掩码
 */
export function parseAdbScreencapMethods(bitmask: number | bigint): AdbScreencapMethod[] {
  const methods: AdbScreencapMethod[] = [];
  const bigBitmask = toBigInt(bitmask);
  for (const [bit, name] of Object.entries(ADB_SCREENCAP_METHOD_MAP)) {
    if ((bigBitmask & BigInt(bit)) !== 0n) {
      methods.push(name);
    }
  }
  return methods.length > 0 ? methods : ["Unknown"];
}

/**
 * 解析 ADB 输入方式位掩码
 */
export function parseAdbInputMethods(bitmask: number | bigint): AdbInputMethod[] {
  const methods: AdbInputMethod[] = [];
  const bigBitmask = toBigInt(bitmask);
  for (const [bit, name] of Object.entries(ADB_INPUT_METHOD_MAP)) {
    if ((bigBitmask & BigInt(bit)) !== 0n) {
      methods.push(name);
    }
  }
  return methods.length > 0 ? methods : ["Unknown"];
}

/**
 * 解析 Win32 截屏方式枚举值
 */
export function parseWin32ScreencapMethod(value: number | bigint): Win32ScreencapMethod {
  return WIN32_SCREENCAP_METHOD_MAP[toSafeNumber(value)] || "Unknown";
}

/**
 * 解析 Win32 输入方式枚举值
 */
export function parseWin32InputMethod(value: number | bigint): Win32InputMethod {
  return WIN32_INPUT_METHOD_MAP[toSafeNumber(value)] || "Unknown";
}
