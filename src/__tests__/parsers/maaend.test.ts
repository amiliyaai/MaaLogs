import { describe, it, expect } from "vitest";
import { parseBracketLine } from "../../parsers/shared";
import { MAAEND_LOG_SAMPLES } from "../fixtures/maaend-samples";

describe("MaaEnd Event Notification Parsing", () => {
  describe("Node.Recognition events", () => {
    it("should parse Node.Recognition.Starting", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.recognitionStarting);
      expect(result).not.toBeNull();
      expect(result?.message).toContain("OnEventNotify");
      expect(result?.params["msg"]).toBe("Node.Recognition.Starting");

      const details = result?.params["details"] as Record<string, unknown>;
      expect(details).toBeDefined();
      expect(details["name"]).toBe("ScenePrivateAnyEnterWorldSuccess");
      expect(details["reco_id"]).toBe(400000006);
      expect(details["task_id"]).toBe(200000001);
    });

    it("should parse Node.Recognition.Succeeded with DirectHit", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.recognitionSucceeded);
      expect(result).not.toBeNull();
      expect(result?.params["msg"]).toBe("Node.Recognition.Succeeded");

      const details = result?.params["details"] as Record<string, unknown>;
      expect(details["name"]).toBe("SceneAnyEnterWorld");

      const recoDetails = details["reco_details"] as Record<string, unknown>;
      expect(recoDetails["algorithm"]).toBe("DirectHit");
      expect(recoDetails["box"]).toEqual([0, 0, 0, 0]);
    });

    it("should parse Node.Recognition.Failed", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.recognitionFailed);
      expect(result).not.toBeNull();
      expect(result?.params["msg"]).toBe("Node.Recognition.Failed");

      const details = result?.params["details"] as Record<string, unknown>;
      expect(details["name"]).toBe("ScenePrivateAnyEnterWorldSuccess");

      const recoDetails = details["reco_details"] as Record<string, unknown>;
      expect(recoDetails["algorithm"]).toBe("And");
      expect(recoDetails["box"]).toBeNull();
    });
  });

  describe("Node.NextList events", () => {
    it("should parse Node.NextList.Starting with list", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.nextListStarting);
      expect(result).not.toBeNull();
      expect(result?.params["msg"]).toBe("Node.NextList.Starting");

      const details = result?.params["details"] as Record<string, unknown>;
      expect(details["name"]).toBe("SceneAnyEnterWorld");

      const list = details["list"] as Array<Record<string, unknown>>;
      expect(list).toHaveLength(3);
      expect(list[0]["name"]).toBe("ScenePrivateAnyEnterWorldSuccess");
      expect(list[1]["name"]).toBe("ScenePrivateLogin");
      expect(list[2]["name"]).toBe("SceneDialogConfirm");
    });
  });

  describe("Node.PipelineNode events", () => {
    it("should parse Node.PipelineNode.Succeeded", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.pipelineNodeSucceeded);
      expect(result).not.toBeNull();
      expect(result?.params["msg"]).toBe("Node.PipelineNode.Succeeded");

      const details = result?.params["details"] as Record<string, unknown>;
      expect(details["name"]).toBe("SceneEnterMenuValuables");
      expect(details["node_id"]).toBe(300000003);

      const nodeDetails = details["node_details"] as Record<string, unknown>;
      expect(nodeDetails["name"]).toBe("SceneAnyEnterWorld");
      expect(nodeDetails["completed"]).toBe(true);
    });
  });

  describe("Node.Action events", () => {
    it("should parse Node.Action.Starting", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.actionStarting);
      expect(result).not.toBeNull();
      expect(result?.params["msg"]).toBe("Node.Action.Starting");

      const details = result?.params["details"] as Record<string, unknown>;
      expect(details["name"]).toBe("SceneAnyEnterWorld");
      expect(details["action_id"]).toBe(500000003);
    });

    it("should parse Node.Action.Succeeded", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.actionSucceeded);
      expect(result).not.toBeNull();
      expect(result?.params["msg"]).toBe("Node.Action.Succeeded");

      const details = result?.params["details"] as Record<string, unknown>;
      const actionDetails = details["action_details"] as Record<string, unknown>;
      expect(actionDetails["action"]).toBe("DoNothing");
      expect(actionDetails["success"]).toBe(true);
    });
  });

  describe("Task events", () => {
    it("should parse Task.Starting", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.taskStarting);
      expect(result).not.toBeNull();
      expect(result?.params["msg"]).toBe("Task.Starting");

      const details = result?.params["details"] as Record<string, unknown>;
      expect(details["name"]).toBe("SceneEnterMenuValuables");
      expect(details["task_id"]).toBe(200000001);
    });

    it("should parse Task.Completed", () => {
      const result = parseBracketLine(MAAEND_LOG_SAMPLES.taskCompleted);
      expect(result).not.toBeNull();
      expect(result?.params["msg"]).toBe("Task.Completed");

      const details = result?.params["details"] as Record<string, unknown>;
      expect(details["name"]).toBe("SceneEnterMenuValuables");
    });
  });
});
