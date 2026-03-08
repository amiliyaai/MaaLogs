import { describe, expect, it, vi } from "vitest";
import { getFilesFromDragEvent } from "@/utils/file";

function createFile(name: string, content = "x") {
  return new File([content], name, { type: "text/plain" });
}

function createFileEntry(file: File) {
  return {
    isFile: true,
    isDirectory: false,
    file(cb: (f: File) => void) {
      cb(file);
    },
  };
}

function createDirectoryEntry(entries: unknown[]) {
  let read = false;
  return {
    isFile: false,
    isDirectory: true,
    createReader() {
      return {
        readEntries(cb: (batch: unknown[]) => void) {
          if (read) {
            cb([]);
          } else {
            read = true;
            cb(entries);
          }
        },
      };
    },
  };
}

describe("getFilesFromDragEvent", () => {
  it("collects files from directory items via webkitGetAsEntry", async () => {
    const f1 = createFile("maa.log");
    const f2 = createFile("go-service.log");
    const dir = createDirectoryEntry([createFileEntry(f1), createFileEntry(f2)]);
    const item = {
      kind: "file",
      webkitGetAsEntry: vi.fn().mockReturnValue(dir),
    };
    const evt = {
      dataTransfer: {
        files: [],
        items: [item],
      },
    } as unknown as DragEvent;

    const files = await getFilesFromDragEvent(evt);
    expect(files.map((f) => f.name).sort()).toEqual(["go-service.log", "maa.log"]);
  });
});
