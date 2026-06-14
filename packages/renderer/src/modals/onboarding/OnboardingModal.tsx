/* OnboardingModal — first-launch wizard.

   Steps (rail on the left): Profile → Theme → Providers → Project → Kickoff.
   The user can Skip at any point (latches `onboarded` so it never re-opens).
   On Finish it bootstraps a real working session:

     1. switch the active path to the chosen folder
     2. create the session there and open it
     3. spawn the chosen provider as an agent bound to the session
     4. post the opening prompt (as the user) and the todos (assigned to the
        agent), then wake the agent so it starts with the work in hand

   Rendered as a standalone overlay by <App/> (not via ModalRoot) so backdrop
   clicks can't dismiss it and its lifecycle is owned by App's onboarding gate. */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Rocket,
  Sparkles,
  X,
} from "lucide-react";
import type { Participant, UpdateParticipantPatch } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { useStore } from "../../state/store.js";
import { useAgentSpawnContext } from "../../hooks/useAgentSpawn.js";
import { writeOnboarded } from "../../state/settings.js";
import {
  genTodoId,
  ONBOARDING_STEPS,
  SLUG_RE,
  slugFromFolder,
  type AgentIdentity,
  type ChosenAgent,
  type OnboardingStep,
} from "./types.js";
import { ThemeStep } from "./ThemeStep.js";
import { ProvidersStep } from "./ProvidersStep.js";
import { FolderStep } from "./FolderStep.js";
import { TodosStep } from "./TodosStep.js";
import { ProfileStep } from "./ProfileStep.js";

export interface OnboardingModalProps {
  /** Called after the wizard finishes or is skipped. App clears its gate. */
  onClose(): void;
}

const STEP_TITLES: Record<OnboardingStep, string> = {
  profile: "who the f**k are you?",
  theme: "Pick your look",
  providers: "Set up your providers",
  folder: "Choose your project",
  todos: "Line up the first run",
};

export function OnboardingModal({ onClose }: OnboardingModalProps): JSX.Element {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  const setPathsState = useStore((s) => s.setPathsState);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const currentUserId = useStore((s) => s.currentUserId);
  const participants = useStore((s) => s.participants);

  const spawn = useAgentSpawnContext();

  const seededUser =
    currentUserId !== null ? participants[currentUserId] : undefined;
  const userColor = seededUser?.color ?? "#2a5fa8";

  const [step, setStep] = useState<OnboardingStep>("profile");
  const [name, setName] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>(
    undefined,
  );
  const [chosen, setChosen] = useState<ChosenAgent | null>(null);
  const [folder, setFolder] = useState<string | null>(activePath);
  const [slug, setSlug] = useState("");
  const [todos, setTodos] = useState<string[]>([""]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"finishing" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default the folder to the active project once the kernel reports it (the
  // store has no activePath yet at first paint, when this modal mounts). Only
  // seeds while the user hasn't picked one, so it never clobbers their choice.
  useEffect(() => {
    if (folder === null && activePath !== null) setFolder(activePath);
  }, [activePath, folder]);

  const idx = ONBOARDING_STEPS.findIndex((s) => s.key === step);
  const isLast = idx === ONBOARDING_STEPS.length - 1;
  const folderReady =
    folder !== null && slug.length > 0 && SLUG_RE.test(slug);

  const skip = useCallback(() => {
    writeOnboarded(true);
    onClose();
  }, [onClose]);

  // Escape skips (and latches), matching modal-dismiss expectations without
  // letting a stray backdrop click throw away the wizard.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        e.stopPropagation();
        skip();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [skip]);

  const goTo = useCallback((next: OnboardingStep) => {
    setError(null);
    setStep(next);
  }, []);
  const back = useCallback(() => {
    if (idx > 0) goTo(ONBOARDING_STEPS[idx - 1]!.key);
  }, [idx, goTo]);
  const next = useCallback(() => {
    if (idx < ONBOARDING_STEPS.length - 1) goTo(ONBOARDING_STEPS[idx + 1]!.key);
  }, [idx, goTo]);

  const onChoose = useCallback(
    (runtimeId: string, identity: AgentIdentity) => {
      setChosen({ runtimeId, identity });
    },
    [],
  );

  // Folder selection is the picker's current directory (footerless mode). The
  // session name trails the folder's basename until the user types their own.
  const slugTouched = useRef(false);
  const onPickFolder = useCallback((p: string) => {
    setFolder(p);
    if (!slugTouched.current) setSlug(slugFromFolder(p));
  }, []);
  const onSlugChange = useCallback((v: string) => {
    setSlug(v);
    slugTouched.current = true;
  }, []);

  const finish = useCallback(async () => {
    if (!folderReady || folder === null) {
      setError("Pick a folder and name the session first.");
      setStep("folder");
      return;
    }
    setBusy("finishing");
    setError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const managed = createManagedAgentsClient({ baseUrl: "", token });

      // 1. Make the chosen folder the active project.
      if (folder !== activePath) {
        try {
          setPathsState(await client.setActivePath(folder));
        } catch {
          /* fall through; createSession with an explicit path still works */
        }
      }

      // 2. Create the session at the folder.
      const session = await client.createSession({ slug, path: folder });

      // 3. Sync path / session / participant state for the rest of the app.
      try {
        setPathsState(await client.getPaths());
      } catch {
        /* legacy kernel without /paths */
      }
      let parts: Record<string, Participant> = {};
      try {
        const [list, p] = await Promise.all([
          client.listSessions(),
          client.listParticipants(),
        ]);
        setSessions(list);
        parts = p;
        setParticipants(p);
      } catch {
        /* leave empty; session still opens below */
      }

      // 4. Resolve the user participant (the kernel seeds one on first open).
      const userId =
        useStore.getState().currentUserId ??
        Object.entries(parts).find(([, p]) => p.kind === "user")?.[0] ??
        null;

      // 5. Apply the profile (name + avatar) to this project's user BEFORE the
      //    spawn. Spawning persists the agent's color in the background; doing
      //    the profile write first keeps the two participant writes off each
      //    other (they read-modify-write the same participants.json and aren't
      //    atomic, so concurrent writes corrupt it). Skipped when the user left
      //    both blank — they stay the seeded "You".
      if (userId !== null) {
        const patch: UpdateParticipantPatch = {};
        if (name.trim().length > 0) patch.name = name.trim();
        if (avatarDataUrl !== undefined) patch.avatar_data_url = avatarDataUrl;
        if (Object.keys(patch).length > 0) {
          try {
            await client.updateParticipant(userId, patch);
            setParticipants(await client.listParticipants());
          } catch {
            /* non-fatal — identity can be set later in Settings → Profile */
          }
        }
      }

      // 6. Open the session.
      setCurrentSession(session.id);

      // 7. Spawn the chosen provider into the session (setup ran in the wizard,
      //    so preflight should be ready). onSpawnComplete persists the agent
      //    color in the background — now alone, after the profile write above.
      let agentId: string | null = null;
      if (chosen !== null) {
        const resp = await managed.spawn({
          runtime_id: chosen.runtimeId,
          session_id: session.id,
          suggested_participant_id: chosen.identity.participantId,
          name: chosen.identity.name,
          access_mode: spawn.accessModeForRuntime(chosen.runtimeId),
        });
        spawn.onSpawnComplete(resp, chosen.identity.name, chosen.identity.color);
        agentId = resp.participant_id;
      }

      // 8. Post the opening prompt as the user.
      const trimmedPrompt = prompt.trim();
      if (userId !== null && trimmedPrompt.length > 0) {
        await client.postProse(session.id, {
          participant_id: userId,
          content: trimmedPrompt,
        });
      }

      // 8. Post the todos (assigned to the agent when there is one).
      const cleanTodos = todos.map((t) => t.trim()).filter((t) => t.length > 0);
      if (userId !== null) {
        for (const title of cleanTodos) {
          await client.postTodo(session.id, {
            participant_id: userId,
            id: genTodoId(),
            title,
            status: "open",
            ...(agentId !== null ? { assigned_to: agentId } : {}),
          });
        }
      }

      // 9. Wake the agent so it picks up the prompt + todos right away.
      if (
        agentId !== null &&
        (trimmedPrompt.length > 0 || cleanTodos.length > 0)
      ) {
        try {
          await managed.wakeSession(session.id, {
            reason: "user-message",
            target_participant_ids: [agentId],
          });
        } catch {
          /* best-effort nudge; the launch packet already pointed it here */
        }
      }

      // 10. Latch onboarded + close into the live session.
      writeOnboarded(true);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }, [
    folderReady,
    folder,
    slug,
    activePath,
    token,
    chosen,
    prompt,
    todos,
    name,
    avatarDataUrl,
    spawn,
    setPathsState,
    setSessions,
    setParticipants,
    setCurrentSession,
    onClose,
  ]);

  const primaryDisabled =
    busy !== null || ((step === "folder" || isLast) && !folderReady);

  return (
    <div className="modal-backdrop ob-backdrop" role="presentation">
      <div
        className="modal ob-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head ob-head">
          <div className="modal-eyebrow">
            <Sparkles size={11} aria-hidden /> GET STARTED
          </div>
          <h2 className="modal-title" id="ob-title">
            {STEP_TITLES[step]}
          </h2>
          <button
            type="button"
            className="icon-btn modal-close"
            aria-label="Skip onboarding"
            onClick={skip}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        <div className="ob-shell">
          <nav className="ob-rail" aria-label="Onboarding steps">
            {ONBOARDING_STEPS.map((s, i) => {
              const active = s.key === step;
              const done = i < idx;
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`ob-rail-item${active ? " active" : ""}${
                    done ? " done" : ""
                  }`}
                  aria-current={active ? "step" : undefined}
                  onClick={() => goTo(s.key)}
                >
                  <span className="ob-rail-num">
                    {done ? <Check size={12} aria-hidden /> : i + 1}
                  </span>
                  <span className="ob-rail-text">
                    <span className="ob-rail-label">{s.label}</span>
                    <span className="ob-rail-blurb">{s.blurb}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="ob-content">
            {step === "profile" ? (
              <ProfileStep
                name={name}
                avatarDataUrl={avatarDataUrl}
                color={userColor}
                onNameChange={setName}
                onAvatarChange={setAvatarDataUrl}
              />
            ) : null}
            {step === "theme" ? <ThemeStep /> : null}
            {step === "providers" ? (
              <ProvidersStep
                token={token}
                runtimes={spawn.runtimes}
                disabledReason={spawn.spawnDisabledReason}
                chosenRuntimeId={chosen?.runtimeId ?? null}
                onChoose={onChoose}
              />
            ) : null}
            {step === "folder" ? (
              <FolderStep
                folder={folder}
                slug={slug}
                onPickFolder={onPickFolder}
                onSlugChange={onSlugChange}
              />
            ) : null}
            {step === "todos" ? (
              <TodosStep
                todos={todos}
                prompt={prompt}
                agentName={chosen?.identity.name ?? null}
                onTodosChange={setTodos}
                onPromptChange={setPrompt}
              />
            ) : null}
          </div>
        </div>

        {error !== null ? (
          <div className="ob-error form-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="modal-foot ob-foot">
          <button type="button" className="btn-ghost" onClick={skip}>
            Skip for now
          </button>
          <div className="foot-actions">
            {idx > 0 ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={back}
                disabled={busy !== null}
              >
                <ArrowLeft size={13} aria-hidden /> Back
              </button>
            ) : null}
            <button
              type="button"
              className="btn-solid ob-primary"
              disabled={primaryDisabled}
              onClick={() => (isLast ? void finish() : next())}
            >
              {isLast ? (
                <>
                  <Rocket size={13} aria-hidden />
                  {busy === "finishing" ? "Launching…" : "Finish & launch"}
                </>
              ) : (
                <>
                  Next <ArrowRight size={13} aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

