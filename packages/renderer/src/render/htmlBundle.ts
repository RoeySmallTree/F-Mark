/* URL for an html-event bundle's index.html, served by the kernel raw route at
   /sessions/{sessionId}/raw/{filename}/index.html. The auth token is appended
   as a query param when present — the auth hook accepts it and sets the cookie
   that later iframe subresource requests use. `extraQuery` (e.g. a reload
   nonce) is merged in. Returns "" when sessionId or filename is missing. */
export function htmlBundleUrl(
  sessionId: string | null,
  filename: string,
  token: string | null,
  extraQuery?: Record<string, string>,
): string {
  if (sessionId === null || sessionId.length === 0 || filename.length === 0) {
    return "";
  }
  const params = new URLSearchParams();
  if (token !== null && token.length > 0) params.set("token", token);
  if (extraQuery !== undefined) {
    for (const [k, v] of Object.entries(extraQuery)) params.set(k, v);
  }
  const qs = params.toString();
  return `/sessions/${sessionId}/raw/${filename}/index.html${
    qs.length > 0 ? `?${qs}` : ""
  }`;
}
