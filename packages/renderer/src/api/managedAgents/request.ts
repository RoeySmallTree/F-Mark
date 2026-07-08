const NO_LOOSE_STRING_VALUES = {
  value7777: "7777",
  localhost: "localhost",
  value1: "::1",
  value12: "[::1]",
} as const;

interface ManagedAgentsRequestConfig {
  baseUrl: string;
  token: string | null;
}

interface FetchTextInput {
  method: string;
  path: string;
  body: unknown;
  authHeader: Record<string, string>;
  requestBaseUrl: string;
}

interface ManagedAgentsResponseText {
  res: Response;
  text: string;
}

export type ManagedAgentsRequest = <T>(
  method: string,
  path: string,
  body?: unknown,
) => Promise<T>;

export class ManagedAgentsApiError extends Error {
  method: string;
  path: string;
  status: number;
  body: string;
  backendError?: string;

  constructor(input: {
    method: string;
    path: string;
    status: number;
    body: string;
    backendError?: string;
  }) {
    super(
      input.backendError !== undefined
        ? `${input.method} ${input.path} → ${input.status}: ${input.backendError}`
        : `${input.method} ${input.path} → ${input.status}`,
    );
    this.name = "ManagedAgentsApiError";
    this.method = input.method;
    this.path = input.path;
    this.status = input.status;
    this.body = input.body;
    this.backendError = input.backendError;
  }
}

export function createManagedAgentsRequest(
  deps: ManagedAgentsRequestConfig,
): ManagedAgentsRequest {
  const authHeader: Record<string, string> =
    deps.token !== null ? { Authorization: `Bearer ${deps.token}` } : {};

  return async function req<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetchTextWithFallback({
      method,
      path,
      body,
      authHeader,
      requestBaseUrl: deps.baseUrl,
    });
    throwForErrorResponse(method, path, response);
    return parseSuccessBody<T>(method, path, response);
  };
}

async function fetchTextWithFallback(
  input: FetchTextInput,
): Promise<ManagedAgentsResponseText> {
  const primary = await fetchText(input);
  if (!isHtmlResponse(primary.res, primary.text)) return primary;

  const fallbackBase = localKernelFallbackBase(input.requestBaseUrl);
  if (fallbackBase === null) return primary;

  try {
    return await fetchText({ ...input, requestBaseUrl: fallbackBase });
  } catch {
    // Keep the clearer HTML/proxy error below.
    return primary;
  }
}

async function fetchText(
  input: FetchTextInput,
): Promise<ManagedAgentsResponseText> {
  const init = requestInit(input.method, input.authHeader, input.body);
  const res = await fetch(`${input.requestBaseUrl}${input.path}`, init);
  const text = res.status === 204 ? "" : await res.text();
  return { res, text };
}

function requestInit(
  method: string,
  authHeader: Record<string, string>,
  body: unknown,
): RequestInit {
  const headers = { ...authHeader };
  const init: RequestInit = { method, headers };

  // Only set Content-Type when there IS a body: Fastify rejects a POST that
  // declares application/json but ships an empty body.
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return init;
}

function localKernelFallbackBase(baseUrl: string): string | null {
  if (baseUrl !== "" || typeof window === "undefined") return null;

  const { protocol, hostname, port } = window.location;
  if (!canFallbackToLocalKernel(protocol, hostname, port)) return null;

  return `${protocol}//${formatFallbackHost(hostname)}:7777`;
}

function canFallbackToLocalKernel(
  protocol: string,
  hostname: string,
  port: string,
): boolean {
  return (
    isHttpProtocol(protocol) &&
    isLocalhost(hostname) &&
    port !== "" &&
    port !== NO_LOOSE_STRING_VALUES.value7777
  );
}

function isHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

function isLocalhost(hostname: string): boolean {
  return hostname === NO_LOOSE_STRING_VALUES.localhost || hostname === "127.0.0.1" || hostname === NO_LOOSE_STRING_VALUES.value1;
}

function formatFallbackHost(hostname: string): string {
  return hostname === NO_LOOSE_STRING_VALUES.value1 ? NO_LOOSE_STRING_VALUES.value12 : hostname;
}

function isHtmlResponse(res: Response, text: string): boolean {
  const contentType = res.headers.get("Content-Type") ?? "";
  return contentType.includes("text/html") || /^<!doctype html/i.test(text.trim());
}

function throwForErrorResponse(
  method: string,
  path: string,
  response: ManagedAgentsResponseText,
): void {
  if (response.res.ok) return;

  throw new ManagedAgentsApiError({
    method,
    path,
    status: response.res.status,
    body: response.text,
    backendError: parseBackendError(response.text),
  });
}

function parseBackendError(text: string): string | undefined {
  try {
    return backendErrorFromJson(JSON.parse(text) as unknown);
  } catch {
    return text.trim().length > 0 ? text : undefined;
  }
}

function backendErrorFromJson(parsed: unknown): string | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  if (!("error" in parsed) || typeof parsed.error !== "string") return undefined;
  return parsed.error;
}

function parseSuccessBody<T>(
  method: string,
  path: string,
  response: ManagedAgentsResponseText,
): T {
  if (response.res.status === 204) return undefined as unknown as T;
  if (response.text.length === 0) return undefined as unknown as T;
  if (isHtmlResponse(response.res, response.text)) {
    throw new Error(
      `${method} ${path} returned HTML instead of JSON. The request may be hitting the renderer instead of the kernel API.`,
    );
  }
  try {
    return JSON.parse(response.text) as T;
  } catch {
    throw new Error(
      `${method} ${path} → ${response.res.status} returned non-JSON: ${response.text.slice(0, 200)}`,
    );
  }
}
