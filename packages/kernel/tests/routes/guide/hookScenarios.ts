import {
  expectBodyContains,
  expectBodyExcludes,
  expectHookSectionContains,
  expectHookSectionExcludes,
  expectStatus,
} from "./assertions.js";
import { replaceParticipants } from "./fixtures.js";
import { withGuideApp } from "./harness.js";
import { getGuideRestVariant } from "./requests.js";

export async function hookSnippetIsGenericForClaude(): Promise<void> {
  await withGuideApp(async ({ app, p }) => {
    await replaceParticipants(p, {
      "us-alice": { kind: "user", name: "Alice", color: "#3b82f6" },
    });
    const res = await getGuideRestVariant(app, {
      query: { runtime_id: "claude", agent_id: "ag-claude-1" },
    });
    expectStatus(res, 200);
    expectHookSectionContains(res, "hook auto-stream");
    expectHookSectionExcludes(
      res,
      "npx -y f-mark",
      "ag-claude-1",
      "us-alice",
      "UserPromptSubmit",
      "us-yourname",
    );
  });
}

export async function codexHookSnippetIsGenericForParticipants(): Promise<void> {
  await withGuideApp(async ({ app, p }) => {
    await replaceParticipants(p, {
      "us-bob": { kind: "user", name: "Bob", color: "#3b82f6" },
    });
    const res = await getGuideRestVariant(app, {
      query: { runtime_id: "codex", agent_id: "ag-codex-2" },
    });
    expectStatus(res, 200);
    expectHookSectionContains(res, "hook auto-stream", "--kind user");
    expectHookSectionExcludes(
      res,
      "ag-codex-2",
      "us-bob",
      "us-yourname",
    );
  });
}

export async function hookSnippetOmitsFallbackParticipantWhenNoUserRegistered(): Promise<void> {
  await withGuideApp(async ({ app, p }) => {
    await replaceParticipants(p, {
      "ag-only": { kind: "agent", name: "Solo", color: "#10b981" },
    });
    const res = await getGuideRestVariant(app, {
      query: { runtime_id: "claude", agent_id: "ag-claude-9" },
    });
    expectStatus(res, 200);
    expectHookSectionExcludes(res, "us-yourname", "ag-claude-9");
  });
}
