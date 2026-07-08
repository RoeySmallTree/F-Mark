import {
  appendScopeQuery,
  type RootScope,
} from "../api/rootScope.js";

function encodePath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function appendAuthAndScope(
  params: URLSearchParams,
  token: string | null,
  scope: RootScope | null | undefined,
): void {
  if (token !== null && token.length > 0) params.set("token", token);
  if (scope !== null && scope !== undefined) appendScopeQuery(params, scope);
}

export function sessionRawUrl(
  sessionId: string | null,
  rawPath: string,
  token: string | null,
  scope?: RootScope | null,
  extraQuery?: Record<string, string>,
): string {
  if (sessionId === null || sessionId.length === 0 || rawPath.length === 0) {
    return "";
  }
  const params = new URLSearchParams();
  appendAuthAndScope(params, token, scope);
  if (extraQuery !== undefined) {
    for (const [k, v] of Object.entries(extraQuery)) params.set(k, v);
  }
  const qs = params.toString();
  return `/sessions/${encodeURIComponent(sessionId)}/raw/${encodePath(rawPath)}${
    qs.length > 0 ? `?${qs}` : ""
  }`;
}

export function sessionAttachmentContentUrl(
  sessionId: string | null,
  fileId: string,
  token: string | null,
  scope?: RootScope | null,
): string {
  if (sessionId === null || sessionId.length === 0 || fileId.length === 0) {
    return "";
  }
  const params = new URLSearchParams();
  appendAuthAndScope(params, token, scope);
  const qs = params.toString();
  return `/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(fileId)}/content${
    qs.length > 0 ? `?${qs}` : ""
  }`;
}

/* URL for an html-event bundle's index.html, served by the kernel raw route at
   /sessions/{sessionId}/raw/{filename}/index.html. The auth token is appended
   as a query param when present — the auth hook accepts it and sets the cookie
   that later iframe subresource requests use. The root scope is also appended
   so sandboxed iframes load the bundle from the session's owning project, not
   whichever project root is currently active. */
export function htmlBundleUrl(
  sessionId: string | null,
  filename: string,
  token: string | null,
  scope?: RootScope | null,
  extraQuery?: Record<string, string>,
): string {
  return sessionRawUrl(sessionId, `${filename}/index.html`, token, scope, extraQuery);
}
