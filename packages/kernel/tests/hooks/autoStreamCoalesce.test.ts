import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  bootstrapProject,
  findCallByUrl,
  jsonBodyOf,
  runAssistantHook,
  stopPayload,
  writeSessionEvent,
  writeTranscript,
} from "./autoStream/helpers.js";

let saved: string | undefined;
let xdg: string | null = null;

beforeEach(async () => {
  saved = process.env.XDG_CONFIG_HOME;
  xdg = await mkdtemp(join(tmpdir(), "fm-coalesce-xdg-"));
  process.env.XDG_CONFIG_HOME = xdg;
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (saved === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = saved;
  if (xdg !== null) {
    await rm(xdg, { recursive: true, force: true });
    xdg = null;
  }
});

function delta(content: string): string {
  return `---\nsource: hook\narbitrary: true\n---\n${content}\n`;
}

describe("Stop coalesces streamed delta runs", () => {
  it("supersedes a delta run with one transcript-content prose event", async () => {
    const { dir, fmark } = await bootstrapProject();
    const d1 = "20260625T120000.001Z_ag-claude.prose.md";
    const d2 = "20260625T120000.002Z_ag-claude.prose.md";
    await writeSessionEvent(fmark, d1, delta("Hello "));
    await writeSessionEvent(fmark, d2, delta("world"));
    const transcript = await writeTranscript(dir, "t.jsonl", [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "Hello world" }] },
    ]);

    const f = await runAssistantHook(stopPayload(dir, transcript));

    const call = findCallByUrl(f, (u) => u.endsWith("/events/prose"));
    expect(call).toBeDefined();
    const body = jsonBodyOf(call!) as {
      content: string;
      arbitrary: boolean;
      supersedes?: string[];
    };
    // Clean transcript content (no delta-boundary newline artifacts).
    expect(body.content).toBe("Hello world");
    expect(body.arbitrary).toBe(false);
    // Hides both streamed fragments.
    expect(body.supersedes).toEqual([d1, d2]);
    // Stamped at the first delta's time so it keeps its place in visible reads.
    expect(body.timestamp).toBe("20260625T120000.001Z");
  });

  it("coalesces each delta run of a multi-block turn independently", async () => {
    const { dir, fmark } = await bootstrapProject();
    await writeSessionEvent(fmark, "20260625T120000.001Z_ag-claude.prose.md", delta("First "));
    await writeSessionEvent(fmark, "20260625T120000.002Z_ag-claude.prose.md", delta("block"));
    await writeSessionEvent(
      fmark,
      "20260625T120000.003Z_ag-claude.tool-use.json",
      JSON.stringify({
        schema: "fmark.tool-use.v1",
        participant_id: "ag-claude",
        tool_name: "Read",
        tool_use_id: "tu-read",
        input: {},
        result: null,
        success: true,
      }),
    );
    await writeSessionEvent(fmark, "20260625T120000.004Z_ag-claude.prose.md", delta("Second "));
    await writeSessionEvent(fmark, "20260625T120000.005Z_ag-claude.prose.md", delta("block"));
    const transcript = await writeTranscript(dir, "t2.jsonl", [
      { role: "user", content: [{ type: "text", text: "go" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "First block" },
          { type: "tool_use", id: "tu-read", name: "Read", input: {} },
          { type: "text", text: "Second block" },
        ],
      },
    ]);

    const f = await runAssistantHook(stopPayload(dir, transcript));

    const prose = f.mock.calls
      .filter((c) => String(c[0]).endsWith("/events/prose"))
      .map((c) => jsonBodyOf(c) as { content: string; supersedes?: string[] });
    expect(prose).toHaveLength(2);
    expect(prose[0]).toMatchObject({
      content: "First block",
      supersedes: [
        "20260625T120000.001Z_ag-claude.prose.md",
        "20260625T120000.002Z_ag-claude.prose.md",
      ],
    });
    expect(prose[1]).toMatchObject({
      content: "Second block",
      supersedes: [
        "20260625T120000.004Z_ag-claude.prose.md",
        "20260625T120000.005Z_ag-claude.prose.md",
      ],
    });
  });

  it("matches blocks to runs by content, not by position (ignores a stray run)", async () => {
    const { dir, fmark } = await bootstrapProject();
    // A stray live delta that never made it into the transcript.
    await writeSessionEvent(fmark, "20260625T120000.001Z_ag-claude.prose.md", delta("Stray thought"));
    await writeSessionEvent(
      fmark,
      "20260625T120000.002Z_ag-claude.tool-use.json",
      JSON.stringify({
        schema: "fmark.tool-use.v1",
        participant_id: "ag-claude",
        tool_name: "Read",
        tool_use_id: "tu-x",
        input: {},
        result: null,
        success: true,
      }),
    );
    // The real streamed run for the answer.
    await writeSessionEvent(fmark, "20260625T120000.003Z_ag-claude.prose.md", delta("Ans"));
    await writeSessionEvent(fmark, "20260625T120000.004Z_ag-claude.prose.md", delta("wer"));
    const transcript = await writeTranscript(dir, "t3.jsonl", [
      { role: "user", content: [{ type: "text", text: "go" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Answer" },
          { type: "tool_use", id: "tu-x", name: "Read", input: {} },
          { type: "text", text: "Final" },
        ],
      },
    ]);

    const f = await runAssistantHook(stopPayload(dir, transcript));

    const prose = f.mock.calls
      .filter((c) => String(c[0]).endsWith("/events/prose"))
      .map((c) => jsonBodyOf(c) as { content: string; supersedes?: string[] });
    const answer = prose.find((p) => p.content === "Answer");
    // "Answer" supersedes the REAL run, never the stray delta.
    expect(answer?.supersedes).toEqual([
      "20260625T120000.003Z_ag-claude.prose.md",
      "20260625T120000.004Z_ag-claude.prose.md",
    ]);
    // The stray delta is superseded by nobody.
    const allSupersedes = prose.flatMap((p) => p.supersedes ?? []);
    expect(allSupersedes).not.toContain("20260625T120000.001Z_ag-claude.prose.md");
    // "Final" never streamed → left uncoalesced (no supersedes).
    expect(prose.find((p) => p.content === "Final")?.supersedes).toBeUndefined();
  });

  it("collapses an MCP-posted duplicate of a streamed message", async () => {
    const { dir, fmark } = await bootstrapProject();
    const d1 = "20260625T120000.001Z_ag-claude.prose.md";
    const d2 = "20260625T120000.002Z_ag-claude.prose.md";
    const mcp = "20260625T120000.003Z_ag-claude.prose.md";
    await writeSessionEvent(fmark, d1, delta("Hello "));
    await writeSessionEvent(fmark, d2, delta("world"));
    await writeSessionEvent(fmark, mcp, "---\nsource: mcp\n---\nHello world\n");
    const transcript = await writeTranscript(dir, "t4.jsonl", [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "Hello world" }] },
    ]);

    const f = await runAssistantHook(stopPayload(dir, transcript));

    const call = findCallByUrl(f, (u) => u.endsWith("/events/prose"));
    const body = jsonBodyOf(call!) as { content: string; supersedes?: string[] };
    expect(body.content).toBe("Hello world");
    // Both fragments AND the MCP duplicate collapse into the one canonical event.
    expect(body.supersedes).toEqual([d1, d2, mcp]);
  });

  it("skips coalescing when two runs share content (ambiguous), never superseding the wrong one", async () => {
    const { dir, fmark } = await bootstrapProject();
    const a1 = "20260625T120000.001Z_ag-claude.prose.md";
    const a2 = "20260625T120000.002Z_ag-claude.prose.md";
    const b1 = "20260625T120000.004Z_ag-claude.prose.md";
    const b2 = "20260625T120000.005Z_ag-claude.prose.md";
    await writeSessionEvent(fmark, a1, delta("Do"));
    await writeSessionEvent(fmark, a2, delta("ne"));
    await writeSessionEvent(
      fmark,
      "20260625T120000.003Z_ag-claude.tool-use.json",
      JSON.stringify({
        schema: "fmark.tool-use.v1",
        participant_id: "ag-claude",
        tool_name: "Read",
        tool_use_id: "tu-z",
        input: {},
        result: null,
        success: true,
      }),
    );
    await writeSessionEvent(fmark, b1, delta("Do"));
    await writeSessionEvent(fmark, b2, delta("ne"));
    const transcript = await writeTranscript(dir, "t5.jsonl", [
      { role: "user", content: [{ type: "text", text: "go" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Done" },
          { type: "tool_use", id: "tu-z", name: "Read", input: {} },
          { type: "text", text: "Final answer" },
        ],
      },
    ]);

    const f = await runAssistantHook(stopPayload(dir, transcript));

    const prose = f.mock.calls
      .filter((c) => String(c[0]).endsWith("/events/prose"))
      .map((c) => jsonBodyOf(c) as { content: string; supersedes?: string[] });
    // Neither ambiguous "Done" run is superseded — safety over coverage.
    const allSupersedes = prose.flatMap((p) => p.supersedes ?? []);
    for (const f of [a1, a2, b1, b2]) expect(allSupersedes).not.toContain(f);
    // The ambiguous "Done" block is left uncoalesced (no supersedes).
    expect(prose.find((p) => p.content === "Done")?.supersedes).toBeUndefined();
  });
});
