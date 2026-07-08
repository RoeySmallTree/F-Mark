import { describe, it, expect, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { withTempProject } from "../helpers/tempdir.js";
import {
  setReportedTheme,
  setReportedFont,
  resetReportedTheme,
  resolveActiveTheme,
  resolveActiveFont,
  buildActiveThemeDoc,
} from "../../src/services/theme.js";
import {
  THEME_BASE_TOKENS,
  THEME_OVERRIDES,
  THEME_NAMES,
  resolveThemeTokens,
} from "@f-mark/shared";

const here = dirname(fileURLToPath(import.meta.url));
const tokensCssPath = join(
  here,
  "..",
  "..",
  "..",
  "renderer",
  "src",
  "themes",
  "tokens.css",
);

/** Reset the in-memory report state before each test (process-global). */
beforeEach(() => {
  resetReportedTheme();
});

describe("theme service", () => {
  it("builds a design doc with palette, button and radius sections for the default theme", () => {
    const { theme, source, font, fontSource, markdown } = buildActiveThemeDoc();
    expect(theme).toBe("light");
    expect(source).toBe("default");
    expect(font).toBe("theme");
    expect(fontSource).toBe("default");

    /* Required sections. */
    expect(markdown).toContain("# F-Mark Theme: Light");
    expect(markdown).toContain("## Color palette");
    expect(markdown).toContain("## Typography");
    expect(markdown).toContain("## Border radii & borders");
    expect(markdown).toContain("## Primary button");
    expect(markdown).toContain("## Secondary button");
    expect(markdown).toContain("## Component recipes");
    expect(markdown).toContain("### Card");
    expect(markdown).toContain("### Input");
    expect(markdown).toContain("### Badge");
    expect(markdown).toContain("### Link");

    /* Resolved token values from tokens.css :root. */
    expect(markdown).toContain("`--agent`");
    expect(markdown).toContain("#b86a1f"); // --agent
    expect(markdown).toContain("#1a1714"); // --ink
    expect(markdown).toContain("#faf6ed"); // --canvas
    expect(markdown).toContain("6px"); // --radius
    /* There is NO --accent token; the accent is --agent. The doc may mention
       "--accent" in prose to say so, but must never emit it as a declaration. */
    expect(markdown).not.toContain("--accent:");
    expect(markdown).toContain("--agent");
  });

  it("override param documents a specific theme without touching the reported one", () => {
    const { theme, source, markdown } = buildActiveThemeDoc("ember");
    expect(theme).toBe("ember");
    expect(source).toBe("override");
    expect(markdown).toContain("# F-Mark Theme: Ember");
    expect(markdown).toContain("#ff5d72"); // ember --user
    expect(markdown).toContain("14px"); // ember --radius-lg
    /* The reported theme is untouched. */
    expect(resolveActiveTheme().name).toBe("light");
  });

  it("prefers the reported theme and font over the defaults", () => {
    setReportedTheme("terminal");
    setReportedFont("geist");
    const { theme, source, font, fontSource, markdown } = buildActiveThemeDoc();
    expect(theme).toBe("terminal");
    expect(source).toBe("reported");
    expect(font).toBe("geist");
    expect(fontSource).toBe("reported");
    expect(markdown).toContain("'Geist', system-ui, sans-serif");
  });

  it("ignores unknown reported names and rejects unknown overrides", () => {
    expect(setReportedTheme("not-a-theme")).toBe(false);
    expect(setReportedFont("not-a-font")).toBe(false);
    expect(resolveActiveTheme().name).toBe("light");
    expect(resolveActiveFont().name).toBe("theme");
    setReportedTheme("nord");
    setReportedFont("manrope");
    expect(() => resolveActiveTheme("bogus")).toThrow(/unknown theme/);
    expect(() => resolveActiveFont("bogus")).toThrow(/unknown font/);
  });
});

describe("theme registry ↔ tokens.css drift guard", () => {
  it("every token value matches the shipped tokens.css", async () => {
    /* Strip /* … *\/ comments so inline annotations don't leak into the next
       declaration when splitting on ";". */
    const css = (await readFile(tokensCssPath, "utf8")).replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );

    /* Parse the :root block and each body.theme-<name> block into maps. */
    function parseBlock(selectorMarker: string): Record<string, string> {
      const start = css.indexOf(selectorMarker);
      expect(start).toBeGreaterThanOrEqual(0);
      const open = css.indexOf("{", start);
      const close = css.indexOf("}", open);
      const body = css.slice(open + 1, close);
      const out: Record<string, string> = {};
      for (const decl of body.split(";")) {
        const idx = decl.indexOf(":");
        if (idx < 0) continue;
        const key = decl.slice(0, idx).trim();
        const value = decl.slice(idx + 1).trim();
        if (key.startsWith("--") && value.length > 0) {
          out[key.slice(2)] = value;
        }
      }
      return out;
    }

    const rootMap = parseBlock(":root {");
    for (const [key, value] of Object.entries(THEME_BASE_TOKENS)) {
      expect(`${key}=${rootMap[key]}`).toBe(`${key}=${value}`);
    }

    const selectorByName: Record<string, string> = {
      terminal: "body.theme-terminal{",
      ide: "body.theme-ide{",
      solarized: "body.theme-solarized{",
      brutalist: "body.theme-brutalist{",
      cyber: "body.theme-cyber{",
      amber: "body.theme-amber{",
      dracula: "body.theme-dracula{",
      catppuccin: "body.theme-catppuccin{",
      tokyo: "body.theme-tokyo{",
      gruvbox: "body.theme-gruvbox{",
      nord: "body.theme-nord{",
      monokai: "body.theme-monokai{",
      borland: "body.theme-borland{",
      sepia: "body.theme-sepia{",
      contrast: "body.theme-contrast{",
      ember: "body.theme-ember{",
    };

    for (const name of THEME_NAMES) {
      if (name === "light") continue;
      const cssMap = parseBlock(selectorByName[name]!);
      const overrides = THEME_OVERRIDES[name];
      for (const [key, value] of Object.entries(overrides)) {
        expect(`${name}.${key}=${cssMap[key]}`).toBe(`${name}.${key}=${value}`);
      }
      /* The override set must be exactly the tokens the CSS block declares. */
      expect(Object.keys(overrides).sort()).toEqual(Object.keys(cssMap).sort());
    }
  });

  it("resolves a theme by merging base + overrides", () => {
    const ember = resolveThemeTokens("ember");
    expect(ember.user).toBe("#ff5d72"); // overridden
    expect(ember["radius-pill"]).toBe("999px"); // inherited from base
  });
});

describe("GET/PATCH /theme route", () => {
  it("GET /theme returns markdown design doc for the default theme", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({ method: "GET", url: "/theme" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/markdown/);
      expect(res.body).toContain("# F-Mark Theme: Light");
      expect(res.body).toContain("## Color palette");
      expect(res.body).toContain("## Primary button");
      expect(res.body).toContain("## Border radii & borders");
      await app.close();
    });
  });

  it("PATCH /theme records the applied theme and GET reflects it", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });

      const patch = await app.inject({
        method: "PATCH",
        url: "/theme",
        payload: { theme: "dracula" },
      });
      expect(patch.statusCode).toBe(200);
      expect(JSON.parse(patch.body)).toEqual({
        theme: "dracula",
        font: "theme",
      });

      const res = await app.inject({ method: "GET", url: "/theme" });
      expect(res.body).toContain("# F-Mark Theme: Dracula");
      expect(res.body).toContain("#ff79c6"); // dracula --agent
      await app.close();
    });
  });

  it("PATCH /theme rejects an unknown theme with 400", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "PATCH",
        url: "/theme",
        payload: { theme: "not-real" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/unknown theme/);
      await app.close();
    });
  });

  it("PATCH /theme records font and GET reflects it", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const patch = await app.inject({
        method: "PATCH",
        url: "/theme",
        payload: { theme: "dracula", font: "space-grotesk" },
      });
      expect(patch.statusCode).toBe(200);
      expect(JSON.parse(patch.body)).toEqual({
        theme: "dracula",
        font: "space-grotesk",
      });

      const res = await app.inject({ method: "GET", url: "/theme" });
      expect(res.body).toContain("Typography is **Space Grotesk**");
      expect(res.body).toContain("'Space Grotesk', system-ui, sans-serif");
      await app.close();
    });
  });

  it("PATCH /theme rejects an unknown font with 400", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const res = await app.inject({
        method: "PATCH",
        url: "/theme",
        payload: { theme: "dracula", font: "not-real" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/unknown font/);
      await app.close();
    });
  });

  it("GET /theme?theme=nord&font=lora overrides reported appearance; format=json returns metadata", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      await app.inject({
        method: "PATCH",
        url: "/theme",
        payload: { theme: "ember", font: "geist" },
      });
      const res = await app.inject({
        method: "GET",
        url: "/theme?theme=nord&font=lora&format=json",
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.theme).toBe("nord");
      expect(body.source).toBe("override");
      expect(body.font).toBe("lora");
      expect(body.font_source).toBe("override");
      expect(body.markdown).toContain("# F-Mark Theme: Nord");
      expect(body.markdown).toContain("Typography is **Lora**");
      await app.close();
    });
  });

  it("GET /theme rejects an unknown override with 400", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const { app } = createServer({ token: null, paths: p });
      const themeRes = await app.inject({
        method: "GET",
        url: "/theme?theme=not-real",
      });
      expect(themeRes.statusCode).toBe(400);
      expect(JSON.parse(themeRes.body).error).toMatch(/unknown theme/);

      const fontRes = await app.inject({
        method: "GET",
        url: "/theme?font=not-real",
      });
      expect(fontRes.statusCode).toBe(400);
      expect(JSON.parse(fontRes.body).error).toMatch(/unknown font/);
      await app.close();
    });
  });
});
