import {
  expectBodyContains,
  expectBodyExcludes,
  expectStatus,
} from "./assertions.js";
import { createGuideSession } from "./fixtures.js";
import { withGuideApp } from "./harness.js";
import { getGuide } from "./requests.js";

export async function acceptsSessionIdAlias(): Promise<void> {
  await withGuideApp(async ({ app, p }) => {
    const session = await createGuideSession(p, "alias");
    const res = await getGuide(app, { query: { sessionId: session.id } });
    expectStatus(res, 200);
    expectBodyContains(res, session.id);
  });
}

export async function acceptsSessionIdQueryParam(): Promise<void> {
  await withGuideApp(async ({ app, p }) => {
    const session = await createGuideSession(p, "snake");
    const res = await getGuide(app, { query: { session_id: session.id } });
    expectStatus(res, 200);
    expectBodyContains(res, session.id);
  });
}

export async function acceptsAgentIdQueryParam(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app, { query: { agent_id: "ag-claude-99" } });
    expectStatus(res, 200);
    expectBodyContains(res, "ag-claude-99");
  });
}

export async function includesSessionSpecificSection(): Promise<void> {
  await withGuideApp(async ({ app, p }) => {
    const session = await createGuideSession(p, "demo");
    const res = await getGuide(app, {
      query: { sessionId: session.id },
      headers: { host: "localhost:7777" },
    });
    expectStatus(res, 200);
    expectBodyContains(
      res,
      `Your F-Mark session id:** \`${session.id}\``,
      "filler acknowledgement",
    );
    expectBodyExcludes(res, "/events/prose");
  });
}

export async function returnsNotFoundForUnknownSession(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app, { query: { sessionId: "no-such" } });
    expectStatus(res, 404);
  });
}

export async function fallsBackWithoutSessionId(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app);
    expectBodyContains(
      res,
      "No F-Mark session id was pinned",
      "Ask the user which session to join before writing",
    );
  });
}
