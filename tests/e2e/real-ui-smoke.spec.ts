import { expect, test, type Page, type Route } from "@playwright/test";

type Participant = {
  kind: "user" | "agent" | "sys";
  name: string;
  color: string;
  runtime_id?: string;
  active_session?: string | null;
};

type Session = {
  id: string;
  slug: string;
  created_at: string;
  path?: string;
  path_id?: string;
};

type EventRecord = {
  filename: string;
  timestamp: string;
  participant_id: string;
  kind: string;
  payload: Record<string, unknown>;
};

type MockState = {
  sessions: Session[];
  participants: Record<string, Participant>;
  eventsBySession: Record<string, EventRecord[]>;
  agentStatuses?: unknown[];
  envRuntimes?: Record<string, boolean>;
};

const now = "2026-06-09T12:00:00.000Z";
const pathState = {
  activePath: "/tmp/fmark-real-ui",
  activePathId: "path-realui",
  activeRevision: 1,
  knownPaths: ["/tmp/fmark-real-ui"],
  favorites: [],
};

const user = {
  kind: "user" as const,
  name: "You",
  color: "#2563eb",
};

const agent = {
  kind: "agent" as const,
  name: "Claude",
  color: "#b45309",
  runtime_id: "claude",
  active_session: "s-main",
};

function makeSession(id: string, slug: string): Session {
  return {
    id,
    slug,
    created_at: now,
    path: pathState.activePath,
    path_id: pathState.activePathId,
  };
}

function mainEvents(): EventRecord[] {
  return [
    {
      filename: "20260609T120000Z_user.prose.json",
      timestamp: "2026-06-09T12:00:00.000Z",
      participant_id: "user-main",
      kind: "prose",
      payload: {
        content: "Please inspect the project status.",
      },
    },
    {
      filename: "20260609T120010Z_ag-tool.tool-use.json",
      timestamp: "2026-06-09T12:00:10.000Z",
      participant_id: "ag-claude",
      kind: "tool-use",
      payload: {
        tool_name: "Bash",
        tool_use_id: "tool-bash-1",
        input: {
          description: "List the repo root",
          command: "ls -la",
        },
        result: {
          stdout: "package.json\npackages\nplanning\n",
          stderr: "dry-run warning\n",
        },
        success: false,
        duration_ms: 642,
      },
    },
    {
      filename: "20260609T120020Z_ag-access.access-request.json",
      timestamp: "2026-06-09T12:00:20.000Z",
      participant_id: "ag-claude",
      kind: "access-request",
      payload: {
        schema: "fmark.access-request.v1",
        request_id: "req-edit-1",
        status: "open",
        request_type: "permission",
        runtime_id: "claude",
        runtime_session_id: "claude-session-1",
        hook_event_name: "PermissionRequest",
        title: "Edit access request",
        message: "Allow Claude to edit planning/chat-issues-mitigation-tasks.md?",
        tool_name: "Edit",
        tool_input: {
          file_path: "planning/chat-issues-mitigation-tasks.md",
          old_string: "old",
          new_string: "new",
        },
        permission_mode: "ask",
        response_channel: "hook",
        created_at: now,
      },
    },
  ];
}

function terminalApprovalEvents(): EventRecord[] {
  return [
    {
      filename: "20260609T120000Z_ag-codex.access-request.json",
      timestamp: "2026-06-09T12:00:00.000Z",
      participant_id: "ag-codex",
      kind: "access-request",
      payload: {
        schema: "fmark.access-request.v1",
        request_id: "req-terminal-1",
        status: "open",
        request_type: "command",
        runtime_id: "codex",
        runtime_session_id: "codex-pane-1",
        hook_event_name: "TerminalPermissionPrompt",
        title: "Bash command",
        message: "Do you want to proceed?",
        command: "timeout 10 ./node_modules/.bin/tsx src/index.ts mcp",
        response_channel: "terminal",
        suggestions: [
          {
            id: "terminal:1",
            label: "Yes",
            decision: "approve",
            terminal_input: "1",
          },
          {
            id: "terminal:2",
            label: "Yes, and allow access to .bin/ and timeout 10 commands",
            decision: "approve",
            terminal_input: "2",
          },
          {
            id: "terminal:3",
            label: "No",
            decision: "deny",
            terminal_input: "3",
          },
        ],
        created_at: now,
      },
    },
  ];
}

async function installApiMocks(
  page: Page,
  initial: MockState,
): Promise<{
  accessResponses: unknown[];
  spawnRequests: unknown[];
  forkRequests: unknown[];
}> {
  const state: MockState = {
    ...initial,
    sessions: [...initial.sessions],
    participants: { ...initial.participants },
    eventsBySession: { ...initial.eventsBySession },
  };
  const accessResponses: unknown[] = [];
  const spawnRequests: unknown[] = [];
  const forkRequests: unknown[] = [];

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    const fulfillJson = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (method === "GET" && path === "/paths") {
      return fulfillJson(pathState);
    }
    if (method === "GET" && path === "/sessions") {
      return fulfillJson({ sessions: state.sessions });
    }
    if (method === "GET" && path === "/participants") {
      return fulfillJson({ participants: state.participants });
    }
    if (method === "GET" && path === "/health") {
      return fulfillJson({
        status: "ok",
        version: "real-ui-test",
        processApiEnabled: true,
      });
    }
    if (method === "GET" && path === "/managed-agents") {
      return fulfillJson({ agents: [], terminals: [] });
    }
    if (method === "GET" && path === "/managed-agents/status") {
      return fulfillJson({ agents: state.agentStatuses ?? [] });
    }
    if (method === "GET" && path === "/env-probe") {
      return fulfillJson({
        os: "linux",
        shell: "zsh",
        tmux: true,
        runtimes: state.envRuntimes ?? {
          claude: true,
          codex: true,
          opencode: true,
        },
      });
    }
    if (method === "GET" && /^\/sessions\/[^/]+\/events$/.test(path)) {
      const sessionId = decodeURIComponent(path.split("/")[2] ?? "");
      return fulfillJson({ events: state.eventsBySession[sessionId] ?? [] });
    }
    if (method === "GET" && /^\/sessions\/[^/]+\/todos$/.test(path)) {
      return fulfillJson({ open: [], wip: [], done: [], tree: [] });
    }
    if (
      method === "POST" &&
      /^\/managed-agents\/[^/]+\/access-requests\/[^/]+\/respond$/.test(path)
    ) {
      accessResponses.push(route.request().postDataJSON());
      return fulfillJson({ delivered: true });
    }
    if (method === "POST" && path === "/managed-agents/preflight") {
      return fulfillJson({
        runtime: { id: "opencode", available: true },
        mcp: { status: "installed" },
        hooks: { status: "installed" },
      });
    }
    if (method === "POST" && path === "/managed-agents/spawn") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      spawnRequests.push(body);
      const participantId =
        typeof body.suggested_participant_id === "string"
          ? body.suggested_participant_id
          : "ag-opencode-e2e";
      return fulfillJson({
        participant_id: participantId,
        tmux_session: "fmark-opencode-e2e",
        runtime_id: body.runtime_id ?? "opencode",
        active_session: body.session_id ?? "s-empty",
        hooks_status: "installed",
      });
    }
    if (method === "PATCH" && /^\/participants\/[^/]+$/.test(path)) {
      return fulfillJson({
        id: decodeURIComponent(path.split("/")[2] ?? ""),
        kind: "agent",
        name: "Opencode",
        color: "#14b8a6",
      });
    }
    if (method === "POST" && /^\/sessions\/[^/]+\/fork$/.test(path)) {
      const sourceSessionId = decodeURIComponent(path.split("/")[2] ?? "");
      const body = route.request().postDataJSON() as { name?: string };
      forkRequests.push(body);
      const slug = body.name?.trim() || "fork";
      const session = makeSession("s-forked", slug);
      state.sessions = [...state.sessions, session];
      state.eventsBySession[session.id] = [
        {
          filename: "20260609T121000Z_sys-fork.fork-link.json",
          timestamp: "2026-06-09T12:10:00.000Z",
          participant_id: "sys-fork",
          kind: "fork-link",
          payload: {
            schema: "fmark.fork-link.v1",
            direction: "from",
            other_session_id: sourceSessionId,
            other_session_slug:
              state.sessions.find((s) => s.id === sourceSessionId)?.slug ??
              sourceSessionId,
          },
        },
      ];
      return fulfillJson({
        source_session_id: sourceSessionId,
        session,
        copied_entries: 3,
        agents: [],
        warnings: [],
      });
    }

    return route.continue();
  });

  return { accessResponses, spawnRequests, forkRequests };
}

test("renders tool and access-request cards with live approval controls", async ({
  page,
}) => {
  const { accessResponses } = await installApiMocks(page, {
    sessions: [makeSession("s-main", "main")],
    participants: {
      "user-main": user,
      "ag-claude": agent,
      "sys-fork": { kind: "sys", name: "Fork", color: "#71717a" },
    },
    eventsBySession: { "s-main": mainEvents() },
    agentStatuses: [
      {
        participant_id: "ag-claude",
        runtime_id: "claude",
        tmux_session: "claude-main",
        runtime_session: "claude-session-1",
        connection_state: "connected",
        activity_state: "access-pending",
        paused: false,
        access: { mode: "ask" },
        context: { mode: "project" },
      },
    ],
  });

  await page.goto("/");

  const tool = page.locator(".tool-use-card");
  await expect(tool).toContainText("Bash");
  await expect(tool).toContainText("failed");
  await expect(tool).toContainText("ls -la");
  await expect(tool).toContainText("package.json");

  const request = page.locator(".access-request-card");
  await expect(request).toContainText("Edit access request");
  await expect(request).toContainText("chat-issues-mitigation-tasks.md");
  await expect(request).toContainText("Diff");
  await expect(
    request.getByRole("button", { name: "Approve access request" }),
  ).toBeEnabled();
  await expect(
    request.getByRole("button", { name: "Deny access request" }),
  ).toBeEnabled();

  await request.getByRole("button", { name: "Approve access request" }).click();
  await expect.poll(() => accessResponses.length).toBe(1);
  expect(accessResponses[0]).toMatchObject({
    session_id: "s-main",
    participant_id: "user-main",
    decision: "approve",
  });
});

test("renders terminal approval options and sends the selected provider option", async ({
  page,
}) => {
  const { accessResponses } = await installApiMocks(page, {
    sessions: [makeSession("s-main", "main")],
    participants: {
      "user-main": user,
      "ag-codex": {
        kind: "agent",
        name: "Codex",
        color: "#2563eb",
        runtime_id: "codex",
        active_session: "s-main",
      },
      "sys-fork": { kind: "sys", name: "Fork", color: "#71717a" },
    },
    eventsBySession: { "s-main": terminalApprovalEvents() },
    agentStatuses: [
      {
        participant_id: "ag-codex",
        runtime_id: "codex",
        tmux_session: "codex-pane-1",
        runtime_session: "codex-pane-1",
        connection_state: "connected",
        activity_state: "access-pending",
        paused: false,
        access: { mode: "ask" },
        context: { mode: "project" },
      },
    ],
  });

  await page.goto("/");

  const request = page.locator(".access-request-card");
  await expect(request).toContainText("Bash command");
  await expect(request).toContainText("timeout 10");
  const allowForCommands = request.getByRole("button", {
    name: "Yes, and allow access to .bin/ and timeout 10 commands",
  });
  await expect(allowForCommands).toBeEnabled();

  await allowForCommands.click();
  await expect.poll(() => accessResponses.length).toBe(1);
  expect(accessResponses[0]).toMatchObject({
    session_id: "s-main",
    participant_id: "user-main",
    decision: "approve",
    option_id: "terminal:2",
  });
});

test("forks a session through the real compose popover and focuses the fork", async ({
  page,
}) => {
  const { forkRequests } = await installApiMocks(page, {
    sessions: [makeSession("s-main", "main")],
    participants: {
      "user-main": user,
      "ag-claude": agent,
      "sys-fork": { kind: "sys", name: "Fork", color: "#71717a" },
    },
    eventsBySession: { "s-main": mainEvents() },
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Fork current session" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("main-e2e-fork");
  await page.getByRole("button", { name: "Fork", exact: true }).click();

  await expect.poll(() => forkRequests.length).toBe(1);
  expect(forkRequests[0]).toMatchObject({ name: "main-e2e-fork" });
  await expect(
    page.getByRole("banner").getByText("main-e2e-fork"),
  ).toBeVisible();
  await expect(page.locator(".fork-link-card")).toContainText("main");
});

test("shows Codex and Opencode launch readiness in the empty-session UI", async ({
  page,
}) => {
  const { spawnRequests } = await installApiMocks(page, {
    sessions: [makeSession("s-empty", "empty")],
    participants: {
      "user-main": user,
    },
    eventsBySession: { "s-empty": [] },
    envRuntimes: {
      claude: false,
      codex: true,
      opencode: true,
    },
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Add a coding agent" }),
  ).toBeVisible();
  const codexCard = page
    .locator(".agent-launcher-card")
    .filter({ hasText: "Codex" });
  const opencodeCard = page
    .locator(".agent-launcher-card")
    .filter({ hasText: "Opencode" });
  await expect(codexCard).toContainText("ready");
  await expect(opencodeCard).toContainText("ready");

  await opencodeCard.getByRole("button", { name: "Connect" }).click();

  await expect.poll(() => spawnRequests.length).toBe(1);
  expect(spawnRequests[0]).toMatchObject({
    runtime_id: "opencode",
    session_id: "s-empty",
  });
  await expect(
    page.getByRole("heading", { name: "Add a coding agent" }),
  ).toBeHidden();
  await expect(page.getByPlaceholder(/Write a message/)).toBeVisible();
});
