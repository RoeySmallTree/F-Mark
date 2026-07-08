import { describe, expect, it } from "vitest";
import { pickRenderer } from "../../src/panels/fileViewer/renderers/pickRenderer.js";

describe("pickRenderer", () => {
  it("routes every browser-previewable media family to an inline renderer", () => {
    expect(pickRenderer("pdf")).toBe("pdf");
    expect(pickRenderer("mp4")).toBe("video");
    expect(pickRenderer("mp3")).toBe("audio");
    expect(pickRenderer("svg")).toBe("image");
  });

  it("routes active source files to Monaco instead of binary download fallback", () => {
    expect(pickRenderer("html")).toBe("monaco");
    expect(pickRenderer("tsx")).toBe("monaco");
  });
});
