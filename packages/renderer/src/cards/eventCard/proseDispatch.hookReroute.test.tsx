import { describe, it, expect } from "vitest";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { renderProseEvent } from "./proseDispatch.js";
import { HookInvocationCard } from "../HookInvocationCard.js";
import { MessageCard } from "../MessageCard.js";
import type { EventCardProps } from "./types.js";

/** planning/hook-injected-activity — Section A/B renderer reroute proof. */
function proseEvent(participantId: string, source?: "hook"): AnyEventRecord {
  return {
    filename: `20260705T000000.000Z_${participantId}.prose.md`,
    timestamp: "20260705T000000.000Z",
    participant_id: participantId,
    kind: "prose",
    payload: {
      content: "## Memory Writing Agent: Phase 2 (Consolidation)\n\nYou are a Memory Writing Agent.",
      ...(source ? { source } : {}),
    },
  } as AnyEventRecord;
}

function props(event: AnyEventRecord): EventCardProps {
  return {
    event,
    participants: {} as Record<string, Participant>, // whoOf falls back to id prefix
    comments: [],
    allEvents: [event],
  };
}

describe("renderProseEvent — hook-injected prose reroute (Section A/B)", () => {
  it("routes a us-* source:hook prompt to HookInvocationCard, NOT a user message bubble", () => {
    const el = renderProseEvent(props(proseEvent("us-a455", "hook")));
    expect(el?.type).toBe(HookInvocationCard);
  });

  it("keeps a genuine composer message (us-*, no source) as a MessageCard", () => {
    const el = renderProseEvent(props(proseEvent("us-a455")));
    expect(el?.type).toBe(MessageCard);
  });

  it("does NOT reroute agent-lane source:hook prose (legit streamed agent output)", () => {
    const el = renderProseEvent(props(proseEvent("ag-codex-9299", "hook")));
    expect(el?.type).toBe(MessageCard);
  });
});
