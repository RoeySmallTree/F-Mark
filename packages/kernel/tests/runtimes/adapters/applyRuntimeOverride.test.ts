import { describe, it, expect } from "vitest";
import { applyRuntimeOverride } from "../../../src/routes/managedAgents.js";

describe("applyRuntimeOverride", () => {
  it("returns args unchanged when override is undefined", () => {
    expect(applyRuntimeOverride("codex", ["-m", "gpt-5.5"], undefined)).toEqual([
      "-m",
      "gpt-5.5",
    ]);
  });

  it("returns args unchanged when override is empty", () => {
    expect(applyRuntimeOverride("codex", ["-m", "gpt-5.5"], {})).toEqual([
      "-m",
      "gpt-5.5",
    ]);
  });

  it("returns args unchanged for an unknown runtime (no adapter)", () => {
    expect(
      applyRuntimeOverride("custom", ["-m", "x"], { model: "y" }),
    ).toEqual(["-m", "x"]);
  });

  it("strips conflicting codex flags and appends override", () => {
    expect(
      applyRuntimeOverride(
        "codex",
        ["-m", "gpt-5.4", "-c", "model_reasoning_effort=low", "--keep"],
        { model: "gpt-5.5", effort: "high" },
      ),
    ).toEqual([
      "--keep",
      "-m",
      "gpt-5.5",
      "-c",
      "model_reasoning_effort=high",
    ]);
  });

  it("strips conflicting claude flags and appends override", () => {
    expect(
      applyRuntimeOverride(
        "claude",
        ["--model", "opus", "--effort", "low", "--keep"],
        { model: "sonnet", effort: "high" },
      ),
    ).toEqual(["--keep", "--model", "sonnet", "--effort", "high"]);
  });

  it("strips conflicting opencode flags and appends override", () => {
    expect(
      applyRuntimeOverride(
        "opencode",
        ["-m", "openai/gpt-5.4", "--variant", "low", "--keep"],
        { model: "openai/gpt-5.5", effort: "high" },
      ),
    ).toEqual([
      "--keep",
      "-m",
      "openai/gpt-5.5",
      "--variant",
      "high",
    ]);
  });

  it("applies only model when only model is set", () => {
    expect(
      applyRuntimeOverride("codex", ["--keep"], { model: "gpt-5.5" }),
    ).toEqual(["--keep", "-m", "gpt-5.5"]);
  });
});
