import { act } from "@testing-library/react";
import { REPO_A, REPO_B } from "./fixtures.js";
import { emitToAllSockets } from "./mockWebSocket.js";

export async function dispatchWindowFocusTwice(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
  });
}

export async function emitPathsUpdatedForRepoA(): Promise<void> {
  await act(async () => {
    await emitToAllSockets({
      type: "paths-updated",
      paths: [{ path: REPO_A.path, path_id: REPO_A.pathId }],
    });
  });
}

export async function emitLegacyEventAdded(): Promise<void> {
  await emitEventAdded("ignored", "legacy-id");
}

export async function emitSelectedEventAdded(): Promise<void> {
  await emitEventAdded("accepted", REPO_B.pathId);
}

async function emitEventAdded(filename: string, pathId: string): Promise<void> {
  await act(async () => {
    await emitToAllSockets({
      type: "event_added",
      session_id: "selected-session",
      filename,
      kind: "prose",
      participant_id: "us-a7f3",
      pathId,
    });
  });
}
