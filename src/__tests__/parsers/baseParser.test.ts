import { describe, it, expect } from "vitest";
import {
  detectProjectFromLine,
  detectProject,
  createMainLogContext,
  parseOnEventNotify,
  parseNodeDisabled,
  parseNextListEvent,
  parseRecognitionNodeEvent,
  parseNodeRecognitionEvent,
  extractRecoDetailsFromEvent,
  parseMainLogBase,
} from "../../parsers/baseParser";
import { parseBracketLine } from "../../parsers/shared";
import { M9A_LOG_SAMPLES } from "../fixtures/m9a-samples";

describe("createMainLogContext", () => {
  it("should create empty context with default values", () => {
    const context = createMainLogContext();
    expect(context.events).toEqual([]);
    expect(context.controllers).toEqual([]);
    expect(context.identifierMap).toBeInstanceOf(Map);
    expect(context.lastIdentifier).toBeNull();
    expect(context.detectedProject).toBe("unknown");
  });
});

describe("detectProjectFromLine", () => {
  it("should detect M9A from Working path", () => {
    const line = "[Logger] Working D:/M9A/resource";
    expect(detectProjectFromLine(line)).toBe("m9a");
  });

  it("should detect M9A from Windows path", () => {
    const line = "[Logger] Working D:\\M9A\\resource";
    expect(detectProjectFromLine(line)).toBe("m9a");
  });

  it("should detect MaaEnd from path", () => {
    const line = "[Logger] Working C:/MaaEnd-win-x86_64";
    expect(detectProjectFromLine(line)).toBe("maaend");
  });

  it("should return null for non-Working line", () => {
    const line = "[INF] Some other log message";
    expect(detectProjectFromLine(line)).toBeNull();
  });

  it("should return null for unknown project path", () => {
    const line = "[Logger] Working C:/UnknownProject";
    expect(detectProjectFromLine(line)).toBeNull();
  });
});

describe("detectProject", () => {
  it("should detect M9A from multiple lines", () => {
    const lines = ["[INF] First line", "[Logger] Working D:/M9A/resource", "[INF] Third line"];
    expect(detectProject(lines)).toBe("m9a");
  });

  it("should detect MaaEnd from multiple lines", () => {
    const lines = ["[INF] First line", "[Logger] Working C:/MaaEnd-win-x86_64", "[INF] Third line"];
    expect(detectProject(lines)).toBe("maaend");
  });

  it("should return unknown for no matching lines", () => {
    const lines = ["[INF] First line", "[INF] Second line", "[INF] Third line"];
    expect(detectProject(lines)).toBe("unknown");
  });

  it("should return unknown for empty lines", () => {
    expect(detectProject([])).toBe("unknown");
  });

  it("should only check first 100 lines", () => {
    const lines = Array(100).fill("[INF] Some line");
    lines.push("[Logger] Working D:/M9A/resource");
    expect(detectProject(lines)).toBe("unknown");
  });
});

describe("parseOnEventNotify", () => {
  it("should parse OnEventNotify message", () => {
    const line = `[2025-06-14 11:37:29.601][INF][Px4224][Tx33237][EventDispatcher.hpp][L65] !!!OnEventNotify!!! [handle=true] [msg=Node.PipelineNode.Succeeded] [details={"name":"TestNode"}]`;
    const parsed = parseBracketLine(line);
    const result = parsed ? parseOnEventNotify(parsed, "maa.log", 1) : null;

    expect(result).not.toBeNull();
    expect(result?.message).toBe("Node.PipelineNode.Succeeded");
    expect(result?.details.name).toBe("TestNode");
  });

  it("should return null for non-OnEventNotify message", () => {
    const parsed = parseBracketLine(M9A_LOG_SAMPLES.nodeHit);
    const result = parsed ? parseOnEventNotify(parsed, "maa.log", 1) : null;
    expect(result).toBeNull();
  });

  it("should return null for null parsed", () => {
    const result = parseOnEventNotify(
      null as unknown as Parameters<typeof parseOnEventNotify>[0],
      "maa.log",
      1
    );
    expect(result).toBeNull();
  });
});

describe("parseNodeDisabled", () => {
  it("should return null for non-disabled message", () => {
    const parsed = parseBracketLine(M9A_LOG_SAMPLES.nodeHit);
    const result = parsed ? parseNodeDisabled(parsed, "maa.log", 1) : null;
    expect(result).toBeNull();
  });

  it("should return null for null parsed", () => {
    const result = parseNodeDisabled(
      null as unknown as Parameters<typeof parseNodeDisabled>[0],
      "maa.log",
      1
    );
    expect(result).toBeNull();
  });
});

describe("parseNextListEvent", () => {
  it("should return null for non-NextList message", () => {
    const parsed = parseBracketLine(M9A_LOG_SAMPLES.nodeHit);
    const result = parsed ? parseNextListEvent(parsed, "maa.log", 1) : null;
    expect(result).toBeNull();
  });

  it("should return null for null parsed", () => {
    const result = parseNextListEvent(
      null as unknown as Parameters<typeof parseNextListEvent>[0],
      "maa.log",
      1
    );
    expect(result).toBeNull();
  });
});

describe("parseRecognitionNodeEvent", () => {
  it("should return null for non-RecognitionNode message", () => {
    const parsed = parseBracketLine(M9A_LOG_SAMPLES.nodeHit);
    const result = parsed ? parseRecognitionNodeEvent(parsed, "maa.log", 1) : null;
    expect(result).toBeNull();
  });

  it("should return null for null parsed", () => {
    const result = parseRecognitionNodeEvent(
      null as unknown as Parameters<typeof parseRecognitionNodeEvent>[0],
      "maa.log",
      1
    );
    expect(result).toBeNull();
  });
});

describe("parseNodeRecognitionEvent", () => {
  it("should return null for non-PipelineNode message", () => {
    const parsed = parseBracketLine(M9A_LOG_SAMPLES.nodeHit);
    const result = parsed ? parseNodeRecognitionEvent(parsed, "maa.log", 1) : null;
    expect(result).toBeNull();
  });

  it("should return null for null parsed", () => {
    const result = parseNodeRecognitionEvent(
      null as unknown as Parameters<typeof parseNodeRecognitionEvent>[0],
      "maa.log",
      1
    );
    expect(result).toBeNull();
  });
});

describe("extractRecoDetailsFromEvent", () => {
  it("should extract reco details from event", () => {
    const event = {
      timestamp: "2025-06-14 11:37:29.601",
      level: "INF",
      message: "Node.PipelineNode.Succeeded",
      details: {
        name: "TestNode",
        reco_details: {
          name: "TestNode",
          reco_id: 123,
          algorithm: "TemplateMatch",
          box: [100, 200, 50, 80],
          detail: { score: 0.95 },
        },
      },
      fileName: "maa.log",
      processId: "Px4224",
      threadId: "Tx33237",
      _lineNumber: 1,
    };

    const result = extractRecoDetailsFromEvent(event);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("TestNode");
    expect(result?.reco_id).toBe(123);
    expect(result?.algorithm).toBe("TemplateMatch");
    expect(result?.box).toEqual([100, 200, 50, 80]);
  });

  it("should return null for event without reco_details", () => {
    const event = {
      timestamp: "2025-06-14 11:37:29.601",
      level: "INF",
      message: "Node.PipelineNode.Succeeded",
      details: { name: "TestNode" },
      fileName: "maa.log",
      processId: "Px4224",
      threadId: "Tx33237",
      _lineNumber: 1,
    };

    const result = extractRecoDetailsFromEvent(event);
    expect(result).toBeNull();
  });

  it("should return null for event without details", () => {
    const event = {
      timestamp: "2025-06-14 11:37:29.601",
      level: "INF",
      message: "Node.PipelineNode.Succeeded",
      details: null,
      fileName: "maa.log",
      processId: "Px4224",
      threadId: "Tx33237",
      _lineNumber: 1,
    };

    const result = extractRecoDetailsFromEvent(
      event as unknown as Parameters<typeof extractRecoDetailsFromEvent>[0]
    );
    expect(result).toBeNull();
  });
});

describe("parseMainLogBase", () => {
  it("should parse multiple log lines", () => {
    const lines = [
      "[Logger] Working D:/M9A/resource",
      `[2025-06-14 11:37:29.601][INF][Px4224][Tx33237][EventDispatcher.hpp][L65] !!!OnEventNotify!!! [msg=Tasker.Task.Starting] [details={"entry":"MainTask"}]`,
      M9A_LOG_SAMPLES.nodeHit,
    ];

    const context = parseMainLogBase(lines, "maa.log");
    expect(context.detectedProject).toBe("m9a");
    expect(context.events.length).toBeGreaterThan(0);
  });

  it("should handle empty lines", () => {
    const context = parseMainLogBase([], "maa.log");
    expect(context.events).toEqual([]);
    expect(context.controllers).toEqual([]);
    expect(context.detectedProject).toBe("unknown");
  });

  it("should skip empty lines", () => {
    const lines = ["", "   ", "[Logger] Working D:/M9A/resource"];

    const context = parseMainLogBase(lines, "maa.log");
    expect(context.detectedProject).toBe("m9a");
  });
});
