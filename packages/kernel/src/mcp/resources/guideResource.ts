import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fmarkFetch,
  resolveFmarkMcpContext,
  resolveSessionContext,
  type ResolveContextOptions,
} from "../context.js";
import { markdownContent } from "./content.js";

export function registerGuideResource(
  server: McpServer,
  options: ResolveContextOptions,
): void {
  server.registerResource(
    "fmark-guide",
    "fmark://guide",
    {
      title: "F-Mark Guide",
      description: "Live F-Mark guide for the active project.",
      mimeType: "text/markdown",
    },
    async () => {
      const ctx = await resolveFmarkMcpContext(options);
      const guide = await fmarkFetch(ctx, `/guide${await guideQuery(options)}`);
      return markdownContent("fmark://guide", guide);
    },
  );
}

async function guideQuery(options: ResolveContextOptions): Promise<string> {
  const base = await resolveFmarkMcpContext(options);
  const qs = new URLSearchParams();

  await addSessionQuery(qs, base.env.F_MARK_AGENT_ID, options);
  addEnvQuery(qs, "agent_id", base.env.F_MARK_AGENT_ID);
  addEnvQuery(qs, "runtime_id", base.env.F_MARK_RUNTIME_ID);

  return qs.size > 0 ? `?${qs.toString()}` : "";
}

async function addSessionQuery(
  qs: URLSearchParams,
  participantId: string | undefined,
  options: ResolveContextOptions,
): Promise<void> {
  try {
    const session = await resolveSessionContext(
      { participant_id: participantId },
      options,
    );
    qs.set("session_id", session.sessionId);
  } catch {
    const fallback = (options.env ?? process.env).F_MARK_SESSION_ID;
    addEnvQuery(qs, "session_id", fallback);
  }
}

function addEnvQuery(
  qs: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined && value.length > 0) {
    qs.set(key, value);
  }
}
