import { watch, type FSWatcher } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { FILE_TREE_FORCE_IGNORE } from "../routes/filesTree.js";
import type { Bus } from "../ws/bus.js";

export interface FilesWatcher {
  close(): void;
}

export interface FilesWatcherDeps {
  getRoot(): string | null;
  bus: Bus;
  debounceMs?: number;
  pollMs?: number;
  watchFn?: typeof watch;
}

function relPosix(root: string, filename: string | Buffer | null): string | null {
  if (filename === null) return "";
  const raw = Buffer.isBuffer(filename) ? filename.toString("utf8") : filename;
  if (raw.length === 0) return "";
  if (!isAbsolute(raw)) return raw.split(sep).join("/");
  return relative(root, raw).split(sep).join("/");
}

export function isFileTreeWatchIgnored(relPath: string | null): boolean {
  if (relPath === null) return false;
  const segments = relPath.split("/").filter(Boolean);
  return segments.some((segment) => FILE_TREE_FORCE_IGNORE.has(segment));
}

export function createFilesWatcher(deps: FilesWatcherDeps): FilesWatcher {
  const debounceMs = deps.debounceMs ?? 150;
  const pollMs = deps.pollMs ?? 1_000;
  const watchFn = deps.watchFn ?? watch;

  let currentRoot: string | null = null;
  let watcher: FSWatcher | null = null;
  let debounce: NodeJS.Timeout | null = null;

  function clearDebounce(): void {
    if (debounce !== null) {
      clearTimeout(debounce);
      debounce = null;
    }
  }

  function publish(root: string): void {
    deps.bus.publish({ type: "files.changed", root });
  }

  function schedule(root: string): void {
    clearDebounce();
    debounce = setTimeout(() => {
      debounce = null;
      if (currentRoot === root) publish(root);
    }, debounceMs);
    debounce.unref?.();
  }

  function stopWatcher(): void {
    if (watcher !== null) {
      watcher.close();
      watcher = null;
    }
    clearDebounce();
  }

  function startWatcher(root: string): void {
    try {
      watcher = watchFn(
        root,
        { recursive: true },
        (_event, filename) => {
          const rel = relPosix(root, filename);
          if (isFileTreeWatchIgnored(rel)) return;
          schedule(root);
        },
      );
      watcher.on("error", () => {
        stopWatcher();
      });
    } catch {
      watcher = null;
    }
  }

  function syncRoot(): void {
    const nextRoot = deps.getRoot();
    if (nextRoot === currentRoot) return;
    stopWatcher();
    currentRoot = nextRoot;
    if (nextRoot !== null) startWatcher(nextRoot);
  }

  syncRoot();
  const poll = setInterval(syncRoot, pollMs);
  poll.unref?.();

  return {
    close(): void {
      clearInterval(poll);
      stopWatcher();
    },
  };
}
