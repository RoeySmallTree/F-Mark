import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findManagedCodexRollout,
  readCodexLiveTextEntries,
} from "../../src/services/codexRolloutLiveText.js";

async function writeRollout(root: string, name: string, lines: unknown[]) {
  const dir = join(root, "2026", "06", "16");
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(
    path,
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    "utf8",
  );
  return path;
}

describe("codex rollout live text", () => {
  it("finds the managed rollout by cwd, F-Mark session id, and participant id", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-codex-rollout-"));
    try {
      await writeRollout(root, "rollout-other.jsonl", [
        {
          type: "session_meta",
          payload: { id: "other", cwd: "/workspace/project" },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "ag-codex-1 sess-1" }],
          },
        },
      ]);
      const wanted = await writeRollout(root, "rollout-wanted.jsonl", [
        {
          type: "session_meta",
          payload: { id: "wanted", cwd: "/workspace/project" },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "<!-- fmark:launch-prompt:v1 --> fmark.launch ag-codex-1 sess-1",
              },
            ],
          },
        },
      ]);
      const found = await findManagedCodexRollout({
        sessionsRoot: root,
        projectRoot: "/workspace/project",
        participantId: "ag-codex-1",
        sessionId: "sess-1",
      });
      expect(found).toBe(wanted);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores matching managed rollouts older than the requested cutoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-codex-rollout-"));
    try {
      const old = await writeRollout(root, "rollout-old.jsonl", [
        {
          type: "session_meta",
          payload: { id: "old", cwd: "/workspace/project" },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "<!-- fmark:launch-prompt:v1 --> fmark.launch ag-codex-1 sess-1",
              },
            ],
          },
        },
      ]);
      const fresh = await writeRollout(root, "rollout-fresh.jsonl", [
        {
          type: "session_meta",
          payload: { id: "fresh", cwd: "/workspace/project" },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: "<!-- fmark:launch-prompt:v1 --> fmark.launch ag-codex-1 sess-1",
              },
            ],
          },
        },
      ]);
      const oldDate = new Date("2026-06-16T12:00:00.000Z");
      const freshDate = new Date("2026-06-16T12:05:00.000Z");
      await utimes(old, oldDate, oldDate);
      await utimes(fresh, freshDate, freshDate);

      const found = await findManagedCodexRollout({
        sessionsRoot: root,
        projectRoot: "/workspace/project",
        participantId: "ag-codex-1",
        sessionId: "sess-1",
        notBeforeMs: Date.parse("2026-06-16T12:01:00.000Z"),
      });
      expect(found).toBe(fresh);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("extracts only commentary agent_message events and skips duplicate response_item copies", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-codex-rollout-"));
    try {
      const rollout = await writeRollout(root, "rollout-live.jsonl", [
        { type: "session_meta", payload: { id: "r1", cwd: "/workspace/project" } },
        { type: "event_msg", payload: { type: "task_started" } },
        {
          timestamp: "2026-06-16T12:00:00.000Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            phase: "commentary",
            message: "I am checking the route.",
          },
        },
        {
          timestamp: "2026-06-16T12:00:00.001Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            phase: "commentary",
            content: [{ type: "output_text", text: "I am checking the route." }],
          },
        },
        {
          timestamp: "2026-06-16T12:00:10.000Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            phase: "final_answer",
            message: "Done.",
          },
        },
      ]);

      const first = await readCodexLiveTextEntries({
        rolloutPath: rollout,
        afterLine: 0,
      });
      expect(first.entries).toEqual([
        {
          line: 3,
          timestamp: "2026-06-16T12:00:00.000Z",
          content: "I am checking the route.",
        },
      ]);

      const second = await readCodexLiveTextEntries({
        rolloutPath: rollout,
        afterLine: first.nextLine,
      });
      expect(second.entries).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips commentary entries older than the requested cutoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-codex-rollout-"));
    try {
      const rollout = await writeRollout(root, "rollout-live.jsonl", [
        { type: "session_meta", payload: { id: "r1", cwd: "/workspace/project" } },
        {
          timestamp: "2026-06-16T12:00:00.000Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            phase: "commentary",
            message: "Old line.",
          },
        },
        {
          timestamp: "2026-06-16T12:00:10.000Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            phase: "commentary",
            message: "Fresh line.",
          },
        },
      ]);

      const result = await readCodexLiveTextEntries({
        rolloutPath: rollout,
        afterLine: 0,
        notBeforeMs: Date.parse("2026-06-16T12:00:05.000Z"),
      });

      expect(result.entries).toEqual([
        {
          line: 3,
          timestamp: "2026-06-16T12:00:10.000Z",
          content: "Fresh line.",
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
