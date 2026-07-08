import { describe, expect, it } from "vitest";
import type { FileRefPayload } from "@f-mark/shared";
import { previewKind } from "../../src/cards/fileCard/previewKind.js";

function file(overrides: Partial<FileRefPayload>): FileRefPayload {
  return {
    id: "f1",
    path: overrides.path ?? "attachments/att_abc/file.bin",
    mime_type: overrides.mime_type ?? "application/octet-stream",
    ...overrides,
  };
}

describe("file card previewKind", () => {
  it("classifies audio and video uploads as inline media previews", () => {
    expect(
      previewKind(file({ display_name: "clip.mp4", mime_type: "video/mp4" })),
    ).toBe("video");
    expect(
      previewKind(file({ display_name: "voice.mp3", mime_type: "audio/mpeg" })),
    ).toBe("audio");
  });

  it("uses extensions when uploaded MIME is generic", () => {
    expect(previewKind(file({ display_name: "diagram.svg" }))).toBe("image");
    expect(previewKind(file({ display_name: "script.ts" }))).toBe("text");
    expect(previewKind(file({ display_name: "movie.webm" }))).toBe("video");
  });
});
