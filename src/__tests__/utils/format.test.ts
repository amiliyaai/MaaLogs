import { describe, it, expect } from "vitest";
import {
  formatSize,
  formatDuration,
  formatTaskStatus,
  formatTaskTimeParts,
  formatBox,
  formatNextName,
} from "../../utils/format";
import type { NextListItem } from "../../types/logTypes";

describe("formatSize", () => {
  it("should format bytes", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("should format kilobytes", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it("should format megabytes", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(formatSize(100 * 1024 * 1024)).toBe("100.0 MB");
  });

  it("should format gigabytes - boundary value", () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe("1024.0 MB");
    expect(formatSize(1024 * 1024 * 1024 - 1)).toBe("1024.0 MB");
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe("2560.0 MB");
  });

  it("should handle negative values - boundary value", () => {
    expect(formatSize(-1)).toBe("-1 B");
    expect(formatSize(-1024)).toBe("-1024 B");
    expect(formatSize(-1024 * 1024)).toBe("-1048576 B");
  });

  it("should handle special numeric values - boundary value", () => {
    expect(formatSize(NaN)).toBe("NaN MB");
    expect(formatSize(Infinity)).toBe("Infinity MB");
    expect(formatSize(-Infinity)).toBe("-Infinity B");
  });

  it("should handle very large values - boundary value", () => {
    const result = formatSize(Number.MAX_SAFE_INTEGER);
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
  });

  it("should handle KB boundary - equivalence class", () => {
    expect(formatSize(1023)).toBe("1023 B");
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1025)).toBe("1.0 KB");
  });

  it("should handle MB boundary - equivalence class", () => {
    expect(formatSize(1024 * 1024 - 1)).toBe("1024.0 KB");
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("formatDuration", () => {
  it("should format milliseconds", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(100)).toBe("100 ms");
    expect(formatDuration(999)).toBe("999 ms");
  });

  it("should format seconds", () => {
    expect(formatDuration(1000)).toBe("1.00 s");
    expect(formatDuration(2500)).toBe("2.50 s");
    expect(formatDuration(59999)).toBe("60.00 s");
  });

  it("should format minutes and seconds", () => {
    expect(formatDuration(60000)).toBe("1m 0.0s");
    expect(formatDuration(125000)).toBe("2m 5.0s");
    expect(formatDuration(3661000)).toBe("61m 1.0s");
  });

  it("should handle invalid values", () => {
    expect(formatDuration(NaN)).toBe("-");
    expect(formatDuration(Infinity)).toBe("-");
    expect(formatDuration(-Infinity)).toBe("-");
  });

  it("should handle negative values - boundary value", () => {
    expect(formatDuration(-1)).toBe("-1 ms");
    expect(formatDuration(-1000)).toBe("-1000 ms");
    expect(formatDuration(-60000)).toBe("-60000 ms");
  });

  it("should handle second/minute boundary - equivalence class", () => {
    expect(formatDuration(999)).toBe("999 ms");
    expect(formatDuration(1000)).toBe("1.00 s");
    expect(formatDuration(59999)).toBe("60.00 s");
    expect(formatDuration(60000)).toBe("1m 0.0s");
  });

  it("should handle hour boundary - boundary value", () => {
    expect(formatDuration(3599999)).toBe("59m 60.0s");
    expect(formatDuration(3600000)).toBe("60m 0.0s");
    expect(formatDuration(3661000)).toBe("61m 1.0s");
  });

  it("should handle very large durations - boundary value", () => {
    expect(formatDuration(86400000)).toBe("1440m 0.0s");
    expect(formatDuration(172800000)).toBe("2880m 0.0s");
  });

  it("should handle decimal milliseconds - equivalence class", () => {
    expect(formatDuration(1.5)).toBe("2 ms");
    expect(formatDuration(100.99)).toBe("101 ms");
  });
});

describe("formatTaskStatus", () => {
  it("should format succeeded status", () => {
    expect(formatTaskStatus("succeeded")).toBe("成功");
  });

  it("should format failed status", () => {
    expect(formatTaskStatus("failed")).toBe("失败");
  });

  it("should format running status", () => {
    expect(formatTaskStatus("running")).toBe("运行中");
  });
});

describe("formatTaskTimeParts", () => {
  it("should split timestamp into date and time", () => {
    const result = formatTaskTimeParts("2025-06-14 11:37:29.601");
    expect(result.date).toBe("2025-06-14");
    expect(result.time).toBe("11:37:29");
  });

  it("should handle timestamp without milliseconds", () => {
    const result = formatTaskTimeParts("2025-06-14 11:37:29");
    expect(result.date).toBe("2025-06-14");
    expect(result.time).toBe("11:37:29");
  });

  it("should handle empty string", () => {
    const result = formatTaskTimeParts("");
    expect(result.date).toBe("");
    expect(result.time).toBe("");
  });

  it("should handle invalid format", () => {
    const result = formatTaskTimeParts("invalid");
    expect(result.date).toBe("invalid");
    expect(result.time).toBe("");
  });

  it("should handle year boundary - boundary value", () => {
    const result = formatTaskTimeParts("2025-01-01 00:00:00.000");
    expect(result.date).toBe("2025-01-01");
    expect(result.time).toBe("00:00:00");
  });

  it("should handle end of year - boundary value", () => {
    const result = formatTaskTimeParts("2025-12-31 23:59:59.999");
    expect(result.date).toBe("2025-12-31");
    expect(result.time).toBe("23:59:59");
  });

  it("should handle leap year date - boundary value", () => {
    const result = formatTaskTimeParts("2024-02-29 12:00:00.000");
    expect(result.date).toBe("2024-02-29");
    expect(result.time).toBe("12:00:00");
  });

  it("should handle midnight - boundary value", () => {
    const result = formatTaskTimeParts("2025-06-14 00:00:00.000");
    expect(result.date).toBe("2025-06-14");
    expect(result.time).toBe("00:00:00");
  });

  it("should handle noon - equivalence class", () => {
    const result = formatTaskTimeParts("2025-06-14 12:00:00.000");
    expect(result.date).toBe("2025-06-14");
    expect(result.time).toBe("12:00:00");
  });

  it("should handle partial timestamp - equivalence class", () => {
    const result = formatTaskTimeParts("2025-06-14");
    expect(result.date).toBe("2025-06-14");
    expect(result.time).toBe("");
  });

  it("should handle null and undefined - boundary value", () => {
    const nullResult = formatTaskTimeParts(null as unknown as string);
    expect(nullResult.date).toBe("");
    expect(nullResult.time).toBe("");

    const undefinedResult = formatTaskTimeParts(undefined as unknown as string);
    expect(undefinedResult.date).toBe("");
    expect(undefinedResult.time).toBe("");
  });
});

describe("formatBox", () => {
  it("should format box coordinates", () => {
    expect(formatBox([100, 200, 50, 80])).toBe("[100, 200, 50, 80]");
  });

  it("should handle zero box", () => {
    expect(formatBox([0, 0, 0, 0])).toBe("[0, 0, 0, 0]");
  });

  it("should handle null", () => {
    expect(formatBox(null)).toBe("-");
  });

  it("should handle undefined", () => {
    expect(formatBox(undefined)).toBe("-");
  });

  it("should handle string input", () => {
    expect(formatBox("custom box string")).toBe("custom box string");
  });
});

describe("formatNextName", () => {
  it("should format simple item", () => {
    const item: NextListItem = { name: "NodeA", anchor: false, jump_back: false };
    expect(formatNextName(item)).toBe("NodeA");
  });

  it("should add anchor prefix", () => {
    const item: NextListItem = { name: "NodeB", anchor: true, jump_back: false };
    expect(formatNextName(item)).toBe("[Anchor] NodeB");
  });

  it("should add jump_back prefix", () => {
    const item: NextListItem = { name: "NodeC", anchor: false, jump_back: true };
    expect(formatNextName(item)).toBe("[JumpBack] NodeC");
  });

  it("should add both prefixes", () => {
    const item: NextListItem = { name: "NodeD", anchor: true, jump_back: true };
    expect(formatNextName(item)).toBe("[JumpBack] [Anchor] NodeD");
  });
});
