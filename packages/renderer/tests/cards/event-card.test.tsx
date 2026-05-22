import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { EventCard } from "../../src/cards/EventCard.js";
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

  test("prose with name → ProseCard (.prose-card with .prose-title)", () => {
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
    expect(container.querySelector(".prose-title")?.textContent).toBe("Spec");
  });

  test("prose with target → null (consumed as pin on the ProseCard)", () => {
    const ev = makeProse(
      "20260522T100200Z_us-a7f3.prose.md",
      "us-a7f3",
      { content: "comment", target: { file: "anchor.md" } },
    );
    const { container } = render(
      <EventCard
        event={ev}
        participants={PARTICIPANTS}
        comments={[]}
        allEvents={[ev]}
      />,
    );
    expect(container.children.length).toBe(0);
  });

  test("choice → null (consumed inside ChoicesCard)", () => {
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
    expect(container.children.length).toBe(0);
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
});
