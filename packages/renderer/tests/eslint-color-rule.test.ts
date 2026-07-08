import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import { noRawStyleColors } from "../eslint-rules/no-raw-style-colors.js";

function lint(source: string): ReturnType<Linter["verify"]> {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(source, {
    languageOptions: {
      ecmaVersion: "latest",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      sourceType: "module",
    },
    plugins: {
      "fmark-theme": {
        rules: {
          "no-raw-style-colors": noRawStyleColors,
        },
      },
    },
    rules: {
      "fmark-theme/no-raw-style-colors": "error",
    },
  });
}

describe("fmark-theme/no-raw-style-colors", () => {
  it("rejects raw color literals in inline style objects", () => {
    const messages = lint(`
      export function Bad() {
        return <div style={{ color: "black", background: "#111", border: "1px solid rgba(0, 0, 0, 0.2)" }} />;
      }
    `);

    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.message)).toEqual([
      'Use a theme token for color instead of raw color "black".',
      'Use a theme token for background instead of raw color "#111".',
      'Use a theme token for border instead of raw color "1px solid rgba(0, 0, 0, 0.2)".',
    ]);
  });

  it("allows theme tokens, dynamic swatches, and explicit exceptions", () => {
    const messages = lint(`
      export function Good({ color }) {
        const tokenStyle = {
          color: "var(--ink)",
          background: "color-mix(in oklch, var(--panel) 80%, transparent)",
          border: "1px solid var(--line)",
        };
        const previewStyle = {
          // fmark-allow-color-literal: external provider swatch
          background: "#123456",
        };

        return (
          <>
            <span style={tokenStyle}>Tokenized</span>
            <span style={{ color }}>Dynamic</span>
            <span style={previewStyle}>Preview</span>
          </>
        );
      }
    `);

    expect(messages).toEqual([]);
  });
});
