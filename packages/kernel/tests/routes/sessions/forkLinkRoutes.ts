import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listParticipants } from "../../../src/participants.js";
import { withTempProject } from "../../helpers/tempdir.js";
import {
  expectForkAgentParticipantState,
  expectForkAgentSpawnCall,
  expectForkLinkCount,
  expectManagedForkAgentStatus,
  expectOnlyForkLink,
  expectRelaunchedForkAgent,
  forkSession,
  makeForkable,
  withForkableApp,
  withForkableClaudeAgentApp,
} from "./helpers.js";

export function registerForkLinkSessionRouteTests(): void {
  describe("POST /sessions/:id/fork — fork-link events", () => {
    it(
      "writes fork-link(to) into source and fork-link(from) into fork; sys-fork is created",
      writesForkLinksAndCreatesSysFork,
    );
    it("does not duplicate sys-fork across two forks", doesNotDuplicateSysFork);
    it(
      "second fork from same source does NOT copy the first fork's source-side fork-link",
      secondForkDoesNotCopyFirstForkLink,
    );
    it(
      "fork-of-a-fork does NOT inherit the parent fork's fork-link(from)",
      forkOfForkDoesNotInheritParentForkLink,
    );
    it("repairs an existing sys-fork row with wrong kind", repairsSysForkKind);
    it(
      "duplicates source agent metadata into the fork without moving the source agent",
      duplicatesSourceAgentMetadataIntoFork,
    );
  });
}

async function writesForkLinksAndCreatesSysFork(): Promise<void> {
  await withTempProject(async (root) => {
    await withForkableApp(root, async ({ app, p, sourceId }) => {
      const res = await forkSession(app, sourceId, "child");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const forkId = body.session.id;
      expect(body.warnings ?? []).toEqual([]);

      expectOnlyForkLink(p, sourceId, {
        direction: "to",
        other_session_id: forkId,
        other_session_slug: "child",
      });
      expectOnlyForkLink(p, forkId, {
        direction: "from",
        other_session_id: sourceId,
        other_session_slug: "src",
      });

      const participants = await listParticipants(p);
      expect(participants["sys-fork"]).toBeDefined();
      expect(participants["sys-fork"]!.kind).toBe("sys");

      // Regression: .fork.json still written.
      expect(existsSync(join(p.sessionDir(forkId), ".fork.json"))).toBe(true);
    });
  });
}

async function doesNotDuplicateSysFork(): Promise<void> {
  await withTempProject(async (root) => {
    await withForkableApp(root, async ({ app, p, sourceId }) => {
      await forkSession(app, sourceId, "a");
      await forkSession(app, sourceId, "b");
      const participants = await listParticipants(p);
      const sysForkRows = Object.entries(participants).filter(
        ([id]) => id === "sys-fork",
      );
      expect(sysForkRows.length).toBe(1);
    });
  });
}

async function secondForkDoesNotCopyFirstForkLink(): Promise<void> {
  await withTempProject(async (root) => {
    await withForkableApp(root, async ({ app, p, sourceId }) => {
      const r1 = await forkSession(app, sourceId, "a");
      const r2 = await forkSession(app, sourceId, "b");
      const aId = r1.json().session.id;
      const bId = r2.json().session.id;

      // Source now has TWO fork-link(to) events (one per fork).
      expectForkLinkCount(p, sourceId, 2);

      // Fork b must contain EXACTLY one fork-link, its own (from src),
      // not the source-side "to a" marker that exists in source.
      expectOnlyForkLink(p, bId, {
        direction: "from",
        other_session_id: sourceId,
      });

      // Fork a is unaffected.
      expectForkLinkCount(p, aId, 1);
    });
  });
}

async function forkOfForkDoesNotInheritParentForkLink(): Promise<void> {
  await withTempProject(async (root) => {
    await withForkableApp(root, async ({ app, p, sourceId }) => {
      const r1 = await forkSession(app, sourceId, "child");
      const childId = r1.json().session.id;
      const r2 = await forkSession(app, childId, "grandchild");
      const grandchildId = r2.json().session.id;

      // Direction is "from"; other = child (the immediate parent),
      // NOT the original source.
      expectOnlyForkLink(p, grandchildId, {
        direction: "from",
        other_session_id: childId,
      });
    });
  });
}

async function repairsSysForkKind(): Promise<void> {
  await withTempProject(async (root) => {
    await withForkableApp(root, async ({ app, p, sourceId }) => {
      // First fork bootstraps participants.json with a correct sys-fork row.
      await forkSession(app, sourceId, "bootstrap");
      // Corrupt the sys-fork row directly on disk.
      const file = join(p.fmarkDir(), "participants.json");
      const current = JSON.parse(readFileSync(file, "utf8"));
      current.participants["sys-fork"] = {
        kind: "agent",
        name: "Bogus",
        color: "#ff0000",
      };
      writeFileSync(file, JSON.stringify(current, null, 2));

      // Second fork must repair the row.
      await forkSession(app, sourceId, "x");
      const fixed = await listParticipants(p);
      expect(fixed["sys-fork"]!.kind).toBe("sys");
      expect(fixed["sys-fork"]!.name).toBe("Fork");
    });
  });
}

async function duplicatesSourceAgentMetadataIntoFork(): Promise<void> {
  await withTempProject(async (root) => {
    const { p, sourceId } = await makeForkable(root);
    await withForkableClaudeAgentApp(
      root,
      p,
      sourceId,
      async ({ app, runner, agentState, sourceTmuxSession }) => {
        const res = await forkSession(app, sourceId, "child");

        expect(res.statusCode).toBe(200);
        const body = res.json();
        const forkId = body.session.id as string;
        const agentResult = expectRelaunchedForkAgent(body, root, forkId);
        expectForkAgentSpawnCall(runner, root, forkId, agentResult);
        await expectForkAgentParticipantState({
          p,
          agentState,
          sourceId,
          sourceTmuxSession,
          forkId,
          agentResult,
        });
        await expectManagedForkAgentStatus({
          app,
          runner,
          root,
          sourceTmuxSession,
          forkId,
          agentResult,
        });
        runner.verifyExpectationsConsumed();
      },
    );
  });
}
