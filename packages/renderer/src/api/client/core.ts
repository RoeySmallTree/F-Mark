export interface ApiClientConfig {
  baseUrl: string;
  token: string | null;
}

export interface ApiHttpClient {
  readonly baseUrl: string;
  readonly token: string | null;
  url(path: string): string;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  fetchRaw(path: string, init: RequestInit): Promise<Response>;
  jsonHeaders(): Record<string, string>;
  authHeaders(): Record<string, string>;
}

function buildHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) h.Authorization = `Bearer ${token}`;
  return h;
}

function buildAuthHeaders(token: string | null): Record<string, string> {
  if (token === null) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function jsonOrThrow(res: Response): Promise<unknown> {
  if (res.ok) return res.json();
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  const msg =
    typeof body === "object" && body !== null && "error" in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
  throw new Error(msg);
}

/** Error thrown by `gitRevertHunk` carrying the server error `code` so the
    diff UI can branch on `HUNK_CONFLICT` (show "refresh", no corruption) vs a
    generic failure. */
export class GitRevertError extends Error {
  constructor(
    /** Server error code, e.g. `HUNK_CONFLICT` / `REVERT_NOT_ALLOWED`. */
    public readonly code: string,
    /** HTTP status. */
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitRevertError";
  }
}

export function createHttpClient(cfg: ApiClientConfig): ApiHttpClient {
  const url = (path: string): string => `${cfg.baseUrl}${path}`;
  const jsonHeaders = (): Record<string, string> => buildHeaders(cfg.token);
  const authHeaders = (): Record<string, string> => buildAuthHeaders(cfg.token);

  async function fetchRaw(path: string, init: RequestInit): Promise<Response> {
    return fetch(url(path), init);
  }

  async function fetchJson<T>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const res = await fetchRaw(path, init);
    return (await jsonOrThrow(res)) as T;
  }

  return {
    baseUrl: cfg.baseUrl,
    token: cfg.token,
    url,
    get<T>(path: string) {
      return fetchJson<T>(path, { headers: jsonHeaders() });
    },
    post<T>(path: string, body: unknown) {
      return fetchJson<T>(path, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
    },
    patch<T>(path: string, body: unknown) {
      return fetchJson<T>(path, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
    },
    put<T>(path: string, body: unknown) {
      return fetchJson<T>(path, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
    },
    del<T>(path: string) {
      /* No body on DELETE: Fastify rejects Content-Type: application/json with
         an empty body (FST_ERR_CTP_EMPTY_JSON_BODY), so omit Content-Type. */
      return fetchJson<T>(path, {
        method: "DELETE",
        headers: authHeaders(),
      });
    },
    fetchRaw,
    jsonHeaders,
    authHeaders,
  };
}
