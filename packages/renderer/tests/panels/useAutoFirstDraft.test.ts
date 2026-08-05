/* M12 — a stray empty draft used to reopen after creating the first todo:
   setDraft(null) could land before the loadTodos() reload it belonged to
   had landed, so this effect saw a stale (still-empty) snapshot and
   re-opened a draft. The fix gates the effect on an in-flight-reload ref
   exposed by useTodoTreeLoader (isTodosReloading), rather than trusting
   the todo count alone. This test exercises that gate directly against the
   hook, independent of the DOM event sequence (Enter-triggered blur vs
   mouse-click blur) that happens to expose the race in the app. */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { EMPTY_TODOS } from "../../src/panels/todoPanelUtils.js";
import { useAutoFirstDraft } from "../../src/panels/todoTree/useAutoFirstDraft.js";

afterEach(() => {
  cleanup();
});

function baseProps(overrides: Partial<Parameters<typeof useAutoFirstDraft>[0]> = {}) {
  return {
    currentSessionId: "sess-1",
    actorId: "us-a7f3",
    loadedSessionId: "sess-1",
    loadError: null,
    todos: EMPTY_TODOS,
    draft: null,
    agentIds: [],
    setDraft: vi.fn(),
    isTodosReloading: () => false,
    ...overrides,
  };
}

describe("useAutoFirstDraft", () => {
  test("does not open a draft while a reload is in flight, even with an empty stale snapshot", () => {
    const setDraft = vi.fn();
    renderHook(() =>
      useAutoFirstDraft(
        baseProps({ setDraft, isTodosReloading: () => true }),
      ),
    );
    expect(setDraft).not.toHaveBeenCalled();
  });

  test("opens the first draft once the reload settles on an empty session", () => {
    const setDraft = vi.fn();
    const { rerender } = renderHook(
      (props: Parameters<typeof useAutoFirstDraft>[0]) => useAutoFirstDraft(props),
      { initialProps: baseProps({ setDraft, isTodosReloading: () => true }) },
    );
    expect(setDraft).not.toHaveBeenCalled();

    rerender(baseProps({ setDraft, isTodosReloading: () => false }));
    expect(setDraft).toHaveBeenCalledTimes(1);
  });

  test("does not reopen a draft once the reload lands with a real todo", () => {
    const setDraft = vi.fn();
    const populatedTodos = {
      ...EMPTY_TODOS,
      tree: [
        {
          id: "t1",
          title: "First task",
          status: "open" as const,
          children: [],
        },
      ],
    };
    renderHook(() =>
      useAutoFirstDraft(
        baseProps({
          setDraft,
          draft: null,
          todos: populatedTodos,
          isTodosReloading: () => false,
        }),
      ),
    );
    expect(setDraft).not.toHaveBeenCalled();
  });
});
