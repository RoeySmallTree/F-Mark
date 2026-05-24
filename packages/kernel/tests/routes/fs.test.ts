import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerFsRoutes } from "../../src/routes/fs.js";

interface Harness {
  app: FastifyInstance;
  scratch: string;
}

async function makeHarness(): Promise<Harness> {
  const scratch = mkdtempSync(join(tmpdir(), "fmark-fs-route-"));
  const app = Fastify();
  registerFsRoutes(app);
  await app.ready();
  return { app, scratch };
}

async function tearDown(h: Harness): Promise<void> {
  await h.app.close();
  rmSync(h.scratch, { recursive: true, force: true });
}

describe("GET /fs/list", () => {
  let h: Harness;
  beforeEach(async () => { h = await makeHarness(); });
  afterEach(async () => { await tearDown(h); });

  it("lists directories alphabetically", async () => {
    mkdirSync(join(h.scratch, "beta"));
    mkdirSync(join(h.scratch, "alpha"));
    mkdirSync(join(h.scratch, "gamma"));
    const res = await h.app.inject({
      method: "GET",
      url: `/fs/list?path=${encodeURIComponent(h.scratch)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries.map((e: { name: string }) => e.name)).toEqual([
      "alpha", "beta", "gamma",
    ]);
    expect(body.entries.every((e: { isDir: boolean }) => e.isDir)).toBe(true);
    expect(body.parent).toBeTruthy();
    expect(body.truncated).toBe(false);
  });

  it("omits non-directory entries (regular files)", async () => {
    mkdirSync(join(h.scratch, "subdir"));
    // Place a regular file alongside; should not appear in listing.
    require("node:fs").writeFileSync(join(h.scratch, "file.txt"), "hi");
    const res = await h.app.inject({
      method: "GET",
      url: `/fs/list?path=${encodeURIComponent(h.scratch)}`,
    });
    expect(res.json().entries.map((e: { name: string }) => e.name)).toEqual(["subdir"]);
  });

  it("includes hidden directories (renderer decides whether to display)", async () => {
    mkdirSync(join(h.scratch, ".hidden"));
    mkdirSync(join(h.scratch, "visible"));
    const res = await h.app.inject({
      method: "GET",
      url: `/fs/list?path=${encodeURIComponent(h.scratch)}`,
    });
    expect(res.json().entries.map((e: { name: string }) => e.name)).toEqual([
      ".hidden", "visible",
    ]);
  });

  it("returns 400 when path is missing", async () => {
    const res = await h.app.inject({ method: "GET", url: "/fs/list" });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("PATH_REQUIRED");
  });

  it("rejects relative paths", async () => {
    const res = await h.app.inject({ method: "GET", url: "/fs/list?path=./relative" });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("PATH_NOT_ABSOLUTE");
  });

  it("returns 404 for non-existent paths", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: `/fs/list?path=${encodeURIComponent(join(h.scratch, "ghost"))}`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("PATH_NOT_FOUND");
  });

  it("denies /proc and similar pseudo-filesystems", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: `/fs/list?path=${encodeURIComponent("/proc")}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FS_DENIED");
  });

  it("canonicalizes symlinks via realpath", async () => {
    const real = join(h.scratch, "real");
    mkdirSync(real);
    mkdirSync(join(real, "inside"));
    const link = join(h.scratch, "link");
    symlinkSync(real, link);
    const res = await h.app.inject({
      method: "GET",
      url: `/fs/list?path=${encodeURIComponent(link)}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().path).toBe(real);
    expect(res.json().entries.map((e: { name: string }) => e.name)).toEqual(["inside"]);
  });

  it("returns null parent at filesystem root", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: `/fs/list?path=${encodeURIComponent("/")}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().parent).toBe(null);
  });
});

describe("GET /fs/home", () => {
  let h: Harness;
  beforeEach(async () => { h = await makeHarness(); });
  afterEach(async () => { await tearDown(h); });

  it("returns home + xdgConfigHome (null if unset)", async () => {
    const res = await h.app.inject({ method: "GET", url: "/fs/home" });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().home).toBe("string");
    expect(res.json().home.length).toBeGreaterThan(0);
  });
});
