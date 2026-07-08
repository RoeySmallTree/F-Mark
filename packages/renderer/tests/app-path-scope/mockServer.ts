import { vi } from "vitest";
import { PARTICIPANTS, REPO_B } from "./fixtures.js";

export type FetchMock = ReturnType<typeof vi.fn>;

type FetchInput = RequestInfo | URL;
type RouteResponder = (init?: RequestInit) => Response | Promise<Response>;

type FetchRoute = {
  matches(input: string): boolean;
  responder: RouteResponder;
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function parseRequestBody(init?: RequestInit): unknown {
  return JSON.parse(String(init?.body ?? "{}"));
}

class MockFetchServer {
  private readonly routes: FetchRoute[] = [];

  getJson(suffix: string, body: unknown, status = 200): this {
    this.routes.push({
      matches: (input) => input.endsWith(suffix),
      responder: () => jsonResponse(body, status),
    });
    return this;
  }

  on(suffix: string, responder: RouteResponder): this {
    this.routes.push({
      matches: (input) => input.endsWith(suffix),
      responder,
    });
    return this;
  }

  onMatching(
    matches: (input: string) => boolean,
    responder: RouteResponder,
  ): this {
    this.routes.push({ matches, responder });
    return this;
  }

  install(): FetchMock {
    const fetchMock = vi.fn((input: FetchInput, init?: RequestInit) =>
      this.handle(input, init),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  private handle(input: FetchInput, init?: RequestInit): Promise<Response> {
    const route = this.routes.find(({ matches }) => matches(String(input)));
    return Promise.resolve(route?.responder(init) ?? jsonResponse({}));
  }
}

export function createScopedAppServer(options: {
  paths: unknown;
  sessions: unknown[];
}): MockFetchServer {
  return new MockFetchServer()
    .getJson("/paths", options.paths)
    .getJson("/sessions?scope=all", { sessions: options.sessions })
    .getJson(`/participants?path_id=${REPO_B.pathId}`, {
      participants: PARTICIPANTS,
    })
    .getJson("/health", {
      status: "ok",
      version: "0.4.0",
      processApiEnabled: true,
    })
    .getJson("/managed-agents", { agents: [], terminals: [] })
    .getJson("/env-probe", { runtimes: {}, tmux: false });
}
