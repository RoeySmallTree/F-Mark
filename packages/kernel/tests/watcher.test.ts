import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initProject } from "../src/project.js";
import { paths } from "../src/paths.js";
import { createSession } from "../src/sessions.js";
import { startWatcher } from "../src/watcher.js";
import { withTempProject } from "./helpers/tempdir.js";
import type { BusMessage } from "../src/ws/bus.js";

describe("watcher", () => {
  it("emits event_added when a valid event file is created externally", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const messages: BusMessage[] = [];
      const stop = await startWatcher(p, {
        publish(m) {
          messages.push(m);
        },
      });
      try {
        await writeFile(
          join(p.sessionDir(session.id), "20260522T143012Z_us-test.prose.md"),
          "hi",
        );
        await new Promise((r) => setTimeout(r, 600));
        expect(
          messages.find(
            (m) =>
              m.type === "event_added" &&
              m.filename === "20260522T143012Z_us-test.prose.md",
          ),
        ).toBeDefined();
      } finally {
        await stop();
      }
    });
  });

  it("ignores non-event files", async () => {
    await withTempProject(async (root) => {
      const p = paths(root);
      await initProject(p);
      const session = await createSession(p, { slug: "x" });
      const messages: BusMessage[] = [];
      const stop = await startWatcher(p, {
        publish(m) {
          messages.push(m);
        },
      });
      try {
        await writeFile(join(p.sessionDir(session.id), "random.txt"), "x");
        await new Promise((r) => setTimeout(r, 600));
        expect(messages).toHaveLength(0);
      } finally {
        await stop();
      }
    });
  });
});
