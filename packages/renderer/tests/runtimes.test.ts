import { describe, expect, it } from "vitest";
import {
  KNOWN_RUNTIMES,
  RUNTIME_PROVIDER_ICONS,
  runtimeProviderIconKind,
  runtimeProviderVisual,
} from "../src/runtimes.js";

describe("runtime provider visuals", () => {
  it("resolves Claude, Codex/OpenAI, and Opencode to ascii icon kinds", () => {
    expect(runtimeProviderVisual("claude", "Claude Code")).toMatchObject({
      type: "icon",
      icon: { kind: "claude", label: "Claude icon" },
    });
    expect(runtimeProviderVisual("codex", "Codex")).toMatchObject({
      type: "icon",
      icon: { kind: "openai", label: "OpenAI icon" },
    });
    expect(runtimeProviderVisual("openai", "OpenAI CLI")).toMatchObject({
      type: "icon",
      icon: { kind: "openai", label: "OpenAI icon" },
    });
    expect(runtimeProviderVisual("opencode", "Opencode")).toMatchObject({
      type: "icon",
      icon: { kind: "opencode", label: "Opencode icon" },
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

  it("defines ascii-backed provider icon metadata for built-ins", () => {
    expect(Object.keys(RUNTIME_PROVIDER_ICONS)).toEqual([
      "claude",
      "openai",
      "opencode",
    ]);
  });
});
