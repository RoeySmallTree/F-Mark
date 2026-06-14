import type { Client } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";

const inFlightByPath = new Map<string, Promise<void>>();

export interface LoadFilesTreeOptions {
  force?: boolean;
}

export function loadFilesTree(
  client: Pick<Client, "fetchFilesTree">,
  path: string,
  options: LoadFilesTreeOptions = {},
): Promise<void> {
  const force = options.force === true;
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
    .fetchFilesTree(path)
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
