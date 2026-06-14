import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer(
  { name: "fmark-phase4-echo", version: "0.0.1" },
  { capabilities: { logging: {} } },
);

server.registerTool(
  "phase4_echo",
  {
    title: "Phase 4 Echo",
    description: "Disposable MCP stdio echo tool for F-Mark Phase 4 transport hot checks.",
    inputSchema: {
      message: z.string().min(1),
      tag: z.string().optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ message, tag }) => {
    console.error(`[fmark-phase4-echo] handled ${tag ?? "untagged"}`);
    return {
      content: [
        {
          type: "text",
          text: `F_MARK_PHASE4_ECHO:${tag ?? "none"}:${message}`,
        },
      ],
    };
  },
);

async function main() {
  console.error("[fmark-phase4-echo] starting stdio transport");
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("[fmark-phase4-echo] fatal", error);
  process.exit(1);
});
