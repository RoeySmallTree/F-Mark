import {
  PLACEHOLDER_SESSION_SLUG,
  type Participant,
  type UpdateUserProfilePatch,
} from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { rootScopeForSession, scopeToBody } from "../../api/rootScope.js";
import type { AgentSpawnValue } from "../../hooks/useAgentSpawn.js";
import { useStore } from "../../state/store.js";
import { writeOnboarded } from "../../state/settings.js";
import { genTodoId, type ChosenAgent, type OnboardingStep } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  finishing: "finishing",
  folder: "folder",
  user: "user",
  open: "open",
  userMessage: "user-message",
} as const;

type StoreActions = ReturnType<typeof useStore.getState>;

export interface OnboardingFinishInput {
  folderReady: boolean;
  folder: string | null;
  activePath: string | null;
  token: string | null;
  chosen: ChosenAgent | null;
  prompt: string;
  todos: string[];
  name: string;
  avatarPreset: string | undefined;
  userColor: string;
  spawn: AgentSpawnValue;
  setPathsState: StoreActions["setPathsState"];
  setSessions: StoreActions["setSessions"];
  setParticipants: StoreActions["setParticipants"];
  setCurrentSession: StoreActions["setCurrentSession"];
  setBusy(value: "finishing" | null): void;
  setError(value: string | null): void;
  setStep(value: OnboardingStep): void;
  onClose(): void;
}

class OnboardingFinishRunner {
  private readonly client: ReturnType<typeof createClient>;
  private readonly managed: ReturnType<typeof createManagedAgentsClient>;

  constructor(private readonly input: OnboardingFinishInput) {
    this.client = createClient({ baseUrl: "", token: input.token });
    this.managed = createManagedAgentsClient({
      baseUrl: "",
      token: input.token,
    });
  }

  async run(): Promise<void> {
    if (!this.readyToFinish()) return;
    this.input.setBusy(NO_LOOSE_STRING_VALUES.finishing);
    this.input.setError(null);
    try {
      await this.finish();
    } catch (error) {
      this.input.setError(error instanceof Error ? error.message : String(error));
      this.input.setBusy(null);
    }
  }

  private readyToFinish(): boolean {
    if (this.input.folderReady && this.input.folder !== null) {
      return true;
    }
    this.input.setError("Pick a project folder first.");
    this.input.setStep(NO_LOOSE_STRING_VALUES.folder);
    return false;
  }

  private async finish(): Promise<void> {
    const folder = this.input.folder!;
    await this.activateFolder(folder);
    const session = await this.client.createSession({
      slug: PLACEHOLDER_SESSION_SLUG,
      path: folder,
    });
    let participants = await this.syncAppState();
    participants = await this.applyProfile(participants);
    const userId = this.resolveUserId(participants);
    this.input.setCurrentSession(session.id);
    const scope = rootScopeForSession(session, null, folder);
    const agentId = await this.spawnChosenAgent(session.id, scope);
    const cleanTodos = this.cleanTodos();
    const trimmedPrompt = this.input.prompt.trim();
    await this.postKickoff({
      sessionId: session.id,
      userId,
      agentId,
      scope,
      cleanTodos,
      trimmedPrompt,
    });
    await this.wakeAgent({
      sessionId: session.id,
      agentId,
      scope,
      cleanTodos,
      trimmedPrompt,
    });
    writeOnboarded(true);
    this.input.onClose();
  }

  private async activateFolder(folder: string): Promise<void> {
    if (folder === this.input.activePath) return;
    try {
      this.input.setPathsState(await this.client.setActivePath(folder));
    } catch {
      /* createSession with an explicit path still works. */
    }
  }

  private async syncAppState(): Promise<Record<string, Participant>> {
    try {
      this.input.setPathsState(await this.client.getPaths());
    } catch {
      /* legacy kernel without /paths */
    }
    try {
      const [list, participants] = await Promise.all([
        this.client.listSessions(),
        this.client.listParticipants(),
      ]);
      this.input.setSessions(list);
      this.input.setParticipants(participants);
      return participants;
    } catch {
      return {};
    }
  }

  private async applyProfile(
    participants: Record<string, Participant>,
  ): Promise<Record<string, Participant>> {
    const patch = this.profilePatch();
    if (Object.keys(patch).length === 0) return participants;
    try {
      await this.client.updateUserProfile(patch);
      const next = await this.client.listParticipants();
      this.input.setParticipants(next);
      return next;
    } catch {
      return participants;
    }
  }

  private profilePatch(): UpdateUserProfilePatch {
    const patch: UpdateUserProfilePatch = {};
    const trimmedName = this.input.name.trim();
    if (trimmedName.length > 0) patch.name = trimmedName;
    if (this.input.avatarPreset !== undefined) {
      patch.avatar_preset = this.input.avatarPreset;
    }
    if (Object.keys(patch).length > 0) patch.color = this.input.userColor;
    return patch;
  }

  private resolveUserId(parts: Record<string, Participant>): string | null {
    return (
      useStore.getState().currentUserId ??
      Object.entries(parts).find(([, p]) => p.kind === NO_LOOSE_STRING_VALUES.user)?.[0] ??
      null
    );
  }

  private async spawnChosenAgent(
    sessionId: string,
    scope: ReturnType<typeof rootScopeForSession>,
  ): Promise<string | null> {
    if (this.input.chosen === null) return null;
    const model =
      this.input.chosen.model ??
      this.input.spawn.modelForRuntime(this.input.chosen.runtimeId);
    const effort =
      this.input.chosen.effort ??
      this.input.spawn.effortForRuntime(this.input.chosen.runtimeId);
    const resp = await this.managed.spawn({
      runtime_id: this.input.chosen.runtimeId,
      session_id: sessionId,
      ...(scope !== null ? scopeToBody(scope) : {}),
      suggested_participant_id: this.input.chosen.identity.participantId,
      name: this.input.chosen.identity.name,
      ...(model.length > 0 ? { model } : {}),
      ...(effort.length > 0 ? { effort } : {}),
      access_mode: this.input.spawn.accessModeForRuntime(
        this.input.chosen.runtimeId,
      ),
    });
    this.input.spawn.onSpawnComplete(
      resp,
      this.input.chosen.identity.name,
      this.input.chosen.identity.color,
    );
    return resp.participant_id;
  }

  private async postKickoff(input: {
    sessionId: string;
    userId: string | null;
    agentId: string | null;
    scope: ReturnType<typeof rootScopeForSession>;
    cleanTodos: string[];
    trimmedPrompt: string;
  }): Promise<void> {
    if (input.userId === null || input.scope === null) return;
    if (input.trimmedPrompt.length > 0) {
      await this.client.postProse(
        input.sessionId,
        {
          participant_id: input.userId,
          content: input.trimmedPrompt,
        },
        input.scope,
      );
    }
    for (const title of input.cleanTodos) {
      await this.client.postTodo(
        input.sessionId,
        {
          participant_id: input.userId,
          id: genTodoId(),
          title,
          status: NO_LOOSE_STRING_VALUES.open,
          ...(input.agentId !== null ? { assigned_to: input.agentId } : {}),
        },
        input.scope,
      );
    }
  }

  private async wakeAgent(input: {
    sessionId: string;
    agentId: string | null;
    scope: ReturnType<typeof rootScopeForSession>;
    cleanTodos: string[];
    trimmedPrompt: string;
  }): Promise<void> {
    if (input.agentId === null || input.scope === null) return;
    if (input.trimmedPrompt.length === 0 && input.cleanTodos.length === 0) return;
    try {
      await this.managed.wakeSession(input.sessionId, {
        reason: NO_LOOSE_STRING_VALUES.userMessage,
        target_participant_ids: [input.agentId],
        ...scopeToBody(input.scope),
      });
    } catch {
      /* best-effort nudge; the launch packet already pointed it here. */
    }
  }

  private cleanTodos(): string[] {
    return this.input.todos.map((todo) => todo.trim()).filter(Boolean);
  }
}

export function finishOnboarding(input: OnboardingFinishInput): Promise<void> {
  return new OnboardingFinishRunner(input).run();
}
