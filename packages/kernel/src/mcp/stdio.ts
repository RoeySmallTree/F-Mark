import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFmarkMcpServer } from "./server.js";

export interface FmarkMcpStdioOptions {
  path?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runFmarkMcpStdio(
  options: FmarkMcpStdioOptions = {},
): Promise<void> {
  const server = createFmarkMcpServer(options);
  await server.connect(new StdioServerTransport());
  await new Promise<void>((resolve) => {
    process.stdin.once("end", resolve);
    process.stdin.once("close", resolve);
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await server.close();
}
