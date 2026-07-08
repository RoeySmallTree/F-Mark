import { useMemo } from "react";
import { createClient, type Client } from "../../api/client.js";

export function useFileTreeClient(token: string | null): Client {
  return useMemo(() => createClient({ baseUrl: "", token }), [token]);
}
