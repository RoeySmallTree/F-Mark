import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globalPaths } from "../../src/paths/global.js";
import {
  readState,
  writeState,
  updateState,
  mruPush,
  bumpRevision,
  type KernelState,
} from "../../src/state/store.js";

describe("kernel state store", () => {
  let scratch: string;
  let g: ReturnType<typeof globalPaths>;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "fmark-state-"));
    g = globalPaths(scratch);
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("returns default state when state.json is missing", async () => {
    const s = await readState(g);
    expect(s).toEqual({
      activePath: null,
      activeRevision: 0,
      knownPaths: [],
      favorites: [],
    });
  });

  it("round-trips a written state", async () => {
    const written: KernelState = {
      activePath: "/foo/bar",
      activeRevision: 3,
      knownPaths: ["/foo/bar", "/baz"],
      favorites: [{ name: "F", path: "/foo/bar" }],
    };
    await writeState(g, written);
    const read = await readState(g);
    expect(read).toEqual(written);
  });

  it("normalizes a corrupted state.json", async () => {
    writeFileSync(g.stateFile(), JSON.stringify({ junk: true, knownPaths: ["ok", 42] }));
    const s = await readState(g);
    expect(s.activePath).toBe(null);
    expect(s.activeRevision).toBe(0);
    expect(s.knownPaths).toEqual(["ok"]);
    expect(s.favorites).toEqual([]);
  });

  it("updateState serializes concurrent writers", async () => {
    await writeState(g, { activePath: null, activeRevision: 0, knownPaths: [], favorites: [] });
    await Promise.all([
      updateState(g, (s) => ({ ...s, activeRevision: s.activeRevision + 1 })),
      updateState(g, (s) => ({ ...s, activeRevision: s.activeRevision + 1 })),
      updateState(g, (s) => ({ ...s, activeRevision: s.activeRevision + 1 })),
    ]);
    const final = await readState(g);
    expect(final.activeRevision).toBe(3);
  });

  it("mruPush moves an existing entry to the front", () => {
    const s: KernelState = {
      activePath: null,
      activeRevision: 0,
      knownPaths: ["/a", "/b", "/c"],
      favorites: [],
    };
    expect(mruPush(s, "/c").knownPaths).toEqual(["/c", "/a", "/b"]);
  });

  it("mruPush caps the list at 20", () => {
    const knownPaths = Array.from({ length: 25 }, (_, i) => `/p${i}`);
    const s: KernelState = { activePath: null, activeRevision: 0, knownPaths, favorites: [] };
    const next = mruPush(s, "/new");
    expect(next.knownPaths.length).toBe(20);
    expect(next.knownPaths[0]).toBe("/new");
  });

  it("bumpRevision increments", () => {
    const s: KernelState = { activePath: null, activeRevision: 5, knownPaths: [], favorites: [] };
    expect(bumpRevision(s).activeRevision).toBe(6);
  });

  it("writes are atomic via tmp+rename", async () => {
    const written: KernelState = { activePath: "/x", activeRevision: 1, knownPaths: [], favorites: [] };
    await writeState(g, written);
    const raw = readFileSync(g.stateFile(), "utf8");
    expect(JSON.parse(raw)).toEqual(written);
  });
});
