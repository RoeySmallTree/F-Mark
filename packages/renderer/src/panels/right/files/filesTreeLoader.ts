import type { Client } from "../../../api/client.js";
import type { RootScope } from "../../../api/rootScope.js";
import { useStore } from "../../../state/store.js";

const inFlightByPath = new Map<string, Promise<void>>();

export interface LoadFilesTreeOptions {
  force?: boolean;
}

/* `path` is the ABSOLUTE root path used as the store cache key; `scope` is
   the required root scope sent to the server (X4b). When omitted, scope
   defaults to `{ root: path }` so the in-app Files panel keeps working. */
export function loadFilesTree(
  client: Pick<Client, "fetchFilesTree">,
  path: string,
  options: LoadFilesTreeOptions & { scope?: RootScope } = {},
): Promise<void> {
  const force = options.force === true;
  const scope: RootScope = options.scope ?? { root: path };
  const state = useStore.getState();

  if (!force && state.filesTreeByPath[path] !== undefined) {
    return Promise.resolve();
  }

  const existing = inFlightByPath.get(path);
  if (existing !== undefined) {
    return existing;
  }

  state.setFilesTreeLoading(path, true);
  const request = client
    .fetchFilesTree(scope)
    .then((tree) => {
      useStore.getState().setFilesTree(path, tree);
    })
    .catch((err) => {
      console.error("fetchFilesTree failed", err);
      useStore.getState().setFilesTree(path, null);
    })
    .finally(() => {
      inFlightByPath.delete(path);
      useStore.getState().setFilesTreeLoading(path, false);
    });

  inFlightByPath.set(path, request);
  return request;
}
