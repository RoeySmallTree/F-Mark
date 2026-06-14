/* Regression: "opencode" is the longest runtime name (8 chars). A spawned
   opencode agent gets a participant id like `ag-opencode-3a2f` — 13 chars
   after the `ag-` kind prefix. The participant-id pattern AND the canonical
   event-filename parser both capped that segment at {2,12}, so opencode
   agents were rejected at spawn ("invalid participant_id") and their event
   files could not be parsed. claude/codex fit under 12; only
   opencode overflowed — which is why opencode "wasn't properly applied". */

import { describe, expect, test } from "vitest";
import { isValidParticipantId } from "../src/participants.js";
import { parseFilename } from "@f-mark/shared";

describe("participant id accommodates the longest runtime (opencode)", () => {
  test("isValidParticipantId accepts ag-opencode-<hex>", () => {
    expect(isValidParticipantId("ag-opencode-3a2f")).toBe(true);
  });

  test("still accepts the shorter builtins", () => {
    expect(isValidParticipantId("ag-claude-414f")).toBe(true);
    expect(isValidParticipantId("ag-codex-1234")).toBe(true);
  });

  test("still rejects malformed ids", () => {
    expect(isValidParticipantId("ag-")).toBe(false);
    expect(isValidParticipantId("xx-opencode-3a2f")).toBe(false);
    expect(isValidParticipantId("ag-Opencode-3a2f")).toBe(false); // uppercase
    expect(isValidParticipantId("ag-this-is-way-too-long-1234")).toBe(false);
  });

  test("event filename parser handles an opencode participant", () => {
    const parsed = parseFilename(
      "20260530T162424.797Z_ag-opencode-3a2f.prose.json",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.participant_id).toBe("ag-opencode-3a2f");
    expect(parsed?.kind).toBe("prose");
  });
});
