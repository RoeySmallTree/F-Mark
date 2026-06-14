import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  KNOWN_RUNTIMES,
  RUNTIME_PROVIDER_ICONS,
  runtimeProviderIconKind,
  runtimeProviderVisual,
} from "../src/runtimes.js";

const rendererRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("runtime provider visuals", () => {
  it("resolves Claude, Codex/OpenAI, and Opencode to icon assets", () => {
    expect(runtimeProviderVisual("claude", "Claude Code")).toMatchObject({
      type: "icon",
      icon: { kind: "claude", src: "/agent-icons/claude-icon.png" },
    });
    expect(runtimeProviderVisual("codex", "Codex")).toMatchObject({
      type: "icon",
      icon: { kind: "openai", src: "/agent-icons/gpt-icon.png" },
    });
    expect(runtimeProviderVisual("openai", "OpenAI CLI")).toMatchObject({
      type: "icon",
      icon: { kind: "openai", src: "/agent-icons/gpt-icon.png" },
    });
    expect(runtimeProviderVisual("opencode", "Opencode")).toMatchObject({
      type: "icon",
      icon: { kind: "opencode", src: "/agent-icons/opencode-icon.svg" },
    });
  });

  it("falls back to initials for unknown or currently unsupported providers", () => {
    expect(runtimeProviderVisual("custom-agent", "Custom Agent")).toEqual({
      type: "initials",
      initials: "CA",
    });
    expect(runtimeProviderVisual("gemini", "Gemini")).toEqual({
      type: "initials",
      initials: "GE",
    });
  });

  it("does not re-add Gemini as a known offered runtime", () => {
    expect(KNOWN_RUNTIMES).not.toHaveProperty("gemini");
    expect(runtimeProviderIconKind("gemini", "Gemini")).toBeNull();
  });

  it("points known provider icons at existing public assets", () => {
    for (const icon of Object.values(RUNTIME_PROVIDER_ICONS)) {
      const assetPath = path.join(
        rendererRoot,
        "public",
        icon.src.replace(/^\//, ""),
      );
      expect(existsSync(assetPath), `${icon.kind} asset`).toBe(true);
    }
  });
});
