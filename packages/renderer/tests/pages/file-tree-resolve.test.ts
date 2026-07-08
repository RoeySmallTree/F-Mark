import { describe, expect, it } from "vitest";
import type { SessionMeta } from "@f-mark/shared";
import { resolveSession } from "../../src/pages/FileTreePage.js";

/* review-phase2-round2 Should-fix 6: path_id is only a 12-char hash prefix, so
   even a supplied path_id can match more than one root. The standalone
   /file-tree resolver must reject that as ambiguous instead of silently
   picking the first match (cross-root authorization boundary). */

function session(
  id: string,
  pathId: string | undefined,
  path: string | undefined,
): SessionMeta {
  return {
    id,
    slug: `slug-${id}`,
    created_at: "2026-01-01T00:00:00.000Z",
    ...(path !== undefined ? { path } : {}),
    ...(pathId !== undefined ? { path_id: pathId } : {}),
  };
}

describe("resolveSession (standalone /file-tree)", () => {
  it("resolves a unique (path_id, sessionId)", () => {
    const all = [
      session("s1", "aaaaaaaaaaaa", "/root/a"),
      session("s1", "bbbbbbbbbbbb", "/root/b"),
    ];
    const r = resolveSession(all, "s1", "aaaaaaaaaaaa");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.path).toBe("/root/a");
  });

  it("rejects a supplied path_id that collides across roots", () => {
    /* Two distinct roots sharing the same 12-char path_id prefix AND the same
       session id — must NOT pick the first; must require disambiguation. */
    const all = [
      session("s1", "cccccccccccc", "/root/c"),
      session("s1", "cccccccccccc", "/root/d"),
    ];
    const r = resolveSession(all, "s1", "cccccccccccc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ambiguous path/i);
  });

  it("rejects an ambiguous session id when no path_id is supplied", () => {
    const all = [
      session("s1", "aaaaaaaaaaaa", "/root/a"),
      session("s1", "bbbbbbbbbbbb", "/root/b"),
    ];
    const r = resolveSession(all, "s1", null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ambiguous session/i);
  });

  it("reports not-found when the session id is unknown", () => {
    const r = resolveSession([session("s1", "aaaaaaaaaaaa", "/root/a")], "sX", null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/session not found/i);
  });

  it("reports not-found when the path_id does not match the session", () => {
    const r = resolveSession(
      [session("s1", "aaaaaaaaaaaa", "/root/a")],
      "s1",
      "zzzzzzzzzzzz",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not found under path/i);
  });

  it("resolves a single session id without a path_id", () => {
    const r = resolveSession(
      [session("s1", "aaaaaaaaaaaa", "/root/a")],
      "s1",
      null,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.id).toBe("s1");
  });
});
