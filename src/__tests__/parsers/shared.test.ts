import { describe, it, expect } from "vitest";
import {
  parseBracketLine,
  parseAdbScreencapMethods,
  parseAdbInputMethods,
} from "../../parsers/shared";
import {
  M9A_LOG_SAMPLES,
} from "../fixtures/m9a-samples";

describe("parseBracketLine", () => {
  it("should parse node hit log line", () => {
    const result = parseBracketLine(M9A_LOG_SAMPLES.nodeHit);
    expect(result).not.toBeNull();
    expect(result?.timestamp).toBe("2025-06-14 11:37:29.601");
    expect(result?.level).toBe("INF");
    expect(result?.processId).toBe("Px4224");
    expect(result?.threadId).toBe("Tx33237");
    expect(result?.sourceFile).toBe("TaskBase.cpp");
    expect(result?.lineNumber).toBe("L131");
    expect(result?.message).toContain("node hit");
  });

  it("should parse node disabled log line", () => {
    const result = parseBracketLine(M9A_LOG_SAMPLES.nodeDisabled);
    expect(result).not.toBeNull();
    expect(result?.message).toContain("node disabled");
    expect(result?.params["pipeline_data.enable"]).toBe(false);
  });

  it("should parse run_recognition enter line with next list", () => {
    const result = parseBracketLine(M9A_LOG_SAMPLES.runRecognitionEnter);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("enter");
    expect(result?.params["cur_node_"]).toBe("TheAlarm");
    expect(result?.params["list"]).toEqual(["Alarm_End", "Alarm_Find0/3"]);
  });

  it("should parse run_recognition leave line with duration", () => {
    const result = parseBracketLine(M9A_LOG_SAMPLES.runRecognitionLeave);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("leave");
    expect(result?.duration).toBe(686);
  });

  it("should parse MaaContextRunRecognition (nested recognition)", () => {
    const result = parseBracketLine(M9A_LOG_SAMPLES.nestedRecognitionEnter);
    expect(result).not.toBeNull();
    expect(result?.sourceFile).toBe("MaaContext.cpp");
    expect(result?.params["entry"]).toBe("Alarm_FindStageFlag");
    expect(result?.status).toBe("enter");
  });

  it("should parse ADB controller create line", () => {
    const result = parseBracketLine(M9A_LOG_SAMPLES.adbControllerCreate);
    expect(result).not.toBeNull();
    expect(result?.sourceFile).toBe("MaaFramework.cpp");
    expect(result?.params["adb_path"]).toBe("D:/MuMuPlayer-12.0/shell/adb.exe");
    expect(result?.params["address"]).toBe("127.0.0.1:16384");
    expect(result?.params["screencap_methods"]).toBe(BigInt("18446744073709551559"));
    expect(result?.params["input_methods"]).toBe(2);
  });
});

describe("parseAdbScreencapMethods", () => {
  it("should parse large uint64 bitmask correctly", () => {
    const bitmask = BigInt("18446744073709551559");
    const methods = parseAdbScreencapMethods(bitmask);

    expect(methods).toContain("EncodeToFileAndPull");
    expect(methods).toContain("Encode");
    expect(methods).toContain("RawWithGzip");
    expect(methods).toContain("EmulatorExtras");
    expect(methods).not.toContain("RawByNetcat");
    expect(methods).not.toContain("MinicapDirect");
    expect(methods).not.toContain("MinicapStream");
  });

  it("should return Unknown for empty bitmask", () => {
    const methods = parseAdbScreencapMethods(0);
    expect(methods).toEqual(["Unknown"]);
  });

  it("should parse single method bitmask", () => {
    const methods = parseAdbScreencapMethods(1);
    expect(methods).toEqual(["EncodeToFileAndPull"]);
  });

  it("should parse combined method bitmask", () => {
    const methods = parseAdbScreencapMethods(3);
    expect(methods).toContain("EncodeToFileAndPull");
    expect(methods).toContain("Encode");
    expect(methods).toHaveLength(2);
  });
});

describe("parseAdbInputMethods", () => {
  it("should parse MinitouchAndAdbKey", () => {
    const methods = parseAdbInputMethods(2);
    expect(methods).toEqual(["MinitouchAndAdbKey"]);
  });

  it("should parse AdbShell", () => {
    const methods = parseAdbInputMethods(1);
    expect(methods).toEqual(["AdbShell"]);
  });

  it("should parse combined input methods", () => {
    const methods = parseAdbInputMethods(3);
    expect(methods).toContain("AdbShell");
    expect(methods).toContain("MinitouchAndAdbKey");
  });

  it("should return Unknown for empty bitmask", () => {
    const methods = parseAdbInputMethods(0);
    expect(methods).toEqual(["Unknown"]);
  });
});
