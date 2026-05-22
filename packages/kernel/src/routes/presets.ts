import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import type { FastifyInstance } from "fastify";
import type { Preset, PresetGroup } from "@f-mark/shared";
import type { Paths } from "../paths.js";

function builtinPresetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src is at packages/kernel/src/routes; dist is at packages/kernel/dist/routes
  // assets is at packages/kernel/assets
  return join(here, "..", "..", "assets", "presets");
}

const VALID_GROUPS = new Set<PresetGroup>(["generate", "critique", "format"]);

async function loadPresets(
  dir: string,
  source: "builtin" | "project",
): Promise<Preset[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const presets: Preset[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const fullPath = join(dir, name);
    let raw: string;
    try {
      raw = await readFile(fullPath, "utf8");
    } catch {
      continue;
    }
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const presetName = typeof data.name === "string" ? data.name : null;
    const groupCandidate = typeof data.group === "string"
      ? (data.group as PresetGroup)
      : null;
    if (
      presetName === null ||
      groupCandidate === null ||
      !VALID_GROUPS.has(groupCandidate)
    ) {
      continue;
    }
    const preset: Preset = {
      name: presetName,
      group: groupCandidate,
      body: parsed.content.trim(),
      source,
      path: fullPath,
    };
    if (typeof data.icon === "string") preset.icon = data.icon;
    presets.push(preset);
  }
  presets.sort((a, b) => a.name.localeCompare(b.name));
  return presets;
}

export function registerPresetRoutes(app: FastifyInstance, p: Paths): void {
  app.get<{ Querystring: { session?: string } }>(
    "/presets",
    async (req) => {
      const builtin = await loadPresets(builtinPresetsDir(), "builtin");
      let project: Preset[] = [];
      if (typeof req.query.session === "string" && req.query.session.length > 0) {
        const projectDir = join(p.fmarkDir(), "presets");
        project = await loadPresets(projectDir, "project");
      }
      return { builtin, project };
    },
  );
}
