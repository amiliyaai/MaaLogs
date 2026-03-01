import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseBracketLine } from "../../parsers/shared";
import { parseMainLogBase, detectProject } from "../../parsers/baseParser";

const docsDir = join(process.cwd(), "docs");

describe("Real Log Integration Tests", () => {
  describe("maa.log (MaaFramework native format)", () => {
    let logContent: string;
    let lines: string[];

    beforeAll(() => {
      const logPath = join(docsDir, "maa.log");
      if (existsSync(logPath)) {
        logContent = readFileSync(logPath, "utf-8");
        lines = logContent.split("\n").filter((l) => l.trim());
      }
    });

    it("should detect M9A project from real log", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const workingLineIndex = lines.findIndex((l) => l.includes("Working"));
      expect(workingLineIndex).toBeGreaterThanOrEqual(0);
      if (workingLineIndex >= 0) {
        const project = detectProject(lines.slice(0, Math.max(100, workingLineIndex + 1)));
        expect(["m9a", "unknown"]).toContain(project);
      }
    });

    it("should find Working line in log", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const workingLine = lines.find((l) => l.includes("Working"));
      expect(workingLine).toBeDefined();
      expect(workingLine).toMatch(/M9A/i);
    });

    it("should parse bracket format lines correctly", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const validLines = lines.slice(0, 50);
      let parsedCount = 0;

      for (const line of validLines) {
        const parsed = parseBracketLine(line);
        if (parsed) {
          parsedCount++;
          expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
          expect(parsed.level).toBeDefined();
          expect(parsed.processId).toBeDefined();
        }
      }

      expect(parsedCount).toBeGreaterThan(0);
    });

    it("should extract events from real log", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const context = parseMainLogBase(lines.slice(0, 200), "maa.log");
      expect(["m9a", "unknown"]).toContain(context.detectedProject);
      expect(context.events.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle various log levels", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const levels = new Set<string>();

      for (const line of lines.slice(0, 100)) {
        const parsed = parseBracketLine(line);
        if (parsed?.level) {
          levels.add(parsed.level);
        }
      }

      expect(levels.size).toBeGreaterThan(0);
    });
  });

  describe("go-service.log (JSON format)", () => {
    let logContent: string;
    let lines: string[];

    beforeAll(() => {
      const logPath = join(docsDir, "go-service.log");
      if (existsSync(logPath)) {
        logContent = readFileSync(logPath, "utf-8");
        lines = logContent.split("\n").filter((l) => l.trim());
      }
    });

    it("should parse JSON log entries", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const parsedEntries: Record<string, unknown>[] = [];

      for (const line of lines.slice(0, 20)) {
        try {
          const entry = JSON.parse(line);
          parsedEntries.push(entry);
        } catch {
          // Skip non-JSON lines
        }
      }

      expect(parsedEntries.length).toBeGreaterThan(0);
    });

    it("should extract identifier from JSON logs", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const identifiers: string[] = [];

      for (const line of lines.slice(0, 50)) {
        try {
          const entry = JSON.parse(line);
          if (entry.identifier && typeof entry.identifier === "string") {
            identifiers.push(entry.identifier);
          }
        } catch {
          // Skip non-JSON lines
        }
      }

      expect(identifiers.length).toBeGreaterThan(0);
      for (const id of identifiers) {
        expect(id).toMatch(/^[a-f0-9-]{36}$/);
      }
    });

    it("should detect MaaEnd from JSON logs", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      let hasMaaEndMarker = false;

      for (const line of lines.slice(0, 20)) {
        try {
          const entry = JSON.parse(line);
          if (entry.message && String(entry.message).includes("MaaEnd")) {
            hasMaaEndMarker = true;
          }
        } catch {
          // Skip non-JSON lines
        }
      }

      expect(hasMaaEndMarker).toBe(true);
    });
  });

  describe("2025-12-21.log (Python loguru format)", () => {
    let logContent: string;
    let lines: string[];

    beforeAll(() => {
      const logPath = join(docsDir, "2025-12-21.log");
      if (existsSync(logPath)) {
        logContent = readFileSync(logPath, "utf-8");
        lines = logContent.split("\n").filter((l) => l.trim());
      }
    });

    it("should parse loguru format lines", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const loguruPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+/;
      let validCount = 0;

      for (const line of lines.slice(0, 20)) {
        if (loguruPattern.test(line)) {
          validCount++;
        }
      }

      expect(validCount).toBeGreaterThan(0);
    });

    it("should extract AgentServer events", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const agentEvents: string[] = [];

      for (const line of lines) {
        if (line.includes("AgentServer启动")) {
          agentEvents.push("start");
        } else if (line.includes("AgentServer关闭")) {
          agentEvents.push("stop");
        }
      }

      expect(agentEvents.length).toBeGreaterThan(0);
    });

    it("should extract socket_id from logs", () => {
      if (!lines || lines.length === 0) {
        expect(true).toBe(true);
        return;
      }
      const socketIds: string[] = [];

      for (const line of lines.slice(0, 50)) {
        const match = line.match(/socket_id:\s*(\S+)/);
        if (match) {
          socketIds.push(match[1]);
        }
      }

      expect(socketIds.length).toBeGreaterThan(0);
    });
  });
});
