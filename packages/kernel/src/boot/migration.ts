import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computePathId } from "../paths/identity.js";
import type { GlobalPaths } from "../paths/global.js";

/* One-shot migration from the v0.4 per-path layout to v0.5's global tree.

   Triggers only when ~/.config/f-mark/state.json does not exist yet. On
   trigger, for the kernel's boot-time cwd:

     <cwd>/.f-mark/agents/   →   ~/.config/f-mark/projects/<pathId>/agents/
     <cwd>/.f-mark/runtimes.json → ~/.config/f-mark/projects/<pathId>/runtimes.json
     <cwd>/.f-mark/config.json   → split: participants stays in <cwd>/.f-mark/
                                          participants.json; version/port/host
                                          promote to ~/.config/f-mark/config.json
                                          (only if missing globally).

   Sessions in <cwd>/.f-mark/sessions/ are left in place — they're addressed
   by activePath, which the boot path sets to <cwd> for the migrated user. */

interface MigrationResult {
  migrated: boolean;
  pathId?: string;
  movedAgents?: boolean;
  movedRuntimes?: boolean;
  splitConfig?: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

async function moveDir(from: string, to: string): Promise<void> {
  // fs.cp + rm avoids EXDEV when src and dst are on different filesystems
  // (common when ~/.config is on a different mount than the project tree).
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
  await rm(from, { recursive: true, force: true });
}

export async function runV04Migration(
  cwd: string,
  g: GlobalPaths,
): Promise<MigrationResult> {
  // Gate: if state.json already exists, migration ran (or this is a fresh
  // v0.5 install). Either way, no-op.
  if (await exists(g.stateFile())) {
    return { migrated: false };
  }

  // Ensure the global tree skeleton exists.
  await mkdir(g.configDir(), { recursive: true });
  await mkdir(g.projectsDir(), { recursive: true });

  const cwdFmark = join(cwd, ".f-mark");
  // If there's no .f-mark/ at cwd, there's nothing to migrate — this is a
  // truly fresh install. We still want to write state.json so subsequent
  // boots skip migration; just leave the global tree otherwise empty.
  const haveCwdFmark = await exists(cwdFmark);

  const pathId = computePathId(cwd);
  const result: MigrationResult = { migrated: true, pathId };

  // Always write the project's path-pointer so reverse lookups work.
  const projectDir = g.projectDir(pathId);
  await mkdir(projectDir, { recursive: true });
  await writeFile(g.projectPathFile(pathId), cwd, "utf8");

  if (haveCwdFmark) {
    const cwdAgents = join(cwdFmark, "agents");
    if (await exists(cwdAgents)) {
      await moveDir(cwdAgents, g.projectAgentsDir(pathId));
      result.movedAgents = true;
    }

    const cwdRuntimes = join(cwdFmark, "runtimes.json");
    if (await exists(cwdRuntimes)) {
      const dest = g.projectRuntimesFile(pathId);
      await mkdir(projectDir, { recursive: true });
      await cp(cwdRuntimes, dest);
      await rm(cwdRuntimes, { force: true });
      result.movedRuntimes = true;
    }

    const cwdConfig = join(cwdFmark, "config.json");
    if (await exists(cwdConfig)) {
      const raw = await readFile(cwdConfig, "utf8");
      try {
        const parsed = JSON.parse(raw) as {
          version?: string;
          port?: number;
          host?: string;
          participants?: Record<string, unknown>;
        };
        // participants → per-path participants.json (separate file, leaves
        // config.json alone for now so old code paths reading it during
        // shutdown don't trip).
        if (parsed.participants && typeof parsed.participants === "object") {
          await writeFile(
            join(cwdFmark, "participants.json"),
            JSON.stringify({ participants: parsed.participants }, null, 2),
            "utf8",
          );
        }
        // version/port/host → global config.json (only if not already set).
        if (!(await exists(g.configFile()))) {
          await writeFile(
            g.configFile(),
            JSON.stringify(
              {
                version: parsed.version ?? "0.1.0",
                port: parsed.port ?? 7777,
                host: parsed.host ?? "localhost",
              },
              null,
              2,
            ),
            "utf8",
          );
        }
        result.splitConfig = true;
      } catch {
        // malformed config.json — skip the split, leave it for the user
      }
    }
  }

  // Seed state.json so subsequent boots skip this code path.
  await writeFile(
    g.stateFile(),
    JSON.stringify(
      {
        activePath: cwd,
        activeRevision: 1,
        knownPaths: [cwd],
        favorites: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  return result;
}
