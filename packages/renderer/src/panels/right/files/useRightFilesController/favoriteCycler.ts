import type { Client } from "../../../../api/client.js";
import type { RootScope } from "../../../../api/rootScope.js";
import type { FavoriteScope } from "../buildTreeView.js";

const NO_LOOSE_STRING_VALUES = {
  session: "session",
  project: "project",
} as const;

interface CycleFilesFavoriteInput {
  client: Pick<Client, "addFilesFavorite" | "removeFilesFavorite">;
  currentSessionId: string | null;
  selectedPath: string;
  favScope: RootScope | undefined;
  setFilesFavoritesProject(path: string, paths: string[]): void;
  setFilesFavoritesSession(sessionId: string, paths: string[]): void;
}

export async function cycleFilesFavorite(
  input: CycleFilesFavoriteInput,
  absPath: string,
  current: FavoriteScope,
): Promise<void> {
  if (current === null) {
    await addSessionFavorite(input, absPath);
    return;
  }
  if (current === NO_LOOSE_STRING_VALUES.session) {
    await promoteSessionFavorite(input, absPath);
    return;
  }
  await removeProjectFavorite(input, absPath);
}

async function addSessionFavorite(
  input: CycleFilesFavoriteInput,
  absPath: string,
): Promise<void> {
  if (input.currentSessionId === null) return;
  const res = await input.client.addFilesFavorite({
    scope: NO_LOOSE_STRING_VALUES.session,
    sessionId: input.currentSessionId,
    path: absPath,
    root: input.favScope,
  });
  input.setFilesFavoritesSession(input.currentSessionId, res.paths);
}

async function promoteSessionFavorite(
  input: CycleFilesFavoriteInput,
  absPath: string,
): Promise<void> {
  if (input.currentSessionId !== null) {
    const sres = await input.client.removeFilesFavorite({
      scope: NO_LOOSE_STRING_VALUES.session,
      sessionId: input.currentSessionId,
      path: absPath,
      root: input.favScope,
    });
    input.setFilesFavoritesSession(input.currentSessionId, sres.paths);
  }
  await addProjectFavorite(input, absPath);
}

async function addProjectFavorite(
  input: CycleFilesFavoriteInput,
  absPath: string,
): Promise<void> {
  const pres = await input.client.addFilesFavorite({
    scope: NO_LOOSE_STRING_VALUES.project,
    path: absPath,
    root: input.favScope,
  });
  input.setFilesFavoritesProject(input.selectedPath, pres.paths);
}

async function removeProjectFavorite(
  input: CycleFilesFavoriteInput,
  absPath: string,
): Promise<void> {
  const pres = await input.client.removeFilesFavorite({
    scope: NO_LOOSE_STRING_VALUES.project,
    path: absPath,
    root: input.favScope,
  });
  input.setFilesFavoritesProject(input.selectedPath, pres.paths);
}
