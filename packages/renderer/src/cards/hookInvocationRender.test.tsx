import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  AnyEventRecord,
  Participant,
  SubagentOutputEventRecord,
  SubagentRunEventRecord,
} from "@f-mark/shared";
import { aggregate } from "../state/aggregate.js";
import { projectFeed } from "../feed/projectFeed.js";
import { FeedRows } from "../shell/FeedRows.js";
import { ToolboxAccordionProvider } from "./toolboxAccordion.js";

const USER_ID = "us-abcd";
const CORRELATION_ID = "hook-user-prompt-submit-1";
const FULL_PROMPT =
  "Memory Writing Agent: consolidate the current conversation into durable memory without sending a normal user message.";

const PARTICIPANTS: Record<string, Participant> = {
  [USER_ID]: { kind: "user", name: "Roey", color: "#2a5fa8" },
};

function subagentRun(): SubagentRunEventRecord {
  return {
    filename: "20260705T100000Z_us-abcd.subagent-run.json",
    timestamp: "20260705T100000Z",
    participant_id: USER_ID,
    kind: "subagent-run",
    payload: {
      schema: "fmark.subagent-run.v1",
      parent_participant_id: USER_ID,
      parent_runtime_id: "codex",
      subagent_id: "hook-user-prompt-submit",
      name: "Invoked a hook",
      role: "hook",
      prompt_preview: "Memory Writing Agent",
      status: "completed",
      correlation_id: CORRELATION_ID,
      sequence: 0,
      source: "hook",
      source_confidence: "high",
    },
  };
}

function subagentOutput(): SubagentOutputEventRecord {
  return {
    filename: "20260705T100001Z_us-abcd.subagent-output.json",
    timestamp: "20260705T100001Z",
    participant_id: USER_ID,
    kind: "subagent-output",
    payload: {
      schema: "fmark.subagent-output.v1",
      parent_participant_id: USER_ID,
      parent_runtime_id: "codex",
      subagent_id: "hook-user-prompt-submit",
      name: "Invoked a hook",
      content: FULL_PROMPT,
      status: "completed",
      correlation_id: CORRELATION_ID,
      sequence: 1,
      source: "hook",
      source_confidence: "high",
    },
  };
}

function turnEnd(): AnyEventRecord {
  return {
    filename: "20260705T100002Z_us-abcd.turn-end.json",
    timestamp: "20260705T100002Z",
    participant_id: USER_ID,
    kind: "turn-end",
    payload: { participant_id: USER_ID, source: "hook" },
  };
}

function renderHookInvocation() {
  const events: AnyEventRecord[] = [subagentRun(), subagentOutput(), turnEnd()];
  const agg = aggregate(events);
  const items = projectFeed(agg.feed);
  const view = render(
    <ToolboxAccordionProvider>
      <FeedRows
        items={items}
        freshKeys={new Set()}
        savedAnchor={undefined}
        exitingDots={new Set()}
        participants={PARTICIPANTS}
        agg={agg}
        consumedFilenames={new Set()}
      />
    </ToolboxAccordionProvider>,
  );
  return { ...view, items };
}

afterEach(() => {
  cleanup();
});

describe("hook invocation render pipeline", () => {
  it("renders a hook-attributed user subagent run/output as a folded subagent card, not a user bubble", async () => {
    const { container, items } = renderHookInvocation();

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: "group",
      participant_id: USER_ID,
      status: "ended",
      subagentCount: 1,
    });
    expect(container.querySelector(".msg-card.user")).toBeNull();

    const groupToggle = screen.getByRole("button", { name: /toggle group/i });
    expect(groupToggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".toolbox-body")).toBeNull();

    fireEvent.click(groupToggle);

    expect(await screen.findByText("Invoked a hook")).toBeInTheDocument();
    const subagent = container.querySelector("details.subagent");
    expect(subagent).not.toBeNull();
    expect(subagent).not.toHaveAttribute("open");
    expect(subagent).toHaveAttribute("data-event-kind", "subagent");
    expect(container.querySelector(".msg-card.user")).toBeNull();

    const subagentDetails = subagent as HTMLDetailsElement;
    fireEvent.click(within(subagentDetails).getByText("Invoked a hook"));

    expect(subagentDetails).toHaveAttribute("open");
    expect(within(subagentDetails).getByText(FULL_PROMPT)).toBeInTheDocument();
    expect(within(subagentDetails).getByText("subagent · hook/high")).toBeInTheDocument();
    expect(container.querySelector(".msg-card.user")).toBeNull();
  });
});
