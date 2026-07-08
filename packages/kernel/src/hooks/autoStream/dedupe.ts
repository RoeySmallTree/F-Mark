import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { paths as makePaths } from "../../paths.js";
import { readEvents } from "../../events/reader.js";
import type { ProjectedEvent } from "../projectTurn.js";
import { isFmarkMcpToolName } from "./subagents.js";

export class HookTurnInspector {
  async hasMatchingCurrentTurnSelfProse(input: {
    projectRoot: string;
    sessionId: string;
    participantId: string;
    content: string;
  }): Promise<boolean> {
    const target = normalizeFinalText(input.content);
    if (target.length === 0) return false;
    const events = await this.safeReadEvents(input.projectRoot, input.sessionId);
    for (let i = events.length - 1; i >= 0; i--) {
      const outcome = this.selfProseScanOutcome(events[i], input.participantId, target);
      if (outcome !== "continue") return outcome === "match";
    }
    return false;
  }

  async hasMatchingMcpFinalProse(input: {
    projectRoot: string;
    sessionId: string;
    participantId: string;
    content: string;
  }): Promise<boolean> {
    const target = normalizeFinalText(input.content);
    const events = await readEvents(makePaths(input.projectRoot), input.sessionId, {
      participant: input.participantId,
    });
    for (let i = events.length - 1; i >= 0; i--) {
      const outcome = this.mcpFinalProseScanOutcome(events[i], target);
      if (outcome !== "continue") return outcome === "match";
    }
    return false;
  }

  async participantCurrentTurnIsClosed(input: {
    projectRoot: string;
    sessionId: string;
    participantId: string;
  }): Promise<boolean> {
    const events = await this.safeReadEvents(input.projectRoot, input.sessionId);
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event === undefined) continue;
      if (event.participant_id === input.participantId) {
        return event.kind === "turn-end";
      }
      if (event.participant_id.startsWith("us")) return false;
    }
    return false;
  }

  private async safeReadEvents(
    projectRoot: string,
    sessionId: string,
  ): Promise<AnyEventRecord[]> {
    try {
      return await readEvents(makePaths(projectRoot), sessionId, {});
    } catch {
      return [];
    }
  }

  private selfProseScanOutcome(
    event: AnyEventRecord | undefined,
    participantId: string,
    target: string,
  ): "continue" | "stop" | "match" {
    if (event === undefined) return "continue";
    if (event.participant_id.startsWith("us-")) return "stop";
    if (event.participant_id !== participantId) return "continue";
    if (event.kind === "turn-end") return "stop";
    if (event.kind !== "prose") return "continue";
    return this.selfProseMatches(event.payload as ProsePayload, target)
      ? "match"
      : "continue";
  }

  private selfProseMatches(payload: ProsePayload, target: string): boolean {
    return (
      normalizeFinalText(payload.content) === target &&
      (payload.arbitrary === true || payload.source === "mcp")
    );
  }

  private mcpFinalProseScanOutcome(
    event: AnyEventRecord | undefined,
    target: string,
  ): "continue" | "stop" | "match" {
    if (event === undefined) return "continue";
    if (event.kind !== "prose") return event.kind === "turn-end" ? "continue" : "stop";
    const payload = event.payload as ProsePayload;
    if (payload.arbitrary === true) return "stop";
    return payload.source === "mcp" && normalizeFinalText(payload.content) === target
      ? "match"
      : "stop";
  }
}

export class HookEventDedupe {
  constructor(private readonly turns = new HookTurnInspector()) {}

  async dedupeFinalProse(input: {
    projectRoot: string;
    sessionId: string;
    participantId: string;
    events: ProjectedEvent[];
  }): Promise<ProjectedEvent[]> {
    const seenToolUseIds = await this.seenToolUseIdsIfNeeded(input);
    const out: ProjectedEvent[] = [];
    for (const event of input.events) {
      if (await this.shouldDrop(event, input, seenToolUseIds)) continue;
      out.push(event);
    }
    return out;
  }

  private async shouldDrop(
    event: ProjectedEvent,
    input: {
      projectRoot: string;
      sessionId: string;
      participantId: string;
    },
    seenToolUseIds: Set<string>,
  ): Promise<boolean> {
    if (this.shouldDropToolUse(event, seenToolUseIds)) return true;
    return this.shouldDropProse(event, input);
  }

  private shouldDropToolUse(
    event: ProjectedEvent,
    seenToolUseIds: Set<string>,
  ): boolean {
    return (
      event.kind === "tool-use" &&
      (isFmarkMcpToolName(event.tool_name) ||
        seenToolUseIds.has(event.tool_use_id))
    );
  }

  private async shouldDropProse(
    event: ProjectedEvent,
    input: {
      projectRoot: string;
      sessionId: string;
      participantId: string;
    },
  ): Promise<boolean> {
    if (event.kind !== "prose") return false;
    // A coalesced event must survive to supersede its delta fragments; never
    // drop a prose block that carries a supersedes pointer.
    if (proseHasSupersedes(event)) return false;
    const probe = {
      ...input,
      content: event.content,
    };
    return event.arbitrary
      ? this.turns.hasMatchingCurrentTurnSelfProse(probe)
      : this.turns.hasMatchingMcpFinalProse(probe);
  }

  private async seenToolUseIdsIfNeeded(input: {
    projectRoot: string;
    sessionId: string;
    participantId: string;
    events: ProjectedEvent[];
  }): Promise<Set<string>> {
    if (!input.events.some((event) => event.kind === "tool-use")) {
      return new Set();
    }
    try {
      return await this.existingToolUseIds(input);
    } catch {
      return new Set();
    }
  }

  private async existingToolUseIds(input: {
    projectRoot: string;
    sessionId: string;
    participantId: string;
  }): Promise<Set<string>> {
    const events = await readEvents(makePaths(input.projectRoot), input.sessionId, {
      participant: input.participantId,
      kinds: ["tool-use"],
    });
    const ids = new Set<string>();
    for (const event of events) {
      if (event.kind !== "tool-use") continue;
      const payload = event.payload as { tool_use_id?: unknown } | null;
      if (payload !== null && typeof payload?.tool_use_id === "string") {
        ids.add(payload.tool_use_id);
      }
    }
    return ids;
  }
}

function proseHasSupersedes(event: ProjectedEvent): boolean {
  if (event.kind !== "prose") return false;
  const supersedes = event.supersedes;
  if (typeof supersedes === "string") return supersedes.length > 0;
  return Array.isArray(supersedes) && supersedes.length > 0;
}

function normalizeFinalText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
