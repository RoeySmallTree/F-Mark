import type { ForkSessionResponse, SessionMeta } from "../../src/api/client.js";
import { describe, expect, test } from "vitest";
import {
  defaultForkName,
  forkSessionRequest,
  forkWarnings,
  pathLabel,
  shouldCloseAfterFork,
} from "../../src/components/forkSessionPopover/model.js";

function session(input: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: "s1",
    slug: "session-one",
    created_at: "2026-06-23T00:00:00.000Z",
    ...input,
  };
}

function forkResponse(
  input: Partial<ForkSessionResponse> = {},
): ForkSessionResponse {
  return {
    source_session_id: "s1",
    session: {
      id: "s2",
      slug: "session-one-fork",
      created_at: "2026-06-23T00:00:00.000Z",
      path: "/repo",
      path_id: "repo",
    },
    copied_entries: 3,
    agents: [],
    warnings: [],
    ...input,
  };
}

describe("forkSessionPopover model", () => {
  test("builds the default fork name from the session slug", () => {
    expect(defaultForkName(session({ slug: "alpha" }))).toBe("alpha-fork");
    expect(defaultForkName(session({ slug: "alpha-fork" }))).toBe("alpha-fork-2");
    expect(defaultForkName(session({ slug: "   " }))).toBe("fork");
  });

  test("formats source path labels", () => {
    expect(pathLabel(undefined)).toBe("current repo");
    expect(pathLabel("")).toBe("current repo");
    expect(pathLabel("/home/roey/workspace/F-Mark/")).toBe("F-Mark");
    expect(pathLabel("relative")).toBe("relative");
  });

  test("includes the target path only when forking across roots", () => {
    expect(
      forkSessionRequest(session({ path: "/repo" }), "child", "/repo"),
    ).toEqual({ name: "child" });
    expect(
      forkSessionRequest(session({ path: "/other" }), "child", "/repo"),
    ).toEqual({ name: "child", path: "/other" });
  });

  test("turns response and agent failures into visible warnings", () => {
    const warnings = forkWarnings(
      forkResponse({
        warnings: ["kernel warning"],
        agents: [
          {
            participant_id: "ag1",
            runtime_id: "codex",
            display_name: "Codex",
            status: "duplicated",
          },
          {
            participant_id: "ag2",
            runtime_id: "claude",
            display_name: "Claude",
            status: "skipped-unsupported",
          },
        ],
      }),
    );

    expect(warnings).toEqual(["kernel warning", "Claude: unsupported"]);
  });

  test("closes only when the fork completed without warnings", () => {
    expect(
      shouldCloseAfterFork(
        forkResponse({
          agents: [
            {
              participant_id: "ag1",
              runtime_id: "codex",
              display_name: "Codex",
              status: "relaunched",
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(shouldCloseAfterFork(forkResponse({ warnings: ["heads up"] }))).toBe(
      false,
    );
  });
});
