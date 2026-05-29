import { describe, it, expect } from "vitest";
import { sanitizeArgs } from "../../src/runtimes/argSanitizer.js";

describe("sanitizeArgs", () => {
  describe("codex", () => {
    it("strips -m and its value when patch.model is set", () => {
      const out = sanitizeArgs(["-m", "gpt-5.4", "--other", "x"], "codex", {
        model: "gpt-5.5",
      });
      expect(out).toEqual(["--other", "x"]);
    });

    it("strips --model and its value", () => {
      const out = sanitizeArgs(["--model", "gpt-5.4", "--keep"], "codex", {
        model: "gpt-5.5",
      });
      expect(out).toEqual(["--keep"]);
    });

    it("strips -m=foo single-arg form", () => {
      const out = sanitizeArgs(["-m=gpt-5.4", "--keep"], "codex", {
        model: "gpt-5.5",
      });
      expect(out).toEqual(["--keep"]);
    });

    it("strips --model=foo single-arg form", () => {
      const out = sanitizeArgs(["--model=gpt-5.4", "--keep"], "codex", {
        model: "gpt-5.5",
      });
      expect(out).toEqual(["--keep"]);
    });

    it("strips -c model=foo two-arg form when model patch is set", () => {
      const out = sanitizeArgs(["-c", "model=gpt-5.4", "--keep"], "codex", {
        model: "gpt-5.5",
      });
      expect(out).toEqual(["--keep"]);
    });

    it("keeps unrelated -c key=value pairs when only model is patched", () => {
      const out = sanitizeArgs(
        ["-c", "features.hooks=true", "--keep"],
        "codex",
        { model: "gpt-5.5" },
      );
      expect(out).toEqual(["-c", "features.hooks=true", "--keep"]);
    });

    it("strips -c model_reasoning_effort=foo when effort patch is set", () => {
      const out = sanitizeArgs(
        ["-c", "model_reasoning_effort=low", "--keep"],
        "codex",
        { effort: "high" },
      );
      expect(out).toEqual(["--keep"]);
    });

    it("strips both model and effort flags when both are patched", () => {
      const out = sanitizeArgs(
        ["-m", "gpt-5.4", "-c", "model_reasoning_effort=low", "--keep"],
        "codex",
        { model: "gpt-5.5", effort: "high" },
      );
      expect(out).toEqual(["--keep"]);
    });
  });

  describe("claude", () => {
    it("strips --model and its value when patch.model is set", () => {
      const out = sanitizeArgs(["--model", "opus", "--keep"], "claude", {
        model: "sonnet",
      });
      expect(out).toEqual(["--keep"]);
    });

    it("strips -m as a model alias", () => {
      const out = sanitizeArgs(["-m", "opus", "--keep"], "claude", {
        model: "sonnet",
      });
      expect(out).toEqual(["--keep"]);
    });

    it("strips --effort and its value when patch.effort is set", () => {
      const out = sanitizeArgs(["--effort", "low", "--keep"], "claude", {
        effort: "high",
      });
      expect(out).toEqual(["--keep"]);
    });

    it("strips --effort=foo single-arg form", () => {
      const out = sanitizeArgs(["--effort=low", "--keep"], "claude", {
        effort: "high",
      });
      expect(out).toEqual(["--keep"]);
    });

    it("does NOT strip -c key=value (claude has no -c override flag)", () => {
      const out = sanitizeArgs(
        ["-c", "model=foo", "--keep"],
        "claude",
        { model: "sonnet" },
      );
      expect(out).toEqual(["-c", "model=foo", "--keep"]);
    });
  });

  describe("opencode", () => {
    it("strips -m and value when patch.model is set", () => {
      const out = sanitizeArgs(
        ["-m", "openai/gpt-5.4", "--keep"],
        "opencode",
        { model: "openai/gpt-5.5" },
      );
      expect(out).toEqual(["--keep"]);
    });

    it("strips --variant and its value when patch.effort is set", () => {
      const out = sanitizeArgs(
        ["--variant", "high", "--keep"],
        "opencode",
        { effort: "max" },
      );
      expect(out).toEqual(["--keep"]);
    });

    it("strips --variant=foo single-arg form", () => {
      const out = sanitizeArgs(
        ["--variant=high", "--keep"],
        "opencode",
        { effort: "max" },
      );
      expect(out).toEqual(["--keep"]);
    });
  });

  describe("no-op cases", () => {
    it("returns args unchanged when patch is empty", () => {
      const args = ["-m", "gpt-5.4", "--effort", "low"];
      expect(sanitizeArgs(args, "codex", {})).toEqual(args);
    });

    it("returns args unchanged when patch keys don't match any existing flags", () => {
      const out = sanitizeArgs(["--something-else", "x"], "claude", {
        model: "sonnet",
      });
      expect(out).toEqual(["--something-else", "x"]);
    });

    it("does not mutate the input array", () => {
      const args = ["-m", "gpt-5.4", "--keep"];
      const copy = [...args];
      sanitizeArgs(args, "codex", { model: "gpt-5.5" });
      expect(args).toEqual(copy);
    });
  });
});
