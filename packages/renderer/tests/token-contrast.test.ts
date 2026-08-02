import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/* Every contrast ratio recorded in tokens.css must match its measured value.
   The first revision of that file carried hand-estimated numbers; nine of
   fourteen were wrong and one hid a real WCAG AA failure (--ink-3 documented
   at 4.6:1 was actually 3.81:1 and was in use on body text). A comment nobody
   verifies is worse than no comment, so the comments are now a test. */

const TOKENS = readFileSync(
  path.join(__dirname, "../src/themes/tokens.css"),
  "utf8",
);

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

interface Claim {
  theme: string;
  token: string;
  hex: string;
  canvas: string;
  claimed: number;
}

/* Each theme block resolves claims against its OWN --canvas. */
function readClaims(): Claim[] {
  const bounds: Array<[string, number, number]> = [
    ["day", TOKENS.indexOf(":root"), TOKENS.indexOf("body.theme-night")],
    [
      "night",
      TOKENS.indexOf("body.theme-night"),
      TOKENS.indexOf("body.theme-contrast"),
    ],
    ["contrast", TOKENS.indexOf("body.theme-contrast"), TOKENS.length],
  ];
  const claims: Claim[] = [];
  for (const [theme, start, end] of bounds) {
    const block = TOKENS.slice(start, end);
    const canvas = block.match(/--canvas:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(canvas, `${theme} defines --canvas`).toBeDefined();
    for (const m of block.matchAll(
      /--([a-z0-9-]+):\s*(#[0-9a-f]{6});\s*\/\*\s*([0-9.]+):1/gi,
    )) {
      claims.push({
        theme,
        token: `--${m[1]}`,
        hex: m[2]!,
        canvas: canvas!,
        claimed: parseFloat(m[3]!),
      });
    }
  }
  return claims;
}

describe("tokens.css contrast claims", () => {
  const claims = readClaims();

  test("the file actually records ratios to check", () => {
    expect(claims.length).toBeGreaterThanOrEqual(12);
  });

  test.each(claims)(
    "$theme $token records its true ratio",
    ({ hex, canvas, claimed }) => {
      expect(contrast(hex, canvas)).toBeCloseTo(claimed, 1);
    },
  );

  /* --ink-4 is knowingly below AA and documented as such in tokens.css; it is
     excluded here rather than silently passing. Every other ink tier is text. */
  const textTiers = claims.filter(
    (c) => /^--ink(-[23])?$/.test(c.token) || c.token === "--ledger" || c.token === "--alarm",
  );

  test.each(textTiers)(
    "$theme $token clears WCAG AA for normal text",
    ({ hex, canvas }) => {
      expect(contrast(hex, canvas)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

/* Aurora surfaces. A token must pass AA against EVERY surface its theme puts
   text on — not just the darkest one. The light theme in particular has three
   (canvas, panel, panel-2) and an accent that passes on one can fail on
   another. */
const SURFACES_BY_THEME: Record<string, string[]> = {
  root: ["--canvas", "--panel", "--panel-2"],
  night: ["--canvas", "--panel", "--panel-2"],
  contrast: ["--canvas", "--panel"],
};

/* Tokens that carry TEXT and must therefore meet AA (4.5:1).
   --ink-4 is deliberately excluded: it is documented debt (2.57:1, ~214 text
   call sites) and splitting its text/border roles is a separate task. */
const TEXT_TOKENS = ["--ink", "--ink-2", "--ink-3", "--ledger", "--alarm", "--agent"];

function themeBlock(css: string, theme: string): string {
  /* Real selectors in tokens.css are `:root {`, `body.theme-night {`, and
     `body.theme-contrast {` — not the bare `body.night {` / `body.contrast {`
     the brief assumed. Adapted to match what the file actually contains. */
  const marker = theme === "root" ? ":root {" : `body.theme-${theme} {`;
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`theme block not found: ${theme}`);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

function tokenValue(block: string, name: string): string | null {
  const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  return m?.[1] ?? null;
}

describe("every text token meets AA on every surface of its theme", () => {
  for (const [theme, surfaces] of Object.entries(SURFACES_BY_THEME)) {
    const block = themeBlock(TOKENS, theme);
    for (const token of TEXT_TOKENS) {
      const fg = tokenValue(block, token);
      if (fg === null) continue; /* theme may not redefine every token */
      for (const surfaceName of surfaces) {
        const bg = tokenValue(block, surfaceName);
        if (bg === null) continue;
        test(`${theme} ${token} on ${surfaceName}`, () => {
          expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
