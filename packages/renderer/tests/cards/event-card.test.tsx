import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyEventRecord, ToolUseEventRecord } from "@f-mark/shared";
import { EventCard } from "../../src/cards/EventCard.js";
import { useStore } from "../../src/state/store.js";
import {
  PARTICIPANTS,
  makeChoices,
  makeFile,
  makeHtml,
  makeProse,
  makeTodo,
  makeTurnEnd,
  resetStore,
} from "./_helpers.js";

describe("EventCard dispatcher", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("prose with no name + no target → MessageCard (.msg-card)", () => {
    const ev = makeProse(
      "20260522T100000Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "hi" },
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.querySelector(".msg-card")).not.toBeNull();
    expect(container.querySelector(".prose-card")).toBeNull();
  });

  test("prose with name → ProseCard (.prose-card with .prose-title-name)", () => {
    const ev = makeProse(
      "20260522T100100Z_us-a7f3.prose.md",
      "us-a7f3",
      { name: "Spec", content: "body" },
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.querySelector(".prose-card")).not.toBeNull();
    expect(container.querySelector(".prose-title-name")?.textContent).toBe(
      "Spec",
    );
  });

  test("prose with target → compact comment activity", () => {
    const anchor = makeProse(
      "20260522T100100Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Spec", content: "line one\nline two" },
    );
    const ev = makeProse(
      "20260522T100200Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "comment",
        append_to: anchor.filename,
        mode: "comment",
        lines: [2, 2],
      },
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[anchor, ev]}
      />,
    );
    expect(container.querySelector(".comment-activity-card")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /you commented on spec/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Spec/)).toBeInTheDocument();
    expect(screen.getByText(/line 2/i)).toBeInTheDocument();
  });

  test("clicking comment activity opens the right comments focus", async () => {
    const user = userEvent.setup();
    const anchor = makeProse(
      "20260522T100100Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Spec", content: "line one\nline two" },
    );
    const ev = makeProse(
      "20260522T100200Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: "comment",
        append_to: anchor.filename,
        mode: "comment",
        lines: [2, 2],
      },
    );
    render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[anchor, ev]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /you commented on spec/i }));
    expect(useStore.getState().commentTarget).toEqual({
      kind: "event",
      file: anchor.filename,
      lines: [2, 2],
    });
    expect(useStore.getState().focusedCommentId).toBe(ev.filename);
    expect(useStore.getState().rightTab).toBe("comments");
  });

  test("choice → ChoiceCard (answer summary; reached via the conversation feed)", () => {
    const ev = {
      filename: "20260522T100300Z_us-a7f3.choice.json",
      timestamp: "20260522T100300Z",
      participant_id: "us-a7f3",
      kind: "choice" as const,
      payload: { choices_id: "x", selected: ["a"] },
    };
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.querySelector('[data-event-kind="choice"]')).not.toBeNull();
    expect(container.textContent).toContain("Chose");
  });

  test("choices → ChoicesCard", () => {
    const ev = makeChoices(
      "20260522T100400Z_ag-c92e.choices.json",
      "ag-c92e",
      {
        id: "q",
        question: "Pick",
        options: [{ id: "a", label: "A" }],
        multi: false,
      },
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.querySelector(".choices-card")).not.toBeNull();
  });

  test("html → EmbedCard", () => {
    const ev = makeHtml(
      "20260522T100500Z_ag-c92e.html",
      "ag-c92e",
      { id: "demo", title: "Demo" },
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.querySelector(".embed-card")).not.toBeNull();
  });

  test("todo → TodoCard", () => {
    const ev = makeTodo(
      "20260522T100600Z_us-a7f3.todo.json",
      "us-a7f3",
      { id: "t", title: "do", status: "open" },
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.querySelector(".todo-card")).not.toBeNull();
  });

  test("file → FileCard", () => {
    const ev = makeFile(
      "20260522T100700Z_us-a7f3.file.json",
      "us-a7f3",
      { id: "f1", path: "assets/note.txt", mime_type: "text/plain" },
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.querySelector(".file-card")).not.toBeNull();
  });

  test("turn-end → TurnEndDivider", () => {
    const ev = makeTurnEnd(
      "20260522T100800Z_ag-c92e.turn-end.json",
      "ag-c92e",
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.querySelector(".turn-end")).not.toBeNull();
  });

  test("tool-use → ToolUseCard", () => {
    const ev: ToolUseEventRecord = {
      filename: "20260523T100000Z_ag-claude.tool-use.json",
      timestamp: "20260523T100000Z",
      participant_id: "ag-claude",
      kind: "tool-use",
      payload: {
        tool_name: "Bash",
        tool_use_id: "tu_1",
        input: { command: "ls -la" },
        result: "total 0\n",
        success: true,
      },
    };
    render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(screen.getByText("Bash", { selector: ".tool-type" })).toBeInTheDocument();
  });

  test("consumed-block early-out: event whose filename is in consumedFilenames returns null", () => {
    /* Even a kind that would normally render (named prose anchor here)
       must return null when its filename is in the consumed set —
       the dispatcher's early-out runs BEFORE the role-based switch. */
    const ev = makeProse(
      "20260522T101000Z_ag-c92e.prose.md",
      "ag-c92e",
      { name: "Should be hidden", content: "body" },
    );
    const consumed = new Set([ev.filename]);
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
        consumedFilenames={consumed}
      />,
    );
    expect(container.children.length).toBe(0);
  });

  test("consumed-block early-out applies to non-prose kinds too (flow embedded inside anchor)", () => {
    const ev: AnyEventRecord = {
      filename: "20260522T101100Z_ag-c92e.flow.json",
      timestamp: "20260522T101100Z",
      participant_id: "ag-c92e",
      kind: "flow",
      payload: { id: "fl1", nodes: [], edges: [] },
    };
    const consumed = new Set([ev.filename]);
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
        consumedFilenames={consumed}
      />,
    );
    expect(container.children.length).toBe(0);
  });
});
