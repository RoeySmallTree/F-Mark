import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const tempRoots: string[] = [];

function makeFixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "fmark-color-guard-"));
  tempRoots.push(root);
  mkdirSync(path.join(root, "src"), { recursive: true });
  return root;
}

function writeFixture(root: string, filePath: string, source: string): void {
  const fullPath = path.join(root, filePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, source);
}

function runGuard(root: string): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    ["scripts/check-component-color-literals.mjs", "--root", root],
    {
      cwd: packageRoot,
      encoding: "utf8",
    },
  );
}

describe("component color literal guard", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects obvious raw color strings in React style objects", () => {
    const root = makeFixtureRoot();
    writeFixture(
      root,
      "src/Bad.tsx",
      `
        export function Bad(): JSX.Element {
          return (
            <div
              style={{
                color: "black",
                background: "#111",
                border: "1px solid rgba(0, 0, 0, 0.2)",
              }}
            />
          );
        }
      `,
    );

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Found raw color literals");
    expect(result.stderr).toContain("src/Bad.tsx");
    expect(result.stderr).toContain("color");
    expect(result.stderr).toContain("background");
    expect(result.stderr).toContain("border");
  });

  it("allows theme tokens, data-driven colors, tests, and explicit exceptions", () => {
    const root = makeFixtureRoot();
    writeFixture(
      root,
      "src/Good.tsx",
      `
        type Participant = { color: string };

        export function Good({ participant }: { participant: Participant }): JSX.Element {
          const tokenStyle = {
            color: "var(--ink)",
            background: "color-mix(in srgb, var(--panel) 80%, transparent)",
            border: "1px solid var(--line)",
          };
          const previewStyle = {
            // fmark-allow-color-literal: external provider swatch preview
            color: "#123456",
          };

          return (
            <>
              <span style={tokenStyle}>Tokenized</span>
              <span style={{ color: participant.color }}>Data driven</span>
              <span style={previewStyle}>Explicit preview</span>
            </>
          );
        }
      `,
    );
    writeFixture(
      root,
      "src/Bad.test.tsx",
      `
        export function TestFixture(): JSX.Element {
          return <div style={{ color: "black" }} />;
        }
      `,
    );

    const result = runGuard(root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
