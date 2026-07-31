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
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
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
