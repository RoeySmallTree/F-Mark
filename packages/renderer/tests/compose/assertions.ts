import { screen, waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import {
  callUrls,
  callsEndingWith,
  firstCallEndingWith,
  firstPostedBody,
  postedBodies,
  requestUrl,
  wakeBody,
  wakeCalls,
  type FetchMock,
} from "./api.js";
import { MOCK_SESSION } from "./fixtures.js";

export async function waitForFetchCalls(
  fetchMock: FetchMock,
  count: number,
): Promise<void> {
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });
}

export async function waitForPostedBodyCount(
  fetchMock: FetchMock,
  suffix: string,
  count: number,
): Promise<void> {
  await waitFor(() => {
    expect(postedBodies(fetchMock, suffix)).toHaveLength(count);
  });
}

export async function expectEventPostCounts(
  fetchMock: FetchMock,
  counts: Record<string, number>,
  options?: Parameters<typeof waitFor>[1],
): Promise<void> {
  await waitFor(() => {
    const urls = callUrls(fetchMock);
    for (const [suffix, count] of Object.entries(counts)) {
      expect(urls.filter((url) => url.endsWith(suffix))).toHaveLength(count);
    }
  }, options);
}

export function expectFirstProseBody(
  fetchMock: FetchMock,
  expected: Record<string, unknown>,
): void {
  const [url, init] = firstCallEndingWith(fetchMock, "/events/prose");
  expect(String(url)).toMatch(/\/events\/prose$/);
  expect((init as RequestInit).method).toBe("POST");
  expect(JSON.parse(String((init as RequestInit).body))).toEqual(expected);
}

function firstBody(fetchMock: FetchMock): Record<string, unknown> {
  return JSON.parse(
    String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
  ) as Record<string, unknown>;
}

export function expectFirstBodyMatches(
  fetchMock: FetchMock,
  expected: Record<string, unknown>,
): void {
  expect(firstBody(fetchMock)).toMatchObject(expected);
}

export function expectFirstBodyHasNoProperty(
  fetchMock: FetchMock,
  property: string,
): void {
  expect(firstBody(fetchMock)).not.toHaveProperty(property);
}

export function expectFirstAttachmentUpload(
  fetchMock: FetchMock,
  file: File,
  displayName: string,
): void {
  const [url, init] = fetchMock.mock.calls[0]!;
  const parsedUrl = requestUrl(url);
  expect(parsedUrl.pathname).toBe(`/sessions/${MOCK_SESSION.id}/attachments`);
  expect(parsedUrl.searchParams.get("path_id")).toBe("project-id");
  expect((init as RequestInit).method).toBe("POST");
  const body = (init as RequestInit).body as FormData;
  expect(body.get("display_name")).toBe(displayName);
  expect(body.get("file")).toBe(file);
}

export function expectNoEventWrites(fetchMock: FetchMock): void {
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).includes("/events/")),
  ).toBe(false);
}

export async function expectAttachmentDeleted(
  fetchMock: FetchMock,
  attachmentId: string,
): Promise<void> {
  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          requestUrl(url).pathname ===
            `/sessions/${MOCK_SESSION.id}/attachments/${attachmentId}` &&
          requestUrl(url).searchParams.get("path_id") === "project-id" &&
          (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(true);
  });
}

export async function expectFileEventCount(
  fetchMock: FetchMock,
  count: number,
): Promise<void> {
  await waitFor(() => {
    const fileCalls = callsEndingWith(fetchMock, "/events/file").filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(fileCalls).toHaveLength(count);
  });
}

export function expectFileEventBody(
  fetchMock: FetchMock,
  expected: Record<string, unknown>,
): void {
  expect(firstPostedBody(fetchMock, "/events/file")).toMatchObject(expected);
}

export function expectNoProsePost(fetchMock: FetchMock): void {
  expect(callsEndingWith(fetchMock, "/events/prose")).toHaveLength(0);
}

export function expectAttachmentUploadUrl(fetchMock: FetchMock): void {
  const parsedUrl = requestUrl(fetchMock.mock.calls[0]![0]);
  expect(parsedUrl.pathname).toBe(`/sessions/${MOCK_SESSION.id}/attachments`);
  expect(parsedUrl.searchParams.get("path_id")).toBe("project-id");
}

export function expectPendingApprovalActions(container: HTMLElement): void {
  expect(
    screen.getByRole("group", { name: /pending permission request/i }),
  ).toHaveAttribute("data-state", "pending");
  expect(screen.getByText("Pending approval")).toBeInTheDocument();
  // The status doubles as the reveal affordance.
  expect(
    screen.getByRole("button", { name: /show the request/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /once/i })).toBeInTheDocument();
  expect(
    screen.getByRole("radio", { name: /this session/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Allow/i })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /cancel this tool call/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /stop run/i })).toBeInTheDocument();
  expect(container.querySelector(".primary-action-menu")).toBeNull();
  expect(screen.queryByRole("menu")).toBeNull();
}

export function createAccessRequestTarget(): HTMLDivElement {
  const target = document.createElement("div");
  target.dataset.accessRequestId = "ar-compose-1";
  target.scrollIntoView = vi.fn();
  document.body.append(target);
  return target;
}

export function expectAccessRequestFocused(target: HTMLDivElement): void {
  expect(target.scrollIntoView).toHaveBeenCalledWith({
    behavior: "smooth",
    block: "center",
  });
  expect(target.classList.contains("access-request-card-highlight")).toBe(true);
}

export function expectAccessResponse(
  fetchMock: FetchMock,
  expected: Record<string, unknown>,
): void {
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe(
    "/managed-agents/ag-c92e/access-requests/ar-compose-1/respond",
  );
  expect((init as RequestInit).method).toBe("POST");
  expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
    session_id: MOCK_SESSION.id,
    participant_id: "us-a7f3",
    ...expected,
  });
}

export async function expectCreateTodoDialogFocused(): Promise<void> {
  expect(
    screen.getByRole("dialog", { name: /create todo/i }),
  ).toBeInTheDocument();
  const title = screen.getByPlaceholderText(/task title/i);
  await waitFor(() => expect(title).toHaveFocus());
  expect(screen.getByLabelText(/^parent$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^assignee$/i)).toHaveValue("ag-c92e");
}

export function expectScopedAssigneeOptions(): void {
  const assignee = screen.getByLabelText(/^assignee$/i);
  expect(assignee).toHaveValue("ag-c92e");
  expect(screen.getByRole("option", { name: "Claude" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Other session" })).toBeNull();
  expect(screen.queryByRole("option", { name: "Detached" })).toBeNull();
  expect(screen.queryByRole("option", { name: "Roey" })).toBeNull();
}

export function expectTodoBody(
  fetchMock: FetchMock,
  expected: Record<string, unknown>,
): void {
  expect(firstPostedBody(fetchMock, "/events/todo")).toMatchObject(expected);
}

export async function expectTodoAndTurnEndOrder(
  fetchMock: FetchMock,
): Promise<void> {
  await waitFor(() => {
    const urls = callUrls(fetchMock);
    expect(urls.filter((url) => url.endsWith("/events/todo"))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/events/turn-end"))).toHaveLength(
      1,
    );
    expect(
      urls.findIndex((url) => url.endsWith("/events/turn-end")),
    ).toBeGreaterThan(urls.findIndex((url) => url.endsWith("/events/todo")));
  });
}

export async function expectWakeCallCount(
  fetchMock: FetchMock,
  count: number,
): Promise<void> {
  await waitFor(() => {
    expect(wakeCalls(fetchMock)).toHaveLength(count);
  });
}

export function expectWakeBody(
  fetchMock: FetchMock,
  expected: Record<string, unknown>,
): void {
  expect(wakeBody(fetchMock)).toMatchObject(expected);
}

export async function expectTurnEndAndWake(
  fetchMock: FetchMock,
): Promise<void> {
  await waitFor(() => {
    const urls = callUrls(fetchMock);
    expect(urls.filter((url) => url.endsWith("/events/turn-end"))).toHaveLength(
      1,
    );
    expect(wakeCalls(fetchMock)).toHaveLength(1);
  });
}

export async function expectProseTurnEndWakeOrder(
  fetchMock: FetchMock,
): Promise<void> {
  await waitFor(() => {
    const urls = callUrls(fetchMock);
    const proseIndex = urls.findIndex((url) => url.endsWith("/events/prose"));
    const turnEndIndex = urls.findIndex((url) =>
      url.endsWith("/events/turn-end"),
    );
    const wakeIndex = urls.findIndex((url) =>
      url.endsWith(`/sessions/${MOCK_SESSION.id}/wake`),
    );
    expect(proseIndex).toBeGreaterThanOrEqual(0);
    expect(turnEndIndex).toBeGreaterThan(proseIndex);
    expect(wakeIndex).toBeGreaterThan(turnEndIndex);
  });
}
