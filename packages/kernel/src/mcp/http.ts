import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createFmarkMcpServer } from "./server.js";

interface HttpMcpSession {
  projectRoot: string;
  server: ReturnType<typeof createFmarkMcpServer>;
  transport: StreamableHTTPServerTransport;
  close(): Promise<void>;
}

export interface McpHttpRouteOptions {
  token: string | null;
  getProjectRoot(): string;
  env?: NodeJS.ProcessEnv;
}

export interface McpHttpController {
  closeAllSessionsForRoot(root: string): Promise<number>;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function jsonRpcError(status: number, message: string): {
  status: number;
  body: {
    jsonrpc: "2.0";
    error: { code: number; message: string };
    id: null;
  };
} {
  return {
    status,
    body: {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message,
      },
      id: null,
    },
  };
}

function sendJsonRpcError(reply: FastifyReply, status: number, message: string): void {
  const error = jsonRpcError(status, message);
  reply.code(error.status).type("application/json").send(error.body);
}

function isLocalOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    (parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "[::1]")
  );
}

function requireHttpMcpAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  token: string | null,
): boolean {
  const origin = headerValue(req.headers.origin);
  if (origin !== undefined && !isLocalOrigin(origin)) {
    sendJsonRpcError(reply, 403, "Forbidden Origin");
    return false;
  }
  if (token === null) return true;
  if (req.headers.authorization === `Bearer ${token}`) return true;
  sendJsonRpcError(reply, 401, "Unauthorized");
  return false;
}

async function handOffToTransport(
  transport: StreamableHTTPServerTransport,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  reply.hijack();
  await transport.handleRequest(req.raw, reply.raw, req.body);
}

export function registerMcpHttpRoute(
  app: FastifyInstance,
  options: McpHttpRouteOptions,
): McpHttpController {
  const sessions = new Map<string, HttpMcpSession>();

  app.addHook("onClose", async () => {
    const closing = [...sessions.values()].map((session) => session.close());
    await Promise.all(closing);
  });

  app.post("/mcp", async (req, reply) => {
    if (!requireHttpMcpAccess(req, reply, options.token)) return;

    const sessionId = headerValue(req.headers["mcp-session-id"]);
    if (sessionId !== undefined) {
      const existing = sessions.get(sessionId);
      if (existing === undefined) {
        sendJsonRpcError(reply, 404, "Invalid Mcp-Session-Id");
        return;
      }
      await handOffToTransport(existing.transport, req, reply);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      sendJsonRpcError(reply, 400, "Missing Mcp-Session-Id for non-initialize request");
      return;
    }

    let activeSessionId: string | undefined;
    let closing = false;
    let server: ReturnType<typeof createFmarkMcpServer> | null = null;
    let sessionEntry: HttpMcpSession | null = null;
    const projectRoot = options.getProjectRoot();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (createdSessionId) => {
        activeSessionId = createdSessionId;
        if (sessionEntry !== null) sessions.set(createdSessionId, sessionEntry);
      },
    });
    server = createFmarkMcpServer({
      path: projectRoot,
      cwd: projectRoot,
      env: options.env,
      includeProcessSpawningTools: false,
    });
    const closeSession = async (): Promise<void> => {
      if (closing) return;
      closing = true;
      if (activeSessionId !== undefined) sessions.delete(activeSessionId);
      await server?.close().catch(() => {});
      await transport.close().catch(() => {});
    };
    sessionEntry = { projectRoot, server, transport, close: closeSession };
    transport.onclose = () => {
      void closeSession();
    };
    await server.connect(transport);
    await handOffToTransport(transport, req, reply);
  });

  app.get("/mcp", async (req, reply) => {
    if (!requireHttpMcpAccess(req, reply, options.token)) return;

    const sessionId = headerValue(req.headers["mcp-session-id"]);
    if (sessionId === undefined) {
      sendJsonRpcError(reply, 400, "Missing Mcp-Session-Id");
      return;
    }
    const existing = sessions.get(sessionId);
    if (existing === undefined) {
      sendJsonRpcError(reply, 404, "Invalid Mcp-Session-Id");
      return;
    }
    await handOffToTransport(existing.transport, req, reply);
  });

  app.delete("/mcp", async (req, reply) => {
    if (!requireHttpMcpAccess(req, reply, options.token)) return;

    const sessionId = headerValue(req.headers["mcp-session-id"]);
    if (sessionId === undefined) {
      sendJsonRpcError(reply, 400, "Missing Mcp-Session-Id");
      return;
    }
    const existing = sessions.get(sessionId);
    if (existing === undefined) {
      sendJsonRpcError(reply, 404, "Invalid Mcp-Session-Id");
      return;
    }
    await handOffToTransport(existing.transport, req, reply);
  });

  return {
    async closeAllSessionsForRoot(root: string): Promise<number> {
      const matching = [...sessions.values()].filter(
        (session) => session.projectRoot === root,
      );
      await Promise.all(matching.map((session) => session.close()));
      return matching.length;
    },
  };
}
