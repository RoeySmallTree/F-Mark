import { validateAppendFilename } from "./appendTarget.js";
import { validateLineRange } from "./lineRange.js";
import type { ValidateInput, ValidateResult } from "./types.js";

export class ProseFrontmatterValidator {
  constructor(private readonly input: ValidateInput) {}

  validate(): ValidateResult {
    return (
      this.validateFilePathShape() ??
      this.validateFilePathExclusivity() ??
      this.validateAppendTarget() ??
      this.validateMode() ??
      this.validateLines() ??
      this.validateCommentPayload() ??
      this.validateTombstonePayload() ?? { ok: true }
    );
  }

  private get hasFilePath(): boolean {
    return (
      typeof this.input.file_path === "string" &&
      this.input.file_path.length > 0
    );
  }

  private validateFilePathShape(): ValidateResult | null {
    if (
      this.input.file_path !== undefined &&
      typeof this.input.file_path !== "string"
    ) {
      return { ok: false, error: "`file_path` must be a string" };
    }
    return null;
  }

  private validateFilePathExclusivity(): ValidateResult | null {
    if (
      this.hasFilePath &&
      (this.input.append_to !== undefined || this.input.mode !== undefined)
    ) {
      return {
        ok: false,
        error: "`file_path` is mutually exclusive with `append_to`/`mode`",
      };
    }
    return null;
  }

  private validateAppendTarget(): ValidateResult | null {
    if (this.input.append_to === undefined) return null;
    const result = validateAppendFilename(this.input.append_to, {
      empty: "`append_to` must be a non-empty filename",
      wrongType: "`append_to` must be a string filename",
    });
    return result.ok ? null : result;
  }

  private validateMode(): ValidateResult | null {
    if (
      this.input.mode !== undefined &&
      (this.input.append_to === undefined || this.input.append_to === "")
    ) {
      return { ok: false, error: "`mode` requires `append_to`" };
    }
    if (
      this.input.mode !== undefined &&
      this.input.mode !== "content" &&
      this.input.mode !== "comment"
    ) {
      return { ok: false, error: "`mode` must be 'content' or 'comment'" };
    }
    return null;
  }

  private validateLines(): ValidateResult | null {
    if (this.input.lines === undefined) return null;
    if (this.input.mode !== "comment" && !this.hasFilePath) {
      return {
        ok: false,
        error: '`lines` requires `mode: "comment"` or `file_path`',
      };
    }
    return validateLineRange(this.input.lines);
  }

  private validateCommentPayload(): ValidateResult | null {
    if (this.input.mode !== "comment") return null;
    if (typeof this.input.name === "string" && this.input.name.length > 0) {
      return { ok: false, error: "comments must not carry `name`" };
    }
    if (this.input.removed === true) {
      return { ok: false, error: "comments cannot be tombstones" };
    }
    return null;
  }

  private validateTombstonePayload(): ValidateResult | null {
    if (
      this.input.removed === true &&
      typeof this.input.content === "string" &&
      this.input.content.trim().length > 0
    ) {
      return { ok: false, error: "`removed: true` requires empty content" };
    }
    return null;
  }
}
