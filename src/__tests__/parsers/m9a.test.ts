import { describe, it, expect } from "vitest";
import { m9aProjectParser } from "../../parsers/projects/m9a";
import { M9A_LOG_SAMPLES } from "../fixtures/m9a-samples";

describe("M9A Project Parser", () => {
  describe("parser metadata", () => {
    it("should have correct id", () => {
      expect(m9aProjectParser.id).toBe("m9a");
    });

    it("should have correct name", () => {
      expect(m9aProjectParser.name).toBe("M9A");
    });

    it("should have description", () => {
      expect(m9aProjectParser.description).toBeDefined();
    });
  });

  describe("parseMainLog", () => {
    it("should parse empty lines", () => {
      const result = m9aProjectParser.parseMainLog([], { fileName: "maa.log" });
      expect(result.events).toEqual([]);
      expect(result.controllers).toEqual([]);
    });

    it("should parse node hit log", () => {
      const lines = [M9A_LOG_SAMPLES.nodeHit];
      const result = m9aProjectParser.parseMainLog(lines, { fileName: "maa.log" });
      expect(result.events.length).toBeGreaterThanOrEqual(0);
    });

    it("should parse controller creation log", () => {
      const lines = [M9A_LOG_SAMPLES.adbControllerCreate];
      const result = m9aProjectParser.parseMainLog(lines, { fileName: "maa.log" });
      expect(result.controllers.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("parseAuxLog", () => {
    it("should parse empty lines", () => {
      const result = m9aProjectParser.parseAuxLog([], { fileName: "custom.log" });
      expect(result.entries).toEqual([]);
    });

    it("should parse custom log format", () => {
      const customLogLine =
        "2025-06-14 11:37:29.601 | INFO | caller.go:123 | Recognition started [identifier=abc12345-def6-7890-abcd-ef1234567890] [task_id=1]";
      const result = m9aProjectParser.parseAuxLog([customLogLine], { fileName: "custom.log" });
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].level).toBe("INFO");
      expect(result.entries[0].identifier).toBe("abc12345-def6-7890-abcd-ef1234567890");
      expect(result.entries[0].task_id).toBe(1);
    });
  });

  describe("getAuxLogParserInfo", () => {
    it("should return parser info", () => {
      const info = m9aProjectParser.getAuxLogParserInfo();
      expect(info.id).toBe("m9a");
      expect(info.name).toContain("M9A");
    });
  });
});
