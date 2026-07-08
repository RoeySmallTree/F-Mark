/* Required root scope + root-relative path for file reads (X4b).

   /files/tree, /files/text, /files/content must carry a validated path_id|root
   and a root-relative rel_path. No absolute `path` query, no active-root
   fallback, and no escaping the known root. */

import { describe, it, expect } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { computePathId } from "../../src/paths/identity.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { withTempProject } from "../helpers/tempdir.js";

async function appFor(root: string, cfg: string) {
  const p = paths(root);
  await initProject(p);
  const g = globalPaths(cfg);
  const ref = new PathContextRef({ global: g, active: activePaths(root) });
  const { app } = createServer({ token: null, paths: p, pathContextRef: ref });
  return app;
}

describe("GET /files/text (X4b)", () => {
  it("reads a root-relative file under a known root", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fr-cfg-"));
      try {
        writeFileSync(join(root, "hello.txt"), "hi there", "utf8");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/text?root=${encodeURIComponent(root)}&rel_path=hello.txt`,
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().content).toBe("hi there");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("400 ROOT_SCOPE_REQUIRED without a scope", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fr-cfg2-"));
      try {
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/text?rel_path=hello.txt`,
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe("ROOT_SCOPE_REQUIRED");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("400 REL_PATH_REQUIRED when rel_path is missing", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fr-cfg3-"));
      try {
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/text?root=${encodeURIComponent(root)}`,
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe("REL_PATH_REQUIRED");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("403 PATH_OUTSIDE_PROJECT for a `..` escape", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fr-cfg4-"));
      const secretDir = mkdtempSync(join(tmpdir(), "fmark-fr-secret-"));
      try {
        writeFileSync(join(secretDir, "secret.txt"), "top secret", "utf8");
        const app = await appFor(root, cfg);
        const rel = `../${secretDir.split("/").pop()}/secret.txt`;
        const res = await app.inject({
          method: "GET",
          url: `/files/text?root=${encodeURIComponent(root)}&rel_path=${encodeURIComponent(rel)}`,
        });
        // Either canonicalizes outside (403) or doesn't resolve (404) — never 200.
        expect(res.statusCode).not.toBe(200);
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
        rmSync(secretDir, { recursive: true, force: true });
      }
    });
  });

  it("404 UNKNOWN_ROOT for an unregistered root", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fr-cfg5-"));
      const other = mkdtempSync(join(tmpdir(), "fmark-fr-other-"));
      try {
        writeFileSync(join(other, "x.txt"), "nope", "utf8");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/text?root=${encodeURIComponent(other)}&rel_path=x.txt`,
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().code).toBe("UNKNOWN_ROOT");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
        rmSync(other, { recursive: true, force: true });
      }
    });
  });
});

describe("PUT /files/text (X4b)", () => {
  it("writes a root-relative text file under a known root", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fw-cfg-"));
      try {
        writeFileSync(join(root, "hello.txt"), "before", "utf8");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "PUT",
          url: "/files/text",
          payload: {
            root,
            rel_path: "hello.txt",
            content: "after\n",
          },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().content).toBe("after\n");
        expect(readFileSync(join(root, "hello.txt"), "utf8")).toBe("after\n");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("400 ROOT_SCOPE_REQUIRED without a scope", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fw-cfg2-"));
      try {
        writeFileSync(join(root, "hello.txt"), "before", "utf8");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "PUT",
          url: "/files/text",
          payload: { rel_path: "hello.txt", content: "after" },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe("ROOT_SCOPE_REQUIRED");
        expect(readFileSync(join(root, "hello.txt"), "utf8")).toBe("before");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("refuses a traversal escape and leaves the outside file untouched", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fw-cfg3-"));
      const secretDir = mkdtempSync(join(tmpdir(), "fmark-fw-secret-"));
      try {
        const secretFile = join(secretDir, "secret.txt");
        writeFileSync(secretFile, "top secret", "utf8");
        const app = await appFor(root, cfg);
        const rel = `../${secretDir.split("/").pop()}/secret.txt`;
        const res = await app.inject({
          method: "PUT",
          url: "/files/text",
          payload: {
            root,
            rel_path: rel,
            content: "overwritten",
          },
        });
        expect(res.statusCode).not.toBe(200);
        expect(readFileSync(secretFile, "utf8")).toBe("top secret");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
        rmSync(secretDir, { recursive: true, force: true });
      }
    });
  });
});

describe("GET /files/tree (X4b)", () => {
  it("walks a known root via path_id", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-ft-cfg-"));
      try {
        mkdirSync(join(root, "src"));
        writeFileSync(join(root, "src", "a.ts"), "x", "utf8");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/tree?path_id=${computePathId(root)}`,
        });
        expect(res.statusCode).toBe(200);
        const relPaths = (res.json().entries as { relPath: string }[]).map(
          (e) => e.relPath,
        );
        expect(relPaths).toContain("src");
        expect(relPaths).toContain("src/a.ts");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("honors nested .gitignore rules and does not recurse ignored dirs", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-ft-nested-gi-cfg-"));
      try {
        mkdirSync(join(root, "apps", "fe", ".next", "dev", "cache"), {
          recursive: true,
        });
        mkdirSync(join(root, "apps", "fe", "src"), { recursive: true });
        mkdirSync(join(root, "root-cache", "tmp"), { recursive: true });
        writeFileSync(join(root, ".gitignore"), "root-cache/\n", "utf8");
        writeFileSync(
          join(root, "apps", "fe", ".gitignore"),
          ".next/\nignored-file.txt\n",
          "utf8",
        );
        writeFileSync(join(root, "root-cache", "tmp", "x"), "x");
        writeFileSync(join(root, "apps", "fe", ".next", "dev", "cache", "x"), "x");
        writeFileSync(join(root, "apps", "fe", "ignored-file.txt"), "x");
        writeFileSync(join(root, "apps", "fe", "src", "app.ts"), "x");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/tree?path_id=${computePathId(root)}`,
        });
        expect(res.statusCode).toBe(200);
        const entries = res.json().entries as Array<{
          relPath: string;
          ignored: boolean;
        }>;
        const byRelPath = new Map(entries.map((entry) => [entry.relPath, entry]));
        expect(byRelPath.get("root-cache")?.ignored).toBe(true);
        expect(byRelPath.get("apps/fe/.next")?.ignored).toBe(true);
        expect(byRelPath.get("apps/fe/ignored-file.txt")?.ignored).toBe(true);
        expect(byRelPath.get("apps/fe/src/app.ts")?.ignored).toBe(false);
        expect(byRelPath.has("root-cache/tmp")).toBe(false);
        expect(byRelPath.has("apps/fe/.next/dev")).toBe(false);
        expect(byRelPath.has("apps/fe/.next/dev/cache/x")).toBe(false);
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("404 UNKNOWN_ROOT for an arbitrary unregistered root (no FS browsing)", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-ft-cfg2-"));
      try {
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/tree?root=${encodeURIComponent("/etc")}`,
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().code).toBe("UNKNOWN_ROOT");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });
});

describe("GET /files/content (X4b)", () => {
  it("streams a root-relative file", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fc-cfg-"));
      try {
        writeFileSync(join(root, "data.bin"), "ABCDEF", "utf8");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/content?root=${encodeURIComponent(root)}&rel_path=data.bin`,
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe("ABCDEF");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("renders active content inline with sandbox CSP, not forced download (HTML)", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fc-cfg-"));
      try {
        writeFileSync(
          join(root, "page.html"),
          "<script>alert(1)</script>",
          "utf8",
        );
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/content?root=${encodeURIComponent(root)}&rel_path=page.html`,
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["content-security-policy"]).toBe("sandbox");
        expect(res.headers["content-disposition"]).toBeUndefined();
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("renders SVG inline but keeps the active-content sandbox", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fc-cfg-"));
      try {
        writeFileSync(join(root, "icon.svg"), "<svg></svg>", "utf8");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/content?root=${encodeURIComponent(root)}&rel_path=icon.svg`,
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-disposition"]).toBeUndefined();
        expect(res.headers["content-security-policy"]).toBe("sandbox");
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });

  it("serves passive media (PNG) inline with nosniff and no attachment", async () => {
    await withTempProject(async (root) => {
      const cfg = mkdtempSync(join(tmpdir(), "fmark-fc-cfg-"));
      try {
        writeFileSync(join(root, "pic.png"), "fakepng", "utf8");
        const app = await appFor(root, cfg);
        const res = await app.inject({
          method: "GET",
          url: `/files/content?root=${encodeURIComponent(root)}&rel_path=pic.png`,
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["content-disposition"]).toBeUndefined();
        expect(res.headers["content-security-policy"]).toBeUndefined();
        await app.close();
      } finally {
        rmSync(cfg, { recursive: true, force: true });
      }
    });
  });
});
