/* Tests for the Todos panel — Phase 15 wired the "+ ADD" button (previously a
   disabled stub from Phase 4). Verifies the empty-state copy, the inline
   add-form, and the POST to /sessions/:id/events/todo. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Todos } from "../../src/panels/Todos.js";
import { useStore } from "../../src/state/store.js";
import { jsonResponse, resetStore } from "../cards/_helpers.js";

describe("Todos panel — empty state + add flow", () => {
  beforeEach(() => {
    resetStore();
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/todos")) {
        return jsonResponse({ open: [], wip: [], done: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders the scope subhead with the current slug", async () => {
    render(<Todos />);
    await waitFor(() => {
      const scope = document.querySelector(".scope");
      expect(scope).not.toBeNull();
      expect(scope!.textContent).toContain("launch-planning");
    });
  });

  test("renders the spec empty-state copy", async () => {
    render(<Todos />);
    await waitFor(() => {
      expect(
        screen.getByText(/No todos in/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Click \+ Add\./i),
      ).toBeInTheDocument();
    });
  });

  test("clicking + ADD opens an inline form with title input and Add button", async () => {
    const user = userEvent.setup();
    render(<Todos />);
    const addBtn = screen.getByRole("button", { name: /add a new todo/i });
    expect(addBtn).toBeEnabled();
    await user.click(addBtn);
    expect(
      screen.getByPlaceholderText(/what needs doing/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^cancel$/i }),
    ).toBeInTheDocument();
  });

  test("typing a title and clicking Add posts to /events/todo", async () => {
    const user = userEvent.setup();
    let posted: { url: string; body: unknown } | null = null;
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (
          url.includes("/events/todo") &&
          (init?.method ?? "GET") === "POST"
        ) {
          posted = {
            url,
            body: JSON.parse(String(init?.body ?? "{}")),
          };
          return jsonResponse({ filename: "20260522T120000Z_us-a7f3.todo.json" });
        }
        if (url.includes("/todos")) {
          return jsonResponse({ open: [], wip: [], done: [] });
        }
        return jsonResponse({});
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<Todos />);
    const addBtn = screen.getByRole("button", { name: /add a new todo/i });
    await user.click(addBtn);
    const input = screen.getByPlaceholderText(/what needs doing/i);
    await user.type(input, "Write the polish report");
    const submit = screen.getByRole("button", { name: /^add$/i });
    await user.click(submit);

    await waitFor(() => {
      expect(posted).not.toBeNull();
    });
    expect(posted!.url).toContain(
      "/sessions/2026-05-22-launch-planning/events/todo",
    );
    const body = posted!.body as Record<string, unknown>;
    expect(body.title).toBe("Write the polish report");
    expect(body.status).toBe("open");
    expect(body.participant_id).toBe("us-a7f3");
    expect(typeof body.id).toBe("string");
  });

  test("Escape inside the form cancels (closes the add UI)", async () => {
    const user = userEvent.setup();
    render(<Todos />);
    const addBtn = screen.getByRole("button", { name: /add a new todo/i });
    await user.click(addBtn);
    const input = screen.getByPlaceholderText(/what needs doing/i);
    await user.type(input, "abc");
    await user.keyboard("{Escape}");
    expect(
      screen.queryByPlaceholderText(/what needs doing/i),
    ).not.toBeInTheDocument();
  });

  test("disables the + ADD button when no session or no user is set", () => {
    useStore.setState({ currentSessionId: null });
    render(<Todos />);
    const addBtn = screen.getByRole("button", { name: /add a new todo/i });
    expect(addBtn).toBeDisabled();
  });
});
