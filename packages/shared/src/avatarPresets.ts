import {
  AVATAR_SHAPE_CATALOG,
  type AvatarToneMap,
} from "./avatarPresetCatalog.js";

export type { AvatarTone, AvatarToneMap } from "./avatarPresetCatalog.js";

export interface AvatarPreset {
  id: string;
  label: string;
  lines: readonly string[];
  tones?: AvatarToneMap;
}

function normalizeArtLine(line: string): string {
  if (line.length >= 8) {
    return line.slice(0, 8);
  }
  const pad = 8 - line.length;
  const left = Math.floor(pad / 2);
  return `${" ".repeat(left)}${line}${" ".repeat(pad - left)}`;
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = AVATAR_SHAPE_CATALOG.map(
  (shape, index) => ({
    id: String(index + 1).padStart(2, "0"),
    label: shape.label,
    lines: shape.lines.map(normalizeArtLine),
    ...(shape.tones !== undefined ? { tones: shape.tones } : {}),
  }),
);

const PRESET_BY_ID = new Map<string, AvatarPreset>(
  AVATAR_PRESETS.map((preset) => [preset.id, preset]),
);

export function getAvatarPreset(id: string | undefined): AvatarPreset | undefined {
  if (id == null || id === "") {
    return undefined;
  }
  return PRESET_BY_ID.get(id);
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function defaultAvatarPreset(seed: string): AvatarPreset {
  const index = hashSeed(seed) % AVATAR_PRESETS.length;
  return AVATAR_PRESETS[index]!;
}

export function isValidAvatarPresetId(id: string): boolean {
  return PRESET_BY_ID.has(id);
}

export function resolveParticipantAvatarPreset(
  participant: { avatar_preset?: string } | undefined,
  seed: string,
): AvatarPreset {
  return getAvatarPreset(participant?.avatar_preset) ?? defaultAvatarPreset(seed);
}
