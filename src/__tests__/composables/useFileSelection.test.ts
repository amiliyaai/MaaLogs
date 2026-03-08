import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileSelection } from "@/composables/useFileSelection";

const getPlatformMock = vi.fn();
const expandSelectedFilesMock = vi.fn();
const applySelectedPathsMock = vi.fn();

vi.mock("@/platform", () => ({
  getPlatform: (...args: unknown[]) => getPlatformMock(...args),
}));

vi.mock("@/utils/file", () => ({
  applySelectedFiles: (newFiles: File[], existingFiles: File[]) => {
    const files = [...existingFiles, ...newFiles];
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    return { files, totalSize };
  },
  expandSelectedFiles: (...args: unknown[]) => expandSelectedFilesMock(...args),
  applySelectedPaths: (...args: unknown[]) => applySelectedPathsMock(...args),
  isFileDrag: () => true,
}));

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("useFileSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses tauri directory picker result when available", async () => {
    const pickedPath = "C:/logs";
    getPlatformMock.mockResolvedValue({
      picker: { selectDirectory: vi.fn().mockResolvedValue(pickedPath) },
    });
    applySelectedPathsMock.mockResolvedValue({
      files: [new File(["tauri"], "maa.log", { type: "text/plain" })],
      errors: [],
      hasDirectory: true,
      baseDir: pickedPath,
    });

    const selector = useFileSelection();
    await selector.handleSelectDirectory();

    expect(applySelectedPathsMock).toHaveBeenCalledWith([pickedPath]);
    expect(selector.selectedFiles.value).toHaveLength(1);
    expect(selector.baseDir.value).toBe(pickedPath);
  });

  it("falls back to browser directory input when platform picker returns null", async () => {
    getPlatformMock.mockResolvedValue({
      picker: { selectDirectory: vi.fn().mockResolvedValue(null) },
    });

    const browserFile = new File(["browser"], "maa.log", { type: "text/plain" });
    expandSelectedFilesMock.mockResolvedValue([browserFile]);

    const originalDocument = globalThis.document;
    const removeChild = vi.fn();
    const appendChild = vi.fn();
    const fakeInput = {
      type: "",
      multiple: false,
      files: [browserFile],
      style: { display: "" },
      onchange: null as null | (() => void),
      oncancel: null as null | (() => void),
      setAttribute: vi.fn(),
      parentNode: null as null | { removeChild: typeof removeChild },
      click() {
        this.onchange?.();
      },
    };
    appendChild.mockImplementation(() => {
      fakeInput.parentNode = { removeChild };
    });
    globalThis.document = {
      createElement: vi.fn().mockReturnValue(fakeInput),
      body: { appendChild },
    } as unknown as Document;

    const selector = useFileSelection();
    await selector.handleSelectDirectory();

    expect(expandSelectedFilesMock).toHaveBeenCalled();
    expect(selector.selectedFiles.value).toHaveLength(1);
    expect(removeChild).toHaveBeenCalled();
    globalThis.document = originalDocument;
  });
});
