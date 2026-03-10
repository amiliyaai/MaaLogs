import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCompareSlots } from "@/composables/useCompareSlots";
import type { TaskInfo } from "@/types/logTypes";

const isTauriEnvMock = vi.fn();
const expandSelectedFilesMock = vi.fn();

vi.mock("@/utils/env", () => ({
  isTauriEnv: (...args: unknown[]) => isTauriEnvMock(...args),
}));

vi.mock("@/utils/file", () => ({
  applySelectedPaths: vi.fn(),
  expandSelectedFiles: (...args: unknown[]) => expandSelectedFilesMock(...args),
  getFileType: () => "log",
}));

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/composables/useLogParser", () => ({
  setSelectedFiles: vi.fn(),
}));

vi.mock("@/utils/diffDetection", () => ({
  buildParsedRunSnapshot: (payload: {
    tasks: TaskInfo[];
    sourceName: string;
    detectedProject: string;
    label: string;
  }) => ({
    id: "snapshot-id",
    parsedAt: "2026-01-01 00:00:00",
    nodeStatistics: [],
    nodeSummary: null,
    totalTaskCount: payload.tasks.length,
    failedTaskCount: 0,
    ...payload,
  }),
}));

function createTask(): TaskInfo {
  return {
    key: "task-1",
    fileName: "maa.log",
    task_id: 1,
    entry: "MainTask",
    hash: "hash",
    uuid: "uuid",
    start_time: "2026-01-01 00:00:00",
    status: "succeeded",
    nodes: [],
    processId: "P1",
    threadId: "T1",
  };
}

describe("useCompareSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriEnvMock.mockReturnValue(false);
  });

  it("handles web baseline directory import", async () => {
    const selectedFile = new File(["demo"], "maa.log", { type: "text/plain" });
    expandSelectedFilesMock.mockResolvedValue([selectedFile]);

    const originalDocument = globalThis.document;
    const fakeInput = {
      type: "",
      style: { display: "" },
      multiple: false,
      accept: "",
      files: [selectedFile],
      onchange: null as null | (() => void),
      oncancel: null as null | (() => void),
      setAttribute: vi.fn(),
      parentNode: null as null | { removeChild: () => void },
      click() {
        this.onchange?.();
      },
    };
    const removeChild = vi.fn();
    const appendChild = vi.fn().mockImplementation(() => {
      fakeInput.parentNode = { removeChild };
    });
    globalThis.document = {
      createElement: vi.fn().mockReturnValue(fakeInput),
      body: { appendChild },
    } as unknown as Document;

    const baselineSnapshot = ref<unknown>(null);
    const candidateSnapshot = ref<unknown>(null);
    const tasks = ref<TaskInfo[]>([]);
    const compareOptions = {
      selectedFiles: ref([]),
      parseState: ref("idle"),
      parseProgress: ref(0),
      statusMessage: ref(""),
      tasks,
      rawLines: ref([]),
      auxLogs: ref([]),
      detectedProject: ref("maaend"),
      selectedProcessId: ref(""),
      selectedThreadId: ref(""),
      nodeStatistics: computed(() => []),
      nodeSummary: computed(() => null),
      handleParse: async () => {
        tasks.value = [createTask()];
      },
      resetParseState: vi.fn(),
      setBaselineSnapshot: (snapshot: unknown) => {
        baselineSnapshot.value = snapshot;
      },
      setCandidateSnapshot: (snapshot: unknown) => {
        candidateSnapshot.value = snapshot;
      },
    };
    const composable = useCompareSlots(
      compareOptions as unknown as Parameters<typeof useCompareSlots>[0]
    );

    await composable.handleSelectBaselineDir();

    expect(expandSelectedFilesMock).toHaveBeenCalled();
    expect(baselineSnapshot.value).toBeTruthy();
    expect(candidateSnapshot.value).toBeNull();
    globalThis.document = originalDocument;
  });
});
