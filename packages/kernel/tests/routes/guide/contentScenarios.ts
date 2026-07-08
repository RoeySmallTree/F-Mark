import {
  expectBodyContains,
  expectBodyExcludes,
  expectMarkdown,
  expectStatus,
} from "./assertions.js";
import { createGuideSession } from "./fixtures.js";
import { withGuideApp } from "./harness.js";
import { getGuide, getGuideRestVariant } from "./requests.js";

export async function returnsMcpFirstGuideWithoutRestProtocolGuidance(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app, {
      headers: { host: "example.test:9999" },
    });
    expectStatus(res, 200);
    expectMarkdown(res);
    expectBodyContains(
      res,
      "MCP-first guide",
      "fmark_post_prose",
      "fmark_end_turn",
      "fmark_read_events",
      "fmark://guide",
    );
    expectBodyExcludes(
      res,
      "http://example.test:9999",
      "curl",
      "POST /sessions",
      "Authorization: Bearer",
    );
  });
}

export async function returnsMcpGuideWithoutStaticFallback(): Promise<void> {
  await withGuideApp(
    async ({ app }) => {
      const res = await getGuide(app);
      expectStatus(res, 200);
      expectBodyContains(res, "MCP-first guide", "fmark_post_prose");
    },
    { initializeProject: false },
  );
}

export async function returnsRestProtocolVariant(): Promise<void> {
  await withGuideApp(async ({ app, p }) => {
    const session = await createGuideSession(p, "rest-guide");
    const res = await getGuideRestVariant(app, {
      query: { session_id: session.id, agent_id: "ag-guide" },
      headers: { host: "example.test:9999" },
    });
    expectStatus(res, 200);
    expectMarkdown(res);
    expectBodyContains(
      res,
      "http://example.test:9999",
      "Verify your tooling",
      "`.claude/skills/f-mark/SKILL.md`",
      "curl",
      "POST /sessions",
      "Authorization: Bearer",
    );
  });
}

export async function returnsCommentResponseSection(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app);
    expectStatus(res, 200);
    expectBodyContains(
      res,
      "Responding to Comments",
      "append_to",
      "lines",
      "fmark_read_events",
      "1-indexed",
      /same `lines`/,
      "in_reply_to",
    );
  });
}

export async function removesStaleHooksText(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app);
    expectStatus(res, 200);
    expectBodyExcludes(res, "NOT YET SHIPPED");
  });
}

export async function documentsDesignTargetRouting(): Promise<void> {
  /* The posting-surface-is-not-the-design-target rule, the renamed
     classifications, and the Amber house default for unbound artifacts must
     appear in the managed guide AND the REST variant (which embeds AGENT.md).
     A stale copy of the old branch vocabulary in ANY surface re-causes the
     "defaulted to the F-Mark renderer theme" bug. */
  await withGuideApp(async ({ app, p }) => {
    const mcp = await getGuide(app);
    expectStatus(mcp, 200);
    expectBodyContains(
      mcp,
      "posting surface is not the design target",
      "Visual target:",
      "target-repo-ui",
      "fmark-ui",
      "session-artifact",
      "Amber",
    );
    expectBodyExcludes(mcp, "external-product", "fmark-product-mockup");

    const session = await createGuideSession(p, "rest-guide-theming");
    const rest = await getGuideRestVariant(app, {
      query: { session_id: session.id, agent_id: "ag-guide" },
    });
    expectStatus(rest, 200);
    expectBodyContains(rest, "target-repo-ui", "fmark-ui", "session-artifact");
    expectBodyExcludes(rest, "external-product", "fmark-product-mockup");
  });
}

export async function documentsAlternativesMultiSemantics(): Promise<void> {
  await withGuideApp(async ({ app }) => {
    const res = await getGuide(app);
    expectStatus(res, 200);
    expectBodyContains(
      res,
      "fmark_post_alternatives",
      "`multi: false` = pick exactly one visual option",
      "`multi: true` = pick any number",
      "or more",
      "mix",
      "combine",
      "select all",
    );
  });
}
