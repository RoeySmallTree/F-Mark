import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createFilesWatcher, isFileTreeWatchIgnored } from "../../src/services/filesWatcher.js";
import type { BusMessage } from "../../src/ws/bus.js";

class FakeWatcher extends EventEmitter {
  closed = false;
  close(): void {
    this.closed = true;
  }
}

describe("files watcher", () => {
  it("coalesces relevant filesystem changes into one files.changed message", async () => {
    vi.useFakeTimers();
    let activeRoot = "/project-a";
    const watchers: FakeWatcher[] = [];
    const published: BusMessage[] = [];
    const watchFn = vi.fn((root: string, _opts: unknown, listener: (event: string, filename: string) => void) => {
      const watcher = new FakeWatcher();
      watchers.push(watcher);
      watcher.on("change", (filename) => listener("change", filename as string));
      expect(root).toBe(activeRoot);
      return watcher;
    });

    const service = createFilesWatcher({
      getRoot: () => activeRoot,
      bus: { publish: (message) => published.push(message) },
      debounceMs: 25,
      pollMs: 1_000,
      watchFn: watchFn as never,
    });

    watchers[0]!.emit("change", "src/a.ts");
    watchers[0]!.emit("change", "src/b.ts");
    await vi.advanceTimersByTimeAsync(24);
    expect(published).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(published).toEqual([{ type: "files.changed", root: "/project-a" }]);

    watchers[0]!.emit("change", ".git/index");
    watchers[0]!.emit("change", "node_modules/pkg/index.js");
    await vi.advanceTimersByTimeAsync(30);
    expect(published).toHaveLength(1);

    activeRoot = "/project-b";
    await vi.advanceTimersByTimeAsync(1_000);
    expect(watchers[0]!.closed).toBe(true);
    expect(watchers).toHaveLength(2);

    watchers[1]!.emit("change", "new-file.md");
    await vi.advanceTimersByTimeAsync(25);
    expect(published.at(-1)).toEqual({
      type: "files.changed",
      root: "/project-b",
    });

    service.close();
    expect(watchers[1]!.closed).toBe(true);
    vi.useRealTimers();
  });

  it("uses the same force-ignore folders as the file tree", () => {
    expect(isFileTreeWatchIgnored(".f-mark/sessions/x")).toBe(true);
    expect(isFileTreeWatchIgnored(".git/index")).toBe(true);
    expect(isFileTreeWatchIgnored("node_modules/pkg/index.js")).toBe(true);
    expect(isFileTreeWatchIgnored("src/index.ts")).toBe(false);
  });
});
