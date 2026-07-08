import { useCallback, useEffect, useState } from "react";
import { useAgentSpawnContext, type AgentSpawnValue } from "../../hooks/useAgentSpawn.js";
import { writeOnboarded } from "../../state/settings.js";
import { useStore } from "../../state/store.js";
import {
  ONBOARDING_STEPS,
  type AgentIdentity,
  type ChosenAgent,
  type OnboardingStep,
} from "./types.js";
import { finishOnboarding } from "./onboardingFinish.js";

const NO_LOOSE_STRING_VALUES = {
  esc: "Esc",
  folder: "folder",
  value2a5fa8: "#2a5fa8",
  profile: "profile",
} as const;

type BusyState = "finishing" | null;
type StoreActions = ReturnType<typeof useStore.getState>;

interface StoreBindings {
  token: string | null;
  activePath: string | null;
  currentUserId: string | null;
  participants: StoreActions["participants"];
  setPathsState: StoreActions["setPathsState"];
  setSessions: StoreActions["setSessions"];
  setParticipants: StoreActions["setParticipants"];
  setCurrentSession: StoreActions["setCurrentSession"];
}

interface NavigationState {
  idx: number;
  isLast: boolean;
  goTo(next: OnboardingStep): void;
  back(): void;
  next(): void;
}

interface FolderState {
  folder: string | null;
  folderReady: boolean;
  onPickFolder(path: string): void;
}

interface DraftState {
  name: string;
  avatarPreset: string | undefined;
  chosen: ChosenAgent | null;
  todos: string[];
  prompt: string;
  busy: BusyState;
  error: string | null;
  setName(value: string): void;
  setAvatarPreset(value: string | undefined): void;
  setTodos(value: string[]): void;
  setPrompt(value: string): void;
  setBusy(value: BusyState): void;
  setError(value: string | null): void;
  onChoose(
    runtimeId: string,
    identity: AgentIdentity,
    defaults?: { model: string; effort: string },
  ): void;
}

export interface OnboardingController {
  token: string | null;
  spawn: AgentSpawnValue;
  step: OnboardingStep;
  idx: number;
  isLast: boolean;
  name: string;
  avatarPreset: string | undefined;
  userColor: string;
  chosen: ChosenAgent | null;
  folder: string | null;
  todos: string[];
  prompt: string;
  busy: BusyState;
  error: string | null;
  primaryDisabled: boolean;
  skip(): void;
  goTo(next: OnboardingStep): void;
  back(): void;
  next(): void;
  onChoose(
    runtimeId: string,
    identity: AgentIdentity,
    defaults?: { model: string; effort: string },
  ): void;
  onPickFolder(path: string): void;
  setName(value: string): void;
  setAvatarPreset(value: string | undefined): void;
  setTodos(value: string[]): void;
  setPrompt(value: string): void;
  finish(): Promise<void>;
}

export interface OnboardingControllerInput {
  onClose(): void;
}

function useStoreBindings(): StoreBindings {
  return {
    token: useStore((s) => s.token),
    activePath: useStore((s) => s.activePath),
    setPathsState: useStore((s) => s.setPathsState),
    setSessions: useStore((s) => s.setSessions),
    setParticipants: useStore((s) => s.setParticipants),
    setCurrentSession: useStore((s) => s.setCurrentSession),
    currentUserId: useStore((s) => s.currentUserId),
    participants: useStore((s) => s.participants),
  };
}

function useOnboardingDraftState(): DraftState {
  const [name, setName] = useState("");
  const [avatarPreset, setAvatarPreset] = useState<string | undefined>(undefined);
  const [chosen, setChosen] = useState<ChosenAgent | null>(null);
  const [todos, setTodos] = useState<string[]>([""]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);
  const onChoose = useCallback((
    runtimeId: string,
    identity: AgentIdentity,
    defaults?: { model: string; effort: string },
  ) => {
    setChosen({ runtimeId, identity, ...defaults });
  }, []);

  return {
    name,
    avatarPreset,
    chosen,
    todos,
    prompt,
    busy,
    error,
    setName,
    setAvatarPreset,
    setTodos,
    setPrompt,
    setBusy,
    setError,
    onChoose,
  };
}

function useNavigation(
  step: OnboardingStep,
  setStep: (step: OnboardingStep) => void,
  setError: (error: string | null) => void,
): NavigationState {
  const idx = ONBOARDING_STEPS.findIndex((s) => s.key === step);
  const isLast = idx === ONBOARDING_STEPS.length - 1;

  const goTo = useCallback(
    (next: OnboardingStep) => {
      setError(null);
      setStep(next);
    },
    [setError, setStep],
  );
  const back = useCallback(() => {
    if (idx > 0) goTo(ONBOARDING_STEPS[idx - 1]!.key);
  }, [idx, goTo]);
  const next = useCallback(() => {
    if (idx < ONBOARDING_STEPS.length - 1) goTo(ONBOARDING_STEPS[idx + 1]!.key);
  }, [idx, goTo]);

  return { idx, isLast, goTo, back, next };
}

/* The first session opens with the placeholder slug (`new-session`); the
   spawned agent renames it via `fmark_rename_session` once the kickoff
   prompt tells it what the session is about. */
function useFolderState(activePath: string | null): FolderState {
  const [folder, setFolder] = useState<string | null>(activePath);
  const folderReady = folder !== null;

  useEffect(() => {
    if (folder === null && activePath !== null) setFolder(activePath);
  }, [activePath, folder]);

  const onPickFolder = useCallback((path: string) => {
    setFolder(path);
  }, []);

  return {
    folder,
    folderReady,
    onPickFolder,
  };
}

function useSkipHandler(onClose: () => void): () => void {
  const skip = useCallback(() => {
    writeOnboarded(true);
    onClose();
  }, [onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape" || event.key === NO_LOOSE_STRING_VALUES.esc) {
        event.preventDefault();
        event.stopPropagation();
        skip();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [skip]);

  return skip;
}

function useFinishHandler(input: {
  store: StoreBindings;
  spawn: AgentSpawnValue;
  chosen: ChosenAgent | null;
  folderState: FolderState;
  prompt: string;
  todos: string[];
  name: string;
  avatarPreset: string | undefined;
  userColor: string;
  setBusy(value: BusyState): void;
  setError(value: string | null): void;
  setStep(value: OnboardingStep): void;
  onClose(): void;
}): () => Promise<void> {
  const { store, spawn, chosen, folderState } = input;
  return useCallback(
    () =>
      finishOnboarding({
        folderReady: folderState.folderReady,
        folder: folderState.folder,
        activePath: store.activePath,
        token: store.token,
        chosen,
        prompt: input.prompt,
        todos: input.todos,
        name: input.name,
        avatarPreset: input.avatarPreset,
        userColor: input.userColor,
        spawn,
        setPathsState: store.setPathsState,
        setSessions: store.setSessions,
        setParticipants: store.setParticipants,
        setCurrentSession: store.setCurrentSession,
        setBusy: input.setBusy,
        setError: input.setError,
        setStep: input.setStep,
        onClose: input.onClose,
      }),
    [
      chosen,
      folderState.folderReady,
      folderState.folder,
      input.avatarPreset,
      input.name,
      input.onClose,
      input.prompt,
      input.setBusy,
      input.setError,
      input.setStep,
      input.todos,
      input.userColor,
      spawn,
      store.activePath,
      store.setCurrentSession,
      store.setParticipants,
      store.setPathsState,
      store.setSessions,
      store.token,
    ],
  );
}

function primaryActionDisabled(input: {
  busy: BusyState;
  step: OnboardingStep;
  isLast: boolean;
  folderReady: boolean;
}): boolean {
  if (input.busy !== null) return true;
  if (input.step === NO_LOOSE_STRING_VALUES.folder) return !input.folderReady;
  if (input.isLast) return !input.folderReady;
  return false;
}

function resolveUserColor(store: StoreBindings): string {
  const seededUser =
    store.currentUserId !== null ? store.participants[store.currentUserId] : undefined;
  return seededUser?.color ?? NO_LOOSE_STRING_VALUES.value2a5fa8;
}

export function useOnboardingController({
  onClose,
}: OnboardingControllerInput): OnboardingController {
  const store = useStoreBindings();
  const spawn = useAgentSpawnContext();
  const [step, setStep] = useState<OnboardingStep>(NO_LOOSE_STRING_VALUES.profile);
  const draft = useOnboardingDraftState();
  const userColor = resolveUserColor(store);
  const folderState = useFolderState(store.activePath);
  const navigation = useNavigation(step, setStep, draft.setError);
  const skip = useSkipHandler(onClose);
  const finish = useFinishHandler({
    store,
    spawn,
    chosen: draft.chosen,
    folderState,
    prompt: draft.prompt,
    todos: draft.todos,
    name: draft.name,
    avatarPreset: draft.avatarPreset,
    userColor,
    setBusy: draft.setBusy,
    setError: draft.setError,
    setStep,
    onClose,
  });

  return {
    token: store.token,
    spawn,
    step,
    idx: navigation.idx,
    isLast: navigation.isLast,
    name: draft.name,
    avatarPreset: draft.avatarPreset,
    userColor,
    chosen: draft.chosen,
    folder: folderState.folder,
    todos: draft.todos,
    prompt: draft.prompt,
    busy: draft.busy,
    error: draft.error,
    primaryDisabled: primaryActionDisabled({
      busy: draft.busy,
      step,
      isLast: navigation.isLast,
      folderReady: folderState.folderReady,
    }),
    skip,
    goTo: navigation.goTo,
    back: navigation.back,
    next: navigation.next,
    onChoose: draft.onChoose,
    onPickFolder: folderState.onPickFolder,
    setName: draft.setName,
    setAvatarPreset: draft.setAvatarPreset,
    setTodos: draft.setTodos,
    setPrompt: draft.setPrompt,
    finish,
  };
}
