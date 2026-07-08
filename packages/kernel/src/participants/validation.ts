import { isValidAvatarPresetId } from "@f-mark/shared";

/** Hard cap on display-name length. Mirrors the JSON-schema constraint
 *  on /participants/register so direct kernel callers see the same
 *  rejection. Long enough for "GPT-4 Turbo (preview build)" but tight
 *  enough to prevent the 10K-char audit probe. */
const PARTICIPANT_NAME_MAX = 60;

/* Segment after the kind prefix allows up to 16 chars. The longest builtin
   runtime slug is "opencode" (8) -> spawned ids look like `ag-opencode-3a2f`
   (13 chars after `ag-`); the old {2,12} cap rejected exactly opencode. Keep
   in lockstep with the filename parsers (shared/filenames.ts,
   events/proseValidate.ts). */
const ID_PATTERN = /^(us|ag|sys|grp)-[a-z0-9-]{2,16}$/;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function validateAvatarPreset(value: string): string {
  const trimmed = value.trim();
  if (!isValidAvatarPresetId(trimmed)) {
    throw new Error(`invalid avatar preset: ${value}`);
  }
  return trimmed;
}

export function validateName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("name must be non-empty");
  }
  if (trimmed.length > PARTICIPANT_NAME_MAX) {
    throw new Error(
      `name too long (${trimmed.length} chars, max ${PARTICIPANT_NAME_MAX})`,
    );
  }
  return trimmed;
}

export function isValidParticipantId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function assertValidParticipantId(id: string): void {
  if (!isValidParticipantId(id)) {
    throw new Error(`invalid participant id format: ${id}`);
  }
}

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}
