import chokidar from "chokidar";
import { basename, dirname, relative } from "node:path";
import { parseFilename } from "@f-mark/shared";
import type { Paths } from "./paths.js";
import type { Bus } from "./ws/bus.js";

export type StopWatcher = () => Promise<void>;

export async function startWatcher(p: Paths, bus: Bus): Promise<StopWatcher> {
  const watcher = chokidar.watch(p.sessionsDir(), {
    ignoreInitial: true,
    depth: 3,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
  });

  watcher.on("add", (path) => {
    const filename = basename(path);
    const parsed = parseFilename(filename);
    if (parsed === null) return;
    const rel = relative(p.sessionsDir(), dirname(path));
    const sessionId = rel.split("/")[0];
    if (sessionId === undefined || sessionId.length === 0) return;
    bus.publish({
      type: "event_added",
      session_id: sessionId,
      filename,
      kind: parsed.kind,
      participant_id: parsed.participant_id,
    });
  });

  await new Promise<void>((resolve) => watcher.once("ready", () => resolve()));

  return async () => {
    await watcher.close();
  };
}
