import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  Participant,
  UpdateUserProfilePatch,
  UserProfile,
} from "@f-mark/shared";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import {
  customColorPreview,
  DEFAULT_PROFILE,
  isHexColor,
  overlayProfileOnUsers,
  profileFromParticipant,
} from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
} as const;

export interface ProfileController {
  avatarPreset: string | undefined;
  color: string;
  currentUserId: string | null;
  customPreviewColor: string | null;
  dirty: boolean;
  error: string | null;
  hexInput: string;
  hexValid: boolean;
  name: string;
  previewParticipant: Participant;
  savedAt: number | null;
  saving: boolean;
  save(): Promise<void>;
  setAvatarPreset(id: string): void;
  setHexInputValue(value: string): void;
  setName(value: string): void;
  selectPresetColor(color: string): void;
}

interface ProfileStoreState {
  currentUserId: string | null;
  participants: Record<string, Participant>;
  setParticipants(participants: Record<string, Participant>): void;
  token: string | null;
  user: Participant | undefined;
}

interface ProfileFormState {
  avatarPreset: string | undefined;
  color: string;
  customPreviewColor: string | null;
  dirty: boolean;
  hexInput: string;
  hexValid: boolean;
  name: string;
  previewParticipant: Participant;
  setAvatarPreset(id: string): void;
  setHexInputValue(value: string): void;
  setName(value: string): void;
  selectPresetColor(color: string): void;
}

interface ProfileSaveStatus {
  error: string | null;
  savedAt: number | null;
  saving: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  setSavedAt: Dispatch<SetStateAction<number | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
}

function previewProfileFromForm(input: {
  avatarPreset: string | undefined;
  color: string;
  name: string;
  savedProfile: UserProfile;
}): UserProfile {
  const trimmedName = input.name.trim();
  return {
    name: trimmedName.length > 0 ? trimmedName : input.savedProfile.name,
    color: input.color,
    ...(input.avatarPreset !== undefined
      ? { avatar_preset: input.avatarPreset }
      : {}),
  };
}

function userPreviewParticipant(profile: UserProfile): Participant {
  return {
    kind: NO_LOOSE_STRING_VALUES.user,
    name: profile.name,
    color: profile.color,
    ...(profile.avatar_preset !== undefined
      ? { avatar_preset: profile.avatar_preset }
      : {}),
  };
}

function buildProfilePatch(input: {
  avatarPreset: string | undefined;
  color: string;
  name: string;
  profile: UserProfile;
}): UpdateUserProfilePatch {
  const patch: UpdateUserProfilePatch = {
    name: input.name.trim(),
    color: input.color,
  };
  if ((input.avatarPreset ?? null) !== (input.profile.avatar_preset ?? null)) {
    patch.avatar_preset = input.avatarPreset ?? null;
  }
  return patch;
}

function useProfileStoreState(): ProfileStoreState {
  const token = useStore((s) => s.token);
  const currentUserId = useStore((s) => s.currentUserId);
  const participants = useStore((s) => s.participants);
  const setParticipants = useStore((s) => s.setParticipants);
  const user = currentUserId !== null ? participants[currentUserId] : undefined;
  return { currentUserId, participants, setParticipants, token, user };
}

function useMachineProfile(
  token: string | null,
): [UserProfile | null, Dispatch<SetStateAction<UserProfile | null>>] {
  const [machineProfile, setMachineProfile] = useState<UserProfile | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const client = createClient({ baseUrl: "", token });
    void client
      .getUserProfile()
      .then((next) => {
        if (cancelled) return;
        setMachineProfile(next);
      })
      .catch(() => {
        /* Older kernels or malformed config should not block editing the
           currently visible profile; saving will surface any real error. */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return [machineProfile, setMachineProfile];
}

function useProfileFormState(profile: UserProfile): ProfileFormState {
  const [name, setName] = useState<string>(profile.name);
  const [color, setColor] = useState<string>(profile.color);
  const [hexInput, setHexInput] = useState<string>(profile.color);
  const [avatarPreset, setAvatarPresetState] = useState<string | undefined>(
    profile.avatar_preset,
  );

  useEffect(() => {
    setName(profile.name);
    setColor(profile.color);
    setHexInput(profile.color);
    setAvatarPresetState(profile.avatar_preset);
  }, [profile.name, profile.color, profile.avatar_preset]);

  const dirty = useMemo(
    () =>
      name.trim() !== profile.name ||
      color.toLowerCase() !== profile.color.toLowerCase() ||
      (avatarPreset ?? null) !== (profile.avatar_preset ?? null),
    [avatarPreset, color, name, profile.avatar_preset, profile.color, profile.name],
  );
  const previewProfile = useMemo(
    () =>
      previewProfileFromForm({
        avatarPreset,
        color,
        name,
        savedProfile: profile,
      }),
    [avatarPreset, color, name, profile.name],
  );
  const previewParticipant = useMemo(
    () => userPreviewParticipant(previewProfile),
    [previewProfile],
  );
  const hexValid = useMemo(() => isHexColor(hexInput), [hexInput]);
  const customPreviewColor = useMemo(
    () => customColorPreview(hexInput),
    [hexInput],
  );

  function selectPresetColor(nextColor: string): void {
    setColor(nextColor);
    setHexInput(nextColor);
  }

  function setHexInputValue(value: string): void {
    setHexInput(value);
    if (isHexColor(value)) setColor(value);
  }

  function setAvatarPreset(id: string): void {
    setAvatarPresetState(id);
  }

  return {
    avatarPreset,
    color,
    customPreviewColor,
    dirty,
    hexInput,
    hexValid,
    name,
    previewParticipant,
    setAvatarPreset,
    setHexInputValue,
    setName,
    selectPresetColor,
  };
}

function useProfileSaveStatus(): ProfileSaveStatus {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  return { error, savedAt, saving, setError, setSavedAt, setSaving };
}

export function useProfileController(): ProfileController {
  const store = useProfileStoreState();
  const participantProfile = profileFromParticipant(store.user);
  const [machineProfile, setMachineProfile] = useMachineProfile(store.token);
  const profile = machineProfile ?? participantProfile ?? DEFAULT_PROFILE;
  const form = useProfileFormState(profile);
  const status = useProfileSaveStatus();

  async function save(): Promise<void> {
    if (form.name.trim().length === 0) {
      status.setError("Name cannot be empty.");
      return;
    }
    if (!isHexColor(form.color)) {
      status.setError("Color must be a 6-digit hex like #2a5fa8.");
      return;
    }
    status.setSaving(true);
    status.setError(null);
    try {
      const client = createClient({ baseUrl: "", token: store.token });
      const updated = await client.updateUserProfile(
        buildProfilePatch({
          avatarPreset: form.avatarPreset,
          color: form.color,
          name: form.name,
          profile,
        }),
      );
      setMachineProfile(updated);
      store.setParticipants(overlayProfileOnUsers(store.participants, updated));
      status.setSavedAt(Date.now());
    } catch (err) {
      status.setError(err instanceof Error ? err.message : String(err));
    } finally {
      status.setSaving(false);
    }
  }

  return {
    avatarPreset: form.avatarPreset,
    color: form.color,
    currentUserId: store.currentUserId,
    customPreviewColor: form.customPreviewColor,
    dirty: form.dirty,
    error: status.error,
    hexInput: form.hexInput,
    hexValid: form.hexValid,
    name: form.name,
    previewParticipant: form.previewParticipant,
    savedAt: status.savedAt,
    saving: status.saving,
    save,
    setAvatarPreset: form.setAvatarPreset,
    setHexInputValue: form.setHexInputValue,
    setName: form.setName,
    selectPresetColor: form.selectPresetColor,
  };
}
