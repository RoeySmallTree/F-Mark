import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFmarkMcpServer } from "./server.js";
import { resolveFmarkMcpContext } from "./context.js";
import { registerFmarkMcpProcess } from "./runtimeRegistry.js";

export interface FmarkMcpStdioOptions {
  path?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runFmarkMcpStdio(
  options: FmarkMcpStdioOptions = {},
): Promise<void> {
  const ctx = await resolveFmarkMcpContext(options);
  let registration: { unregister(): Promise<void> } | null = null;
  try {
    registration = await registerFmarkMcpProcess({
      fmarkDir: ctx.fmarkDir,
      projectRoot: ctx.projectRoot,
      env: ctx.env,
    });
  } catch {
    // MCP remains usable if the tracking file cannot be updated; cleanup just
    // won't be able to target this child later.
  }
  const server = createFmarkMcpServer({ ...options, path: ctx.projectRoot });
  try {
    await server.connect(new StdioServerTransport());
    await new Promise<void>((resolve) => {
      process.stdin.once("end", resolve);
      process.stdin.once("close", resolve);
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  } finally {
    await server.close();
    await registration?.unregister().catch(() => {});
  }
}
