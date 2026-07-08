import { expect } from "vitest";
import { readConfig } from "../../../src/project.js";
import { registerAgent } from "../../../src/participants.js";
import { writeEventFile } from "../../../src/events/writer.js";
import { serializeProse } from "../../../src/events/prose.js";
import { createAgentStateStore } from "../../../src/services/agentState.js";
import { writeActiveSession } from "../../../src/agents/activeSession.js";
import { writeRuntime, writeTmuxSession } from "../../../src/agents/managed.js";
import { fmarkAgentSessionName } from "../../../src/tmux/naming.js";
import type { ProjectPaths } from "./fixtures.js";

export async function userParticipantId(p: ProjectPaths): Promise<string> {
  const cfg = await readConfig(p);
  const userId = Object.entries(cfg.participants).find(
    ([, participant]) => participant.kind === "user",
  )?.[0];
  expect(userId).toBeDefined();
  return userId!;
}

export async function writeUserProseEvent(
  p: ProjectPaths,
  sessionId: string,
  content: string,
): Promise<string> {
  const participantId = await userParticipantId(p);
  await writeEventFile(p, sessionId, {
    participant_id: participantId,
    kind: "prose",
    ext: "md",
    contents: serializeProse({ content }),
  });
  return participantId;
}

export async function writeManagedAgentFixture({
  p,
  root,
  participantId,
  runtimeId,
  sessionId,
  tmuxSession,
  name,
  knownRuntimeIds,
}: {
  p: ProjectPaths;
  root: string;
  participantId: string;
  runtimeId: string;
  sessionId?: string;
  tmuxSession?: string;
  name?: string;
  knownRuntimeIds?: Set<string>;
}) {
  await registerAgent(p, {
    name: name ?? runtimeIdLabel(runtimeId),
    suggested_id: participantId,
    runtime_id: runtimeId,
    knownRuntimeIds: knownRuntimeIds ?? new Set([runtimeId]),
  });
  const defaultTmuxSession = managedAgentTmuxSessionName(root, participantId);
  const storedTmuxSession = tmuxSession ?? defaultTmuxSession;
  const agentsDir = `${p.fmarkDir()}/agents`;
  await writeTmuxSession(agentsDir, participantId, storedTmuxSession);
  await writeRuntime(agentsDir, participantId, runtimeId);
  if (sessionId !== undefined) {
    await writeActiveSession(agentsDir, participantId, sessionId);
  }
  return {
    state: createAgentStateStore({ fallback: p }),
    tmuxSession: storedTmuxSession,
    defaultTmuxSession,
  };
}

function managedAgentTmuxSessionName(
  root: string,
  participantId: string,
): string {
  return fmarkAgentSessionName(root, participantId);
}

function runtimeIdLabel(runtimeId: string): string {
  if (runtimeId === "claude") return "Claude";
  if (runtimeId === "codex") return "Codex";
  return runtimeId;
}
