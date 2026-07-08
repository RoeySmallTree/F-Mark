import type { TodoTreeNode } from "@f-mark/shared";
import { vi } from "vitest";
import { MOCK_SESSION, todoListResponse } from "./fixtures.js";

export type FetchMock = ReturnType<typeof vi.fn>;

type StagedAttachment = {
  displayName: string;
  id: string;
  mimeType?: string;
  previewKind?: string;
  sizeBytes?: number;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function requestUrl(input: unknown): URL {
  return new URL(String(input), "http://test.local");
}

export function installJsonFetch(body: unknown = { filename: "f" }): FetchMock {
  const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function installCreateTodoFetch(
  tree: TodoTreeNode[] = [],
): FetchMock {
  const fetchMock = vi
    .fn()
    .mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const parsedUrl = requestUrl(input);
      const method = init?.method ?? "GET";
      if (
        method === "GET" &&
        parsedUrl.pathname === `/sessions/${MOCK_SESSION.id}/todos`
      ) {
        return jsonResponse(todoListResponse(tree));
      }
      if (method === "POST" && parsedUrl.pathname.endsWith("/events/todo")) {
        return jsonResponse({ filename: "20260522T120000Z_us-a7f3.todo.json" });
      }
      if (method === "POST" && parsedUrl.pathname.endsWith("/events/turn-end")) {
        return jsonResponse({
          filename: "20260522T120001Z_us-a7f3.turn-end.json",
        });
      }
      return jsonResponse({});
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stagedAttachmentPayload({
  id,
  displayName,
  mimeType = "image/png",
  previewKind = "image",
  sizeBytes = 11,
}: StagedAttachment): Record<string, unknown> {
  return {
    id,
    display_name: displayName,
    path: `attachments/${id}/${displayName}`,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    preview_kind: previewKind,
  };
}

function stagedAttachmentResponse(
  attachment: StagedAttachment,
): Response {
  return jsonResponse(stagedAttachmentPayload(attachment));
}

export function installStagedAttachmentFetch(
  attachment: StagedAttachment,
): FetchMock {
  const fetchMock = vi
    .fn()
    .mockImplementation(async () => stagedAttachmentResponse(attachment));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function installAttachmentDeleteFetch(
  attachment: StagedAttachment,
): FetchMock {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (requestUrl(url).pathname === `/sessions/${MOCK_SESSION.id}/attachments`) {
      return stagedAttachmentResponse(attachment);
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function installAttachmentFlowFetch({
  attachment,
  fileFilename = "f.json",
  proseFilename,
}: {
  attachment: StagedAttachment;
  fileFilename?: string;
  proseFilename?: string;
}): FetchMock {
  const fetchMock = vi
    .fn()
    .mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const parsed = requestUrl(url);
      if (
        method === "POST" &&
        parsed.pathname === `/sessions/${MOCK_SESSION.id}/attachments`
      ) {
        return stagedAttachmentResponse(attachment);
      }
      if (method === "POST" && parsed.pathname.endsWith("/events/prose")) {
        return jsonResponse({ filename: proseFilename ?? "prose.md" });
      }
      if (method === "POST" && parsed.pathname.endsWith("/events/file")) {
        return jsonResponse({ filename: fileFilename });
      }
      return jsonResponse({});
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function installMentionAgentFetch(): FetchMock {
  const fetchMock = vi
    .fn()
    .mockImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/managed-agents/status")) {
        return jsonResponse({
          agents: [
            {
              participant_id: "ag-c92e",
              display_name: "Claude",
              runtime_id: "claude",
              active_session: MOCK_SESSION.id,
              runtime_session: null,
              managed: true,
              paused: false,
              connection_state: "connected",
              activity_state: "idle",
              tmux_session: "claude-1",
              mcp_status: "installed",
              hook_status: "installed",
              context: {
                status: "not-reported",
                used_tokens: null,
                max_tokens: null,
                source: "not-reported",
                reason: "Context usage is not reported.",
              },
              access: {
                mode: "default",
                supported_modes: ["default"],
                change_supported: false,
              },
              pending_access_count: 0,
            },
          ],
          capabilities: {},
        });
      }
      return jsonResponse({ filename: "f" });
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function callUrls(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url));
}

export function callsEndingWith(
  fetchMock: FetchMock,
  suffix: string,
): unknown[][] {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix));
}

export function postedBodies(
  fetchMock: FetchMock,
  suffix: string,
): Record<string, unknown>[] {
  return callsEndingWith(fetchMock, suffix).map(([, init]) =>
    JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")),
  ) as Record<string, unknown>[];
}

export function firstPostedBody(
  fetchMock: FetchMock,
  suffix: string,
): Record<string, unknown> {
  const body = postedBodies(fetchMock, suffix)[0];
  if (!body) {
    throw new Error(`No fetch call matched ${suffix}`);
  }
  return body;
}

export function firstCallEndingWith(
  fetchMock: FetchMock,
  suffix: string,
): unknown[] {
  const call = callsEndingWith(fetchMock, suffix)[0];
  if (!call) {
    throw new Error(`No fetch call matched ${suffix}`);
  }
  return call;
}

export function wakeCalls(fetchMock: FetchMock): string[] {
  return callUrls(fetchMock).filter((url) => /\/sessions\/.+\/wake$/.test(url));
}

export function wakeBody(fetchMock: FetchMock): Record<string, unknown> {
  const wakeUrl = wakeCalls(fetchMock)[0];
  if (!wakeUrl) {
    throw new Error("No wake call was recorded");
  }
  const call = fetchMock.mock.calls.find(([url]) => String(url) === wakeUrl);
  return JSON.parse(
    String((call?.[1] as RequestInit | undefined)?.body ?? "{}"),
  ) as Record<string, unknown>;
}
