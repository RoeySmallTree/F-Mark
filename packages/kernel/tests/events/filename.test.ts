import { describe, it, expect } from "vitest";
import {
  composeFilename,
  parseFilename,
  isoTimestamp,
  toIsoTimestamp,
} from "@f-mark/shared";

describe("filename", () => {
  it("composeFilename + parseFilename round trip", () => {
    const name = composeFilename({
      timestamp: "20260522T143012Z",
      participant_id: "us-a7f3",
      kind: "prose",
      ext: "md",
    });
    expect(name).toBe("20260522T143012Z_us-a7f3.prose.md");
    const parsed = parseFilename(name);
    expect(parsed).toEqual({
      timestamp: "20260522T143012Z",
      participant_id: "us-a7f3",
      kind: "prose",
      ext: "md",
    });
  });

  it("parseFilename returns null on garbage", () => {
    expect(parseFilename("foo.txt")).toBeNull();
    expect(parseFilename("20260522T143012Z_us-a7f3.prose")).toBeNull();
    expect(parseFilename("not_an_id.prose.md")).toBeNull();
  });

  it("isoTimestamp produces a millisecond-precision Z-suffixed string", () => {
    const ts = isoTimestamp();
    expect(ts).toMatch(/^\d{8}T\d{6}\.\d{3}Z$/);
  });

  it("toIsoTimestamp converts a Date", () => {
    const d = new Date("2026-05-22T14:30:12.456Z");
    expect(toIsoTimestamp(d)).toBe("20260522T143012.456Z");
  });

  it("parseFilename accepts legacy second-precision timestamps", () => {
    const parsed = parseFilename("20260522T143012Z_us-a7f3.prose.md");
    expect(parsed?.timestamp).toBe("20260522T143012Z");
  });

  it("parseFilename accepts millisecond-precision timestamps", () => {
    const parsed = parseFilename("20260522T143012.789Z_us-a7f3.prose.md");
    expect(parsed?.timestamp).toBe("20260522T143012.789Z");
  });

  it("composeFilename for html bundle uses no ext", () => {
    const name = composeFilename({
      timestamp: "20260522T143012Z",
      participant_id: "ag-c92e",
      kind: "html",
    });
    expect(name).toBe("20260522T143012Z_ag-c92e.html");
  });

  it("composeFilename produces a tool-use filename", () => {
    const name = composeFilename({
      timestamp: "20260523T100000Z",
      participant_id: "ag-claude",
      kind: "tool-use",
      ext: "json",
    });
    expect(name).toBe("20260523T100000Z_ag-claude.tool-use.json");
  });

  it("composeFilename + parseFilename round trip for tool-use", () => {
    const name = composeFilename({
      timestamp: "20260523T100000Z",
      participant_id: "ag-claude",
      kind: "tool-use",
      ext: "json",
    });
    const parsed = parseFilename(name);
    expect(parsed).toEqual({
      timestamp: "20260523T100000Z",
      participant_id: "ag-claude",
      kind: "tool-use",
      ext: "json",
    });
  });
});
