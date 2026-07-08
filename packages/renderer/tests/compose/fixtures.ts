import type {
  AccessRequestPayload,
  AnyEventRecord,
  Participant,
  TodoPayload,
  TodoTreeNode,
} from "@f-mark/shared";
import type { SessionMeta, TodoListResponse } from "../../src/api/client.js";
import { _isMacPlatform } from "../../src/hooks/useHotkeys.js";
import { useStore } from "../../src/state/store.js";

// $mod resolves to ⌘ on macOS / Ctrl elsewhere. Tests need to send the same.
export const MOD_OPEN = _isMacPlatform() ? "{Meta>}" : "{Control>}";
export const MOD_CLOSE = _isMacPlatform() ? "{/Meta}" : "{/Control}";
const MESSAGE_ENDS_TURN_KEY = "fmark:settings:message-ends-turn";

export const MOCK_SESSION: SessionMeta = {
  id: "2026-05-22-launch-review",
  slug: "launch-review",
  created_at: "2026-05-22T10:00:00Z",
};

const PARTICIPANTS: Record<string, Participant> = {
  "us-a7f3": { kind: "user", name: "Roey", color: "#2a5fa8" },
  "ag-c92e": {
    kind: "agent",
    name: "Claude",
    color: "#b86a1f",
    active_session: MOCK_SESSION.id,
  },
};

export function resetStore(
  overrides: Partial<ReturnType<typeof useStore.getState>> = {},
): void {
  useStore.setState({
    token: null,
    sessions: [MOCK_SESSION],
    currentSessionId: MOCK_SESSION.id,
    participants: PARTICIPANTS,
    currentUserId: "us-a7f3",
    events: [],
    /* Required root scope (X2): scoped writes need a known active path. */
    activePath: "/project",
    activePathId: "project-id",
    selectedPath: null,
    selectedPathId: null,
    composeMode: "message",
    commentTarget: null,
    composeDraft: null,
    composeInsertion: null,
    leftRail: "sessions",
    rightTab: "log",
    viewMode: "everything",
    activeModal: null,
    editingSkill: null,
    activePopover: { key: null, anchorRect: null },
    ...overrides,
  });
}

export function removeMessageEndsTurnSetting(): void {
  try {
    globalThis.localStorage?.removeItem(MESSAGE_ENDS_TURN_KEY);
  } catch {
    /* ignore */
  }
}

export function disableMessageEndsTurn(): void {
  globalThis.localStorage?.setItem(MESSAGE_ENDS_TURN_KEY, "false");
}

export function participantsWithOutOfScopeAgents(): Record<string, Participant> {
  return {
    ...PARTICIPANTS,
    "ag-other": {
      kind: "agent",
      name: "Other session",
      color: "#10b981",
      active_session: "2026-05-22-other",
    },
    "ag-detached": {
      kind: "agent",
      name: "Detached",
      color: "#8b5cf6",
      active_session: null,
    },
  };
}

export function nestedTodoTree(): TodoTreeNode[] {
  return [
    {
      id: "parent",
      title: "Parent task",
      status: "open",
      children: [
        {
          id: "child",
          title: "Child task",
          status: "open",
          parent_id: "parent",
          children: [],
        },
      ],
    },
  ];
}

function flattenTodos(nodes: TodoTreeNode[]): TodoTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTodos(node.children)]);
}

function todoPayload(node: TodoTreeNode): TodoPayload {
  const payload: TodoPayload = {
    id: node.id,
    title: node.title,
    status: node.status,
  };
  if (node.body !== undefined) payload.body = node.body;
  if (node.assigned_to !== undefined) payload.assigned_to = node.assigned_to;
  if (node.parent_id !== undefined) payload.parent_id = node.parent_id;
  return payload;
}

export function todoListResponse(tree: TodoTreeNode[]): TodoListResponse {
  const items = flattenTodos(tree);
  return {
    open: items.filter((item) => item.status === "open").map(todoPayload),
    wip: items.filter((item) => item.status === "wip").map(todoPayload),
    done: items.filter((item) => item.status === "done").map(todoPayload),
    tree,
  };
}

export function makeAccessRequestEvent(
  overrides: Partial<AccessRequestPayload> = {},
): AnyEventRecord {
  const payload: AccessRequestPayload = {
    schema: "fmark.access-request.v1",
    request_id: "ar-compose-1",
    status: "open",
    request_type: "command",
    runtime_id: "codex",
    hook_event_name: "TerminalApproval",
    title: "Bash command",
    command: "echo ok",
    response_channel: "terminal",
    created_at: "2026-06-10T12:00:00Z",
    ...overrides,
  };
  return {
    filename: "20260610T120000Z_ag-c92e.access-request.json",
    timestamp: "2026-06-10T12:00:00Z",
    participant_id: "ag-c92e",
    kind: "access-request",
    payload,
  };
}
