import { describe, it } from "vitest";
import {
  documentsAlternativesMultiSemantics,
  documentsDesignTargetRouting,
  returnsCommentResponseSection,
  returnsMcpFirstGuideWithoutRestProtocolGuidance,
  returnsMcpGuideWithoutStaticFallback,
  returnsRestProtocolVariant,
  removesStaleHooksText,
} from "./guide/contentScenarios.js";
import {
  acceptsAgentIdQueryParam,
  acceptsSessionIdAlias,
  acceptsSessionIdQueryParam,
  fallsBackWithoutSessionId,
  includesSessionSpecificSection,
  returnsNotFoundForUnknownSession,
} from "./guide/queryScenarios.js";
import {
  acceptsRuntimeClaude,
  acceptsRuntimeCodex,
  acceptsRuntimeOpencode,
} from "./guide/runtimeScenarios.js";
import {
  codexHookSnippetIsGenericForParticipants,
  hookSnippetIsGenericForClaude,
  hookSnippetOmitsFallbackParticipantWhenNoUserRegistered,
} from "./guide/hookScenarios.js";

describe("GET /guide", () => {
  it(
    "returns MCP-first markdown without REST protocol guidance",
    returnsMcpFirstGuideWithoutRestProtocolGuidance,
  );

  it(
    "returns the MCP guide even when the static AGENT.md fallback is missing",
    returnsMcpGuideWithoutStaticFallback,
  );

  it(
    "keeps the REST protocol reference on /guide-rest-variant",
    returnsRestProtocolVariant,
  );

  it(
    "includes the Responding to Comments section that dereferences append_to + lines",
    returnsCommentResponseSection,
  );
  it("removes the stale 'Hooks (NOT YET SHIPPED)' text", removesStaleHooksText);
  it(
    "documents alternatives multi-select semantics",
    documentsAlternativesMultiSemantics,
  );
  it(
    "routes visuals by design target (target-repo-ui / fmark-ui / session-artifact), not posting surface",
    documentsDesignTargetRouting,
  );
  it(
    "backward-compat: accepts sessionId (camelCase) as alias for session_id",
    acceptsSessionIdAlias,
  );
  it("accepts session_id (snake_case) query param", acceptsSessionIdQueryParam);
  it(
    "accepts agent_id query param and substitutes in instructions",
    acceptsAgentIdQueryParam,
  );
  it(
    "accepts runtime_id=claude and renders Claude MCP wording",
    acceptsRuntimeClaude,
  );
  it(
    "accepts runtime_id=codex and renders Codex MCP wording",
    acceptsRuntimeCodex,
  );
  it(
    "accepts runtime_id=opencode and renders generic MCP wording",
    acceptsRuntimeOpencode,
  );
  it(
    "includes session-specific section when sessionId is supplied",
    includesSessionSpecificSection,
  );
  it("returns 404 for unknown sessionId", returnsNotFoundForUnknownSession);
  it(
    "falls back to no-session message when sessionId is not supplied",
    fallsBackWithoutSessionId,
  );
  it(
    "Claude hook snippet is generic and does not include participant ids",
    hookSnippetIsGenericForClaude,
  );
  it(
    "Codex hook snippet is generic and does not include participant ids",
    codexHookSnippetIsGenericForParticipants,
  );
  it(
    "falls back to us-yourname when no user participant is registered",
    hookSnippetOmitsFallbackParticipantWhenNoUserRegistered,
  );
});
