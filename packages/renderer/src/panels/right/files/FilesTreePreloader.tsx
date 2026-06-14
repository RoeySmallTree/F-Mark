import { useEffect, useMemo } from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import { loadFilesTree } from "./filesTreeLoader.js";

export function FilesTreePreloader(): null {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );

  useEffect(() => {
    if (activePath === null) return;
    void loadFilesTree(client, activePath);
  }, [activePath, client]);

  return null;
}
