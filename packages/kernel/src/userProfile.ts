import {
  isValidAvatarPresetId,
  type Participant,
  type UpdateUserProfilePatch,
  type UserProfile,
} from "@f-mark/shared";
import type { Paths } from "./paths.js";
import type { GlobalPaths } from "./paths/global.js";
import {
  readGlobalConfig,
  updateGlobalConfig,
  type FMarkGlobalConfig,
} from "./state/globalConfig.js";
import { isEnoent, readParticipants } from "./participants/store.js";
import {
  isValidHexColor,
  validateName,
} from "./participants.js";

const DEFAULT_USER_PROFILE: UserProfile = {
  name: "You",
  color: "#3b82f6",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceUserProfile(value: unknown): UserProfile {
  if (!isRecord(value)) return DEFAULT_USER_PROFILE;
  const name =
    typeof value.name === "string" && value.name.trim().length > 0
      ? value.name
      : DEFAULT_USER_PROFILE.name;
  const color =
    typeof value.color === "string" && isValidHexColor(value.color)
      ? value.color
      : DEFAULT_USER_PROFILE.color;
  const avatarPreset =
    typeof value.avatar_preset === "string" &&
    isValidAvatarPresetId(value.avatar_preset)
      ? value.avatar_preset
      : undefined;
  return {
    name,
    color,
    ...(avatarPreset !== undefined ? { avatar_preset: avatarPreset } : {}),
  };
}

function hasStoredUserProfile(config: FMarkGlobalConfig): boolean {
  return isRecord(config.userProfile);
}

function isDefaultUserProfile(profile: UserProfile): boolean {
  return (
    profile.name === DEFAULT_USER_PROFILE.name &&
    profile.color === DEFAULT_USER_PROFILE.color &&
    profile.avatar_preset === undefined
  );
}

function userProfileFromParticipants(
  participants: Record<string, Participant>,
): UserProfile | null {
  const user = Object.values(participants).find(
    (participant) => participant.kind === "user",
  );
  return user === undefined ? null : coerceUserProfile(user);
}

async function readLegacyProjectUserProfile(
  p: Paths,
): Promise<UserProfile | null> {
  try {
    return userProfileFromParticipants(await readParticipants(p));
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

async function seedUserProfile(
  g: GlobalPaths,
  profile: UserProfile,
): Promise<UserProfile> {
  let resolved = profile;
  await updateGlobalConfig(g, (config: FMarkGlobalConfig) => {
    if (hasStoredUserProfile(config)) {
      resolved = coerceUserProfile(config.userProfile);
      return config;
    }
    return { ...config, userProfile: profile };
  });
  return resolved;
}

export async function readUserProfile(g: GlobalPaths): Promise<UserProfile> {
  const config = await readGlobalConfig(g);
  return coerceUserProfile(config.userProfile);
}

export async function readUserProfileForProject(
  g: GlobalPaths,
  p: Paths,
): Promise<UserProfile> {
  const config = await readGlobalConfig(g);
  if (hasStoredUserProfile(config)) {
    return coerceUserProfile(config.userProfile);
  }

  const legacyProfile = await readLegacyProjectUserProfile(p);
  if (legacyProfile === null || isDefaultUserProfile(legacyProfile)) {
    return DEFAULT_USER_PROFILE;
  }
  return seedUserProfile(g, legacyProfile);
}

export async function updateUserProfile(
  g: GlobalPaths,
  patch: UpdateUserProfilePatch,
): Promise<UserProfile> {
  let nextProfile: UserProfile = DEFAULT_USER_PROFILE;
  await updateGlobalConfig(g, (config: FMarkGlobalConfig) => {
    const current = coerceUserProfile(config.userProfile);
    nextProfile = { ...current };
    if (patch.name !== undefined) {
      nextProfile.name = validateName(patch.name);
    }
    if (patch.color !== undefined) {
      if (!isValidHexColor(patch.color)) {
        throw new Error(`invalid hex color: ${patch.color}`);
      }
      nextProfile.color = patch.color;
    }
    if (patch.avatar_preset !== undefined) {
      if (patch.avatar_preset === null) {
        delete nextProfile.avatar_preset;
      } else {
        if (!isValidAvatarPresetId(patch.avatar_preset)) {
          throw new Error(`invalid avatar preset: ${patch.avatar_preset}`);
        }
        nextProfile.avatar_preset = patch.avatar_preset;
      }
    }
    return { ...config, userProfile: nextProfile };
  });
  return nextProfile;
}

export function overlayUserProfileOnParticipants<
  T extends Record<string, Participant>,
>(participants: T, profile: UserProfile): T {
  const next: Record<string, Participant> = {};
  for (const [id, participant] of Object.entries(participants)) {
    if (participant.kind !== "user") {
      next[id] = participant;
      continue;
    }
    next[id] = {
      ...participant,
      name: profile.name,
      color: profile.color,
      ...(profile.avatar_preset !== undefined
        ? { avatar_preset: profile.avatar_preset }
        : {}),
    };
    if (profile.avatar_preset === undefined) {
      delete next[id]!.avatar_preset;
    }
  }
  return next as T;
}
