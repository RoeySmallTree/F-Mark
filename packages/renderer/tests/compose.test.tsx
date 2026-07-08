/* Phase 6 — compose bar + global hotkeys. */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  screen,
  cleanup,
  act,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SkillRef } from "@f-mark/shared";
import { useStore } from "../src/state/store.js";
import {
  createAccessRequestTarget,
  expectAccessRequestFocused,
  expectAccessResponse,
  expectAttachmentDeleted,
  expectAttachmentUploadUrl,
  expectCreateTodoDialogFocused,
  expectEventPostCounts,
  expectFileEventBody,
  expectFileEventCount,
  expectFirstAttachmentUpload,
  expectFirstBodyHasNoProperty,
  expectFirstBodyMatches,
  expectFirstProseBody,
  expectNoEventWrites,
  expectNoProsePost,
  expectPendingApprovalActions,
  expectProseTurnEndWakeOrder,
  expectScopedAssigneeOptions,
  expectTodoAndTurnEndOrder,
  expectTodoBody,
  expectTurnEndAndWake,
  expectWakeBody,
  expectWakeCallCount,
  waitForFetchCalls,
  waitForPostedBodyCount,
} from "./compose/assertions.js";
import {
  installAttachmentDeleteFetch,
  installAttachmentFlowFetch,
  installCreateTodoFetch,
  installJsonFetch,
  installMentionAgentFetch,
  installStagedAttachmentFetch,
  postedBodies,
  requestUrl,
} from "./compose/api.js";
import {
  MOD_CLOSE,
  MOD_OPEN,
  MOCK_SESSION,
  disableMessageEndsTurn,
  makeAccessRequestEvent,
  nestedTodoTree,
  participantsWithOutOfScopeAgents,
  removeMessageEndsTurnSetting,
  resetStore,
  todoListResponse,
} from "./compose/fixtures.js";
import {
  composeInner,
  composeTextarea,
  dragFileIntoCompose,
  dragPathIntoCompose,
  dropFileIntoCompose,
  dropPathIntoCompose,
  flushSubmit,
  mentionClaude,
  openCreateTodo,
  pasteClipboardFileItem,
  pasteFiles,
  submitTodoTitle,
  submitWithModEnter,
  typeComposeMessage,
  waitForChip,
} from "./compose/interactions.js";
import { renderCompose } from "./compose/render.js";

const SKILLS_FOR_COMPOSE: SkillRef[] = [
  {
    source: "/proj/.codex/skills/review-pr",
    agent: "codex",
    name: "review-pr",
    description: "Review a pull request.",
    args: "<pr-url>",
    path: "/proj/.codex/skills/review-pr/SKILL.md",
  },
  {
    source: "/proj/.skills/standup",
    agent: "generic",
    name: "standup",
    description: "Write a standup note.",
    path: "/proj/.skills/standup/SKILL.md",
  },
];

function installSkillsFetch(skills: SkillRef[] = SKILLS_FOR_COMPOSE): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
    const url = requestUrl(input);
    if (url.pathname === "/skills") {
      return new Response(JSON.stringify({ skills }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Compose — mode buttons", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("Name-it chip activates named mode; × cancels back to message", async () => {
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    expect(
      screen.queryByRole("button", { name: /message mode/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /comment mode/i }),
    ).toBeNull();

    // Chip is hidden when the textarea is empty.
    expect(
      screen.queryByRole("button", { name: /name this contribution/i }),
    ).toBeNull();

    // Typing in the textarea reveals the collapsed chip.
    const textarea = screen.getByLabelText(/compose message/i);
    await user.type(textarea, "hello");

    // Collapsed chip → activates named mode.
    const chip = screen.getByRole("button", {
      name: /name this contribution/i,
    });
    expect(chip).toBeInTheDocument();
    await user.click(chip);
    expect(useStore.getState().composeMode).toBe("named");

    // Expanded form has a × cancel button that returns to message mode.
    const cancel = screen.getByRole("button", { name: /cancel naming/i });
    await user.click(cancel);
    expect(useStore.getState().composeMode).toBe("message");
  });
});

describe("Compose — hotkeys", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("⌘N toggles named mode and reveals the name input", async () => {
    const user = userEvent.setup();
    const { container } = renderCompose();

    expect(useStore.getState().composeMode).toBe("message");
    expect(container.querySelector(".name-chip-expanded")).toBeNull();

    await user.keyboard(`${MOD_OPEN}n${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("named");
    expect(container.querySelector(".name-chip-expanded")).not.toBeNull();
    expect(
      screen.getByPlaceholderText(/Name this contribution/i),
    ).toBeInTheDocument();

    // Press ⌘N again → toggles back to message.
    await user.keyboard(`${MOD_OPEN}n${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("message");
    expect(container.querySelector(".name-chip-expanded")).toBeNull();
  });

  test("⌘↵ submits the active mode (calls postProse with right body)", async () => {
    const fetchMock = installJsonFetch({
      filename: "20260522T_us-a7f3.prose.md",
    });
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    await typeComposeMessage(user, "Hello world");

    // ⌘+Enter → submit.
    await submitWithModEnter(user);

    // Allow the async submit promise to resolve.
    await flushSubmit();

    // We removed messageEndsTurn from store so it defaults to true via localStorage read.
    await expectEventPostCounts(fetchMock, {
      "/events/prose": 1,
      "/events/turn-end": 1,
    }, { timeout: 2000 });
    expectFirstProseBody(fetchMock, {
      participant_id: "us-a7f3",
      content: "Hello world",
      path_id: "project-id",
    });
  });

  test("⌘↵ in empty message mode ends the turn without posting prose", async () => {
    const fetchMock = installJsonFetch({ filename: "turn-end" });
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    await submitWithModEnter(user);

    await expectEventPostCounts(fetchMock, {
      "/events/turn-end": 1,
      "/events/prose": 0,
    });
  });

  test("⌘↵ in named mode sends prose with a name", async () => {
    const fetchMock = installJsonFetch();
    const user = userEvent.setup();
    resetStore({ composeMode: "named" });
    renderCompose();

    const nameInput = screen.getByPlaceholderText(/Name this contribution/i);
    await user.click(nameInput);
    await user.type(nameInput, "My Title");

    await typeComposeMessage(user, "named body");

    await submitWithModEnter(user);
    await flushSubmit();

    expect(fetchMock).toHaveBeenCalled();
    expectFirstBodyMatches(fetchMock, {
      name: "My Title",
      content: "named body",
    });
  });

  test("legacy comment compose mode is coerced back to message mode", async () => {
    const fetchMock = installJsonFetch();
    const user = userEvent.setup();
    resetStore({
      commentTarget: { kind: "event", file: "evt.prose.md", lines: [3, 3] },
      composeMode: "comment",
    });
    renderCompose();
    await waitFor(() => {
      expect(useStore.getState().composeMode).toBe("message");
    });

    await typeComposeMessage(user, "plain message");

    await submitWithModEnter(user);
    await flushSubmit();

    expect(fetchMock).toHaveBeenCalled();
    expectFirstBodyMatches(fetchMock, {
      participant_id: "us-a7f3",
      content: "plain message",
      path_id: "project-id",
    });
    expect(useStore.getState().commentTarget).not.toBeNull();
  });

  test("Escape blurs the compose textarea without clearing focused comments", async () => {
    const user = userEvent.setup();
    resetStore({
      commentTarget: { kind: "event", file: "x.prose.md", lines: [1, 1] },
      composeMode: "message",
    });
    renderCompose();
    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    expect(document.activeElement).toBe(ta);
    await user.keyboard("{Escape}");
    expect(document.activeElement).not.toBe(ta);
    expect(useStore.getState().commentTarget).not.toBeNull();
  });
});

describe("Compose — staged attachments", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("pasting a file uploads it as a staged attachment and renders a chip", async () => {
    const file = new File(["image-bytes"], "screenshot.png", {
      type: "image/png",
    });
    const fetchMock = installStagedAttachmentFetch({
      id: "att_aaaa00000001",
      displayName: "screenshot.png",
    });
    renderCompose();

    const textarea = composeTextarea();
    const event = pasteFiles(textarea, [file]);
    expect(event.defaultPrevented).toBe(true);

    await waitForFetchCalls(fetchMock, 1);
    expectFirstAttachmentUpload(fetchMock, file, "screenshot.png");

    await waitForChip("screenshot.png");
    /* The file is NOT typed into the textarea. */
    expect(textarea.value).toBe("");
    /* No prose or file event is written on paste. */
    expectNoEventWrites(fetchMock);
  });

  test("clipboard image items (rather than DataTransfer.files) also stage", async () => {
    const file = new File(["png"], "image.png", { type: "image/png" });
    const fetchMock = installStagedAttachmentFetch({
      id: "att_bbbb00000002",
      displayName: "image.png",
    });
    renderCompose();

    pasteClipboardFileItem(composeTextarea(), file);

    await waitForFetchCalls(fetchMock, 1);
    expectFirstAttachmentUpload(fetchMock, file, "image.png");
    await waitForChip("image.png");
  });

  test("upload failures show in the composer alert instead of the chip size line", async () => {
    const file = new File(["oversized"], "huge.png", { type: "image/png" });
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ error: "request body too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderCompose();

    pasteFiles(composeTextarea(), [file]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("huge.png");
    expect(alert).toHaveTextContent("request body too large");
    const chip = container.querySelector(".compose-attachment");
    expect(chip).toHaveTextContent("huge.png");
    expect(chip).toHaveTextContent("9 B");
    expect(chip).not.toHaveTextContent("request body too large");
  });

  test("removing a staged chip DELETEs the staged upload", async () => {
    const file = new File(["x"], "doc.txt", { type: "text/plain" });
    const fetchMock = installAttachmentDeleteFetch({
      id: "att_cccc00000003",
      displayName: "doc.txt",
      mimeType: "text/plain",
      previewKind: "text",
      sizeBytes: 1,
    });
    const user = userEvent.setup();
    renderCompose();

    pasteFiles(composeTextarea(), [file]);
    await waitForChip("doc.txt");

    await user.click(screen.getByRole("button", { name: /remove doc\.txt/i }));

    await expectAttachmentDeleted(fetchMock, "att_cccc00000003");
    expect(screen.queryByText("doc.txt")).toBeNull();
  });

  test("send with prose + attachment writes prose then file event with append_to", async () => {
    const file = new File(["x"], "shot.png", { type: "image/png" });
    const proseFilename = "20260524T120000Z_us-a7f3.prose.md";
    const fetchMock = installAttachmentFlowFetch({
      attachment: {
        id: "att_dddd00000004",
        displayName: "shot.png",
        sizeBytes: 1,
      },
      proseFilename,
      fileFilename: "20260524T120001Z_us-a7f3.file.json",
    });
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    pasteFiles(composeTextarea(), [file]);
    await waitForChip("shot.png");

    await typeComposeMessage(user, "look at this");
    await submitWithModEnter(user);

    await expectFileEventCount(fetchMock, 1);
    expectFirstProseBody(fetchMock, {
      participant_id: "us-a7f3",
      content: "look at this",
      path_id: "project-id",
    });
    expectFileEventBody(fetchMock, {
      id: "att_dddd00000004",
      append_to: proseFilename,
      display_name: "shot.png",
      preview_kind: "image",
    });
  });

  test("send attachments-only writes standalone file event (no prose, no append_to)", async () => {
    const file = new File(["x"], "lone.png", { type: "image/png" });
    const fetchMock = installAttachmentFlowFetch({
      attachment: {
        id: "att_eeee00000005",
        displayName: "lone.png",
        sizeBytes: 1,
      },
    });
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    pasteFiles(composeTextarea(), [file]);
    await waitForChip("lone.png");

    await user.click(composeTextarea());
    await submitWithModEnter(user);

    await expectFileEventCount(fetchMock, 1);
    expectNoProsePost(fetchMock);

    const fileBody = postedBodies(fetchMock, "/events/file")[0]!;
    expect(fileBody.id).toBe("att_eeee00000005");
    expect(fileBody.append_to).toBeUndefined();
  });

  test("drag over compose-inner shows overlay; drop stages the file", async () => {
    const file = new File(["x"], "dropped.png", { type: "image/png" });
    const fetchMock = installStagedAttachmentFetch({
      id: "att_ffff00000006",
      displayName: "dropped.png",
    });
    const { container } = renderCompose();
    const inner = composeInner(container);

    dragFileIntoCompose(inner, file);
    expect(inner.className).toContain("is-dragging-files");
    expect(screen.getByText(/drop to attach/i)).toBeInTheDocument();

    dropFileIntoCompose(inner, file);
    expect(inner.className).not.toContain("is-dragging-files");

    await waitForFetchCalls(fetchMock, 1);
    expectAttachmentUploadUrl(fetchMock);
  });

  test("dragging an in-app file path over compose switches to paste-path mode", () => {
    const path = "/workspace/F-Mark/packages/renderer/src/compose/Compose.tsx";
    const { container } = renderCompose();
    const inner = composeInner(container);
    const textarea = composeTextarea();

    dragPathIntoCompose(inner, path);
    expect(inner).toHaveAttribute("data-drag-mode", "fmark-path");
    expect(screen.getByText(/drop to paste path/i)).toBeInTheDocument();
    expect(textarea.placeholder).toBe("Drop to paste path");

    dropPathIntoCompose(inner, path);
    expect(textarea.value).toBe(path);
    expect(inner).not.toHaveAttribute("data-drag-mode");
  });

  test("clicking the Attach button opens a file picker", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCompose();

    const inputs = document.querySelectorAll("input[type='file']");
    expect(inputs.length).toBeGreaterThan(0);
    const fileInput = inputs[0] as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    await user.click(screen.getByRole("button", { name: /attach a file/i }));

    expect(clickSpy).toHaveBeenCalled();
  });
});

describe("Compose — send button label per mode", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("message mode: empty content → End turn; typed content → Send", async () => {
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    const { container } = renderCompose();
    const endOnly = container.querySelector(".primary-action") as HTMLElement;
    expect(endOnly).toBeTruthy();
    expect(endOnly).toHaveAttribute("data-state", "end-turn");
    expect(endOnly).toHaveAccessibleName(/End turn/i);

    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    await user.type(ta, "hi");

    const send = container.querySelector(".primary-action") as HTMLElement;
    expect(send).toBeTruthy();
    expect(send).toHaveAttribute("data-state", "send");
    expect(send).toHaveAccessibleName(/Send message/i);
  });

  test("settings popover is accessible from compose actions", async () => {
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    const { container } = renderCompose();
    const settingsBtn = container.querySelector("button[title='Compose settings']") as HTMLElement;
    expect(settingsBtn).toBeTruthy();
  });

  test("named mode shows 'End turn' as primary action", () => {
    resetStore({ composeMode: "named" });
    const { container } = renderCompose();
    const send = container.querySelector(".primary-action") as HTMLButtonElement;
    expect(send).toHaveAttribute("data-state", "end-turn");
    expect(send).toHaveAccessibleName(/End turn with named contribution/i);
    expect(send).toHaveTextContent(/End turn/i);
  });

  test("comment mode falls back to the message action", async () => {
    resetStore({
      commentTarget: { kind: "event", file: "x.prose.md", lines: [1, 1] },
      composeMode: "comment",
    });
    const { container } = renderCompose();
    await waitFor(() => {
      expect(useStore.getState().composeMode).toBe("message");
    });
    const send = container.querySelector(".primary-action") as HTMLButtonElement;
    expect(send).toHaveAttribute("data-state", "end-turn");
    expect(send).toHaveAccessibleName(/End turn/i);
  });
});

describe("Compose — pending approval actions", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("renders pending approval as inline actions instead of a dropdown menu", () => {
    resetStore({
      events: [
        makeAccessRequestEvent({
          suggestions: [
            { id: "yes", label: "Yes", decision: "approve", scope: "once" },
            {
              id: "allow-session",
              label: "Yes, and allow access to .bin/ and timeout 10 commands",
              decision: "approve",
              scope: "session",
            },
            { id: "no", label: "No", decision: "deny", scope: "once" },
          ],
        }),
      ],
    });

    const { container } = renderCompose();

    expectPendingApprovalActions(container);
  });

  test("show request focuses the request and provider choices use the response API", async () => {
    const user = userEvent.setup();
    const fetchMock = installJsonFetch({ ok: true });
    const target = createAccessRequestTarget();
    resetStore({
      events: [
        makeAccessRequestEvent({
          suggestions: [
            {
              id: "allow-session",
              label: "Yes, and allow for this session",
              decision: "approve",
              scope: "session",
            },
            { id: "no", label: "No", decision: "deny" },
          ],
        }),
      ],
    });

    renderCompose();

    await user.click(screen.getByRole("button", { name: /show the request/i }));
    expectAccessRequestFocused(target);

    await user.click(screen.getByRole("button", { name: /^Allow/i }));

    await waitForFetchCalls(fetchMock, 1);
    expectAccessResponse(fetchMock, {
      decision: "approve",
      option_id: "allow-session",
    });
    target.remove();
  });

  test("falls back to direct Approve and Deny buttons when provider options are absent", async () => {
    const user = userEvent.setup();
    const fetchMock = installJsonFetch({ ok: true });
    resetStore({ events: [makeAccessRequestEvent()] });

    renderCompose();

    expect(screen.getByRole("button", { name: /^Allow/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cancel this tool call/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel this tool call/i }));

    await waitForFetchCalls(fetchMock, 1);
    expectFirstBodyMatches(fetchMock, {
      decision: "deny",
    });
    expectFirstBodyHasNoProperty(fetchMock, "option_id");
  });
});

describe("Compose — focused comment target", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("does not render a compose TargetPill when commentTarget is set", () => {
    resetStore({
      commentTarget: { kind: "event", file: "evt.prose.md", lines: [3, 5] },
      composeMode: "message",
    });
    const { container } = renderCompose();
    expect(container.querySelector(".compose-target")).toBeNull();
    expect(useStore.getState().commentTarget).not.toBeNull();
  });
});

describe("Compose — Create Todo", () => {
  beforeEach(() => {
    removeMessageEndsTurnSetting();
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    removeMessageEndsTurnSetting();
  });

  test("clicking Create Todo opens a focused create form", async () => {
    const user = userEvent.setup();
    installCreateTodoFetch();
    renderCompose();

    await openCreateTodo(user);

    await expectCreateTodoDialogFocused();
  });

  test("assignee options are scoped to current-session agents", async () => {
    const user = userEvent.setup();
    installCreateTodoFetch();
    resetStore({
      participants: participantsWithOutOfScopeAgents(),
    });
    renderCompose();

    await openCreateTodo(user);

    expectScopedAssigneeOptions();
  });

  test("loads and creates tasks in the selected project root", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    resetStore({
      sessions: [
        {
          ...MOCK_SESSION,
          path: "/workspace/active",
          path_id: "active-root-id",
        },
        {
          ...MOCK_SESSION,
          path: "/workspace/selected",
          path_id: "selected-root-id",
        },
      ],
      activePath: "/workspace/active",
      activePathId: "active-root-id",
      selectedPath: "/workspace/selected",
      selectedPathId: "selected-root-id",
    });
    renderCompose();

    await openCreateTodo(user);

    await waitFor(() => {
      const loadCall = fetchMock.mock.calls.find(([input, init]) => {
        const url = requestUrl(input);
        return (
          (init as RequestInit | undefined)?.method === undefined &&
          url.pathname === `/sessions/${MOCK_SESSION.id}/todos`
        );
      });
      expect(loadCall).toBeTruthy();
      expect(requestUrl(loadCall![0]).searchParams.get("path_id")).toBe(
        "selected-root-id",
      );
    });

    await submitTodoTitle(user, "Scoped task");

    await waitForPostedBodyCount(fetchMock, "/events/todo", 1);
    expectTodoBody(fetchMock, {
      title: "Scoped task",
      path_id: "selected-root-id",
    });
  });

  test("loads task roots from the current session root after a local session refresh", async () => {
    const user = userEvent.setup();
    const sessionId = "2026-06-24-blocked-multi-tool";
    const cabalSession = {
      id: sessionId,
      slug: "blocked-multi-tool",
      created_at: "2026-06-24T07:00:00Z",
      path: "/home/roey/workspace/CABAL/cabal-be",
      path_id: "cabal-path-id",
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = init?.method ?? "GET";
        if (
          method === "GET" &&
          url.pathname === `/sessions/${sessionId}/todos`
        ) {
          return jsonResponse(todoListResponse([]));
        }
        return jsonResponse({});
      });
    vi.stubGlobal("fetch", fetchMock);
    resetStore({
      sessions: [cabalSession],
      currentSessionId: sessionId,
      participants: {
        "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
        "ag-cabal": {
          kind: "agent",
          name: "Claude",
          color: "#b86a1f",
          active_session: sessionId,
        },
      },
      activePath: "/home/roey/workspace/F-Mark",
      activePathId: "fmark-path-id",
      selectedPath: "/home/roey/workspace/F-Mark",
      selectedPathId: "fmark-path-id",
    });
    useStore.getState().setSessions([
      {
        id: "2026-06-24-fmark-session",
        slug: "fmark-session",
        created_at: "2026-06-24T08:00:00Z",
      },
    ]);
    renderCompose();

    await openCreateTodo(user);

    await waitFor(() => {
      const loadCall = fetchMock.mock.calls.find(([input, init]) => {
        const url = requestUrl(input);
        return (
          (init as RequestInit | undefined)?.method === undefined &&
          url.pathname === `/sessions/${sessionId}/todos`
        );
      });
      expect(loadCall).toBeTruthy();
      expect(requestUrl(loadCall![0]).searchParams.get("path_id")).toBe(
        "cabal-path-id",
      );
    });
  });

  test("submitting with an empty title is rejected by the disabled create button", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    renderCompose();

    await openCreateTodo(user);

    expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled();
    expect(postedBodies(fetchMock, "/events/todo")).toHaveLength(0);
  });

  test("submitting title only posts an open todo assigned to a random agent", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    renderCompose();

    await openCreateTodo(user);
    await submitTodoTitle(user, "Ship the fix");

    await waitForPostedBodyCount(fetchMock, "/events/todo", 1);
    const body = postedBodies(fetchMock, "/events/todo")[0]!;
    expect(body).toMatchObject({
      participant_id: "us-a7f3",
      title: "Ship the fix",
      status: "open",
      assigned_to: "ag-c92e",
    });
    expect(body.id).toMatch(/^td-/);
    expect(body).not.toHaveProperty("body");
    expect(body).not.toHaveProperty("parent_id");
  });

  test("selecting a parent submits parent_id and preserves tree indentation in the dropdown", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch(nestedTodoTree());
    renderCompose();

    await openCreateTodo(user);
    const parentSelect = screen.getByLabelText(/^parent$/i);
    await waitFor(() => expect(parentSelect).not.toBeDisabled());
    expect(
      screen.getByRole("option", { name: /··· Child task/i }),
    ).toBeInTheDocument();
    await user.selectOptions(parentSelect, "parent");
    await submitTodoTitle(user, "Child work");

    await waitForPostedBodyCount(fetchMock, "/events/todo", 1);
    expectTodoBody(fetchMock, {
      parent_id: "parent",
    });
  });

  test("selecting Unassigned submits without assigned_to", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    renderCompose();

    await openCreateTodo(user);
    await user.selectOptions(screen.getByLabelText(/^assignee$/i), "");
    await submitTodoTitle(user, "Unowned task");

    await waitForPostedBodyCount(fetchMock, "/events/todo", 1);
    expect(postedBodies(fetchMock, "/events/todo")[0]).not.toHaveProperty(
      "assigned_to",
    );
  });

  test("in message mode with ends-turn on, create is followed by turn-end", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    resetStore({ composeMode: "message" });
    renderCompose();

    await openCreateTodo(user);
    await submitTodoTitle(user, "End with task");

    await expectTodoAndTurnEndOrder(fetchMock);
  });

  test("outside message mode, create does not end the turn", async () => {
    const user = userEvent.setup();
    const fetchMock = installCreateTodoFetch();
    resetStore({ composeMode: "named" });
    renderCompose();

    await openCreateTodo(user);
    await submitTodoTitle(user, "Named task");

    await waitForPostedBodyCount(fetchMock, "/events/todo", 1);
    await expectEventPostCounts(fetchMock, { "/events/turn-end": 0 });
  });

  test("Escape closes the create todo popover", async () => {
    const user = userEvent.setup();
    installCreateTodoFetch();
    renderCompose();

    await openCreateTodo(user);
    expect(
      screen.getByRole("dialog", { name: /create todo/i }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /create todo/i }),
      ).toBeNull();
    });
  });
});

describe("Compose — wake-on-send gating", () => {
  beforeEach(() => {
    removeMessageEndsTurnSetting();
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    removeMessageEndsTurnSetting();
  });

  test("Send with messageEndsTurn off and no mentions does NOT call wake", async () => {
    disableMessageEndsTurn();
    const fetchMock = installJsonFetch();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    await typeComposeMessage(user, "still drafting");
    await submitWithModEnter(user);

    await waitForPostedBodyCount(fetchMock, "/events/prose", 1);
    /* prose posted; turn-end NOT posted; wake NOT called. */
    await expectEventPostCounts(fetchMock, { "/events/turn-end": 0 });
    await expectWakeCallCount(fetchMock, 0);
  });

  test("Send with messageEndsTurn off but a mention still wakes the mentioned agent", async () => {
    disableMessageEndsTurn();
    /* The mention picker fetches /managed-agents/status?session_id=… and
       filters by `active_session === sessionId && managed`. Return one
       Claude row so the popover shows a clickable option. */
    const fetchMock = installMentionAgentFetch();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    await mentionClaude(user);

    await typeComposeMessage(user, "heads up");
    await submitWithModEnter(user);

    await expectWakeCallCount(fetchMock, 1);
    expectWakeBody(fetchMock, {
      reason: "mention",
      target_participant_ids: expect.arrayContaining(["ag-c92e"]),
    });
  });

  test("Send with messageEndsTurn on (default) calls wake with reason 'user-message'", async () => {
    /* Default localStorage state means messageEndsTurn = true. */
    const fetchMock = installJsonFetch();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    await typeComposeMessage(user, "done thinking");
    await submitWithModEnter(user);

    await expectWakeCallCount(fetchMock, 1);
    await expectProseTurnEndWakeOrder(fetchMock);
    expectWakeBody(fetchMock, { reason: "user-message" });
  });

  test("End Turn hotkey ⌘↵ with empty draft calls wake", async () => {
    /* messageEndsTurn doesn't matter here — the empty-draft branch wakes
       unconditionally on End Turn intent. */
    disableMessageEndsTurn();
    const fetchMock = installJsonFetch();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    /* No textarea content → ⌘↵ triggers the empty-content End Turn branch. */
    await submitWithModEnter(user);

    await expectTurnEndAndWake(fetchMock);
    expectWakeBody(fetchMock, { reason: "user-message" });
  });

  test("End Turn button click with empty draft also calls wake", async () => {
    /* The visible primary End-Turn button must produce the same wake as
       the hotkey path — both should route through endTurnAndWake. */
    disableMessageEndsTurn();
    const fetchMock = installJsonFetch();
    const user = userEvent.setup();
    resetStore({ composeMode: "message" });
    renderCompose();

    /* Empty draft → the primary action renders as "End turn". */
    const endTurnButton = screen.getByRole("button", { name: /^End turn$/i });
    await user.click(endTurnButton);

    await expectTurnEndAndWake(fetchMock);
    expectWakeBody(fetchMock, { reason: "user-message" });
  });
});

describe("useHotkeys — focus suppression", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  test("⌘N still fires while focus is in textarea (chord uses $mod)", async () => {
    const user = userEvent.setup();
    renderCompose();
    const ta = screen.getByLabelText(/Compose message/i);
    await user.click(ta);
    expect(document.activeElement).toBe(ta);
    await user.keyboard(`${MOD_OPEN}n${MOD_CLOSE}`);
    expect(useStore.getState().composeMode).toBe("named");
  });
});

describe("Compose — Presets (P8)", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("clicking the ⚡ Presets button opens the presets popover via the store", async () => {
    const user = userEvent.setup();
    renderCompose();
    expect(useStore.getState().activePopover.key).toBeNull();
    await user.click(screen.getByRole("button", { name: /Open presets/i }));
    expect(useStore.getState().activePopover.key).toBe("presets");
    expect(useStore.getState().activePopover.anchorRect).not.toBeNull();
  });

  test("⌘P opens the presets popover", async () => {
    const user = userEvent.setup();
    renderCompose();
    expect(useStore.getState().activePopover.key).toBeNull();
    await user.keyboard(`${MOD_OPEN}p${MOD_CLOSE}`);
    expect(useStore.getState().activePopover.key).toBe("presets");
  });

  test("composeDraft populates the textarea when empty (replace)", async () => {
    renderCompose();
    const ta = screen.getByLabelText(/Compose message/i) as HTMLTextAreaElement;
    expect(ta.value).toBe("");
    act(() => {
      useStore.getState().setComposeDraft("Generate 3 variations of this.");
    });
    /* Wait for the useEffect to flush + the queueMicrotask. */
    await act(async () => {
      await Promise.resolve();
    });
    expect(ta.value).toBe("Generate 3 variations of this.");
    /* Draft is cleared so future inserts are detected as new. */
    expect(useStore.getState().composeDraft).toBeNull();
  });

  test("composeDraft appends with a blank line when textarea is non-empty", async () => {
    const user = userEvent.setup();
    renderCompose();
    const ta = screen.getByLabelText(/Compose message/i) as HTMLTextAreaElement;
    await user.click(ta);
    await user.type(ta, "Existing");
    act(() => {
      useStore.getState().setComposeDraft("Preset body.");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(ta.value).toBe("Existing\n\nPreset body.");
  });

  test("composeInsertion inserts inline at the caret without blank lines", async () => {
    const user = userEvent.setup();
    renderCompose();
    const ta = screen.getByLabelText(/Compose message/i) as HTMLTextAreaElement;
    await user.click(ta);
    await user.type(ta, "Alpha beta");
    ta.setSelectionRange(6, 6);
    act(() => {
      useStore.getState().requestComposeInsertion("/standup ");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(ta.value).toBe("Alpha /standup beta");
  });
});

describe("Compose — slash skills popover", () => {
  beforeEach(() => {
    resetStore({
      participants: {
        "ag-codex-active": {
          kind: "agent",
          name: "Codex",
          color: "#3aa6c0",
          runtime_id: "codex",
          active_session: MOCK_SESSION.id,
        },
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  test("Enter selects a skill and replaces the slash word in place", async () => {
    installSkillsFetch();
    const user = userEvent.setup();
    renderCompose();
    const ta = composeTextarea();
    await user.click(ta);
    await user.type(ta, "Please /rev");
    await screen.findByText(/\/review-pr/);

    await user.keyboard("{Enter}");
    expect(ta.value).toBe("Please /review-pr <pr-url>");
    expect(useStore.getState().composeDraft).toBeNull();
  });

  test("clicking inside a slash word reopens and refreshes the skills popover", async () => {
    const fetchMock = installSkillsFetch();
    const user = userEvent.setup();
    renderCompose();
    const ta = composeTextarea();
    await user.click(ta);
    await user.type(ta, "/");
    await screen.findByText(/\/review-pr/);
    const callsAfterType = fetchMock.mock.calls.length;

    await user.keyboard("{Escape}");
    expect(screen.queryByText(/\/review-pr/)).toBeNull();
    ta.setSelectionRange(1, 1);
    fireEvent.click(ta);

    await screen.findByText(/\/review-pr/);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterType);
  });
});
