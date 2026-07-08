import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import matter from "gray-matter";
import type { SkillFile, SkillRef } from "@f-mark/shared";
import { findSkills } from "../skills/scanner.js";

export function registerSkillRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { agent?: string } }>(
    "/skills",
    async (req) => {
      const startCwd = skillsStartCwd();
      const agent =
        typeof req.query.agent === "string" && req.query.agent.length > 0
          ? req.query.agent
          : undefined;
      const skills = await findSkills(startCwd, agent, { includeGlobal: true });
      return { skills };
    },
  );

  app.get<{ Querystring: { path?: string } }>(
    "/skills/detail",
    async (req, reply) => {
      const skill = await resolveDiscoveredSkill(req.query.path);
      if (skill === null) {
        reply.code(404);
        return {
          code: "SKILL_NOT_FOUND",
          message: "skill path is not in the discovered skills list",
        };
      }
      const detail = await readSkillFile(skill);
      if (!detail.ok) {
        reply.code(detail.status);
        return detail.body;
      }
      return detail.file;
    },
  );

  app.put<{
    Body: {
      path?: string;
      name?: string;
      description?: string;
      args?: string;
      body?: string;
    };
  }>("/skills/detail", async (req, reply) => {
    const skill = await resolveDiscoveredSkill(req.body?.path);
    if (skill === null) {
      reply.code(404);
      return {
        code: "SKILL_NOT_FOUND",
        message: "skill path is not in the discovered skills list",
      };
    }
    const input = normalizeSkillSaveBody(req.body ?? {});
    if ("error" in input) {
      reply.code(400);
      return input.error;
    }
    const current = await readSkillFile(skill);
    if (!current.ok) {
      reply.code(current.status);
      return current.body;
    }
    const nextFrontmatter: Record<string, unknown> = {
      ...current.file.frontmatter,
      name: input.value.name,
      description: input.value.description,
    };
    if (input.value.args.length > 0) {
      nextFrontmatter.args = input.value.args;
    } else {
      delete nextFrontmatter.args;
    }
    const nextRaw = `${matter.stringify(input.value.body, nextFrontmatter).trimEnd()}\n`;
    const tmp = `${skill.path}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(tmp, nextRaw, "utf8");
      await rename(tmp, skill.path);
    } catch (err) {
      reply.code(500);
      return {
        code: "SKILL_WRITE_FAILED",
        message: (err as Error).message,
      };
    }
    const nextSkill: SkillRef = {
      ...skill,
      name: input.value.name,
      description: input.value.description,
      ...(input.value.args.length > 0 ? { args: input.value.args } : {}),
    };
    const file: SkillFile = {
      skill: nextSkill,
      name: input.value.name,
      description: input.value.description,
      ...(input.value.args.length > 0 ? { args: input.value.args } : {}),
      body: input.value.body,
      frontmatter: nextFrontmatter,
    };
    return file;
  });
}

function skillsStartCwd(): string {
  return process.env.INIT_CWD ?? process.cwd();
}

async function resolveDiscoveredSkill(path: unknown): Promise<SkillRef | null> {
  if (typeof path !== "string" || path.length === 0) return null;
  const target = resolve(path);
  const skills = await findSkills(skillsStartCwd(), undefined, {
    includeGlobal: true,
  });
  return skills.find((skill) => resolve(skill.path) === target) ?? null;
}

async function readSkillFile(
  skill: SkillRef,
): Promise<
  | { ok: true; file: SkillFile }
  | { ok: false; status: number; body: { code: string; message: string } }
> {
  let raw: string;
  try {
    raw = await readFile(skill.path, "utf8");
  } catch (err) {
    return {
      ok: false,
      status: 404,
      body: {
        code: "SKILL_FILE_UNREADABLE",
        message: (err as Error).message,
      },
    };
  }
  let parsed;
  try {
    parsed = matter(raw);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      body: {
        code: "SKILL_PARSE_FAILED",
        message: (err as Error).message,
      },
    };
  }
  const data = parsed.data as Record<string, unknown>;
  const name = typeof data.name === "string" && data.name.length > 0
    ? data.name
    : skill.name;
  const description = typeof data.description === "string"
    ? data.description
    : skill.description;
  const args = typeof data.args === "string" ? data.args : undefined;
  return {
    ok: true,
    file: {
      skill: {
        ...skill,
        name,
        description,
        ...(args !== undefined ? { args } : {}),
      },
      name,
      description,
      ...(args !== undefined ? { args } : {}),
      body: parsed.content.trimStart(),
      frontmatter: data,
    },
  };
}

function normalizeSkillSaveBody(body: {
  path?: string;
  name?: string;
  description?: string;
  args?: string;
  body?: string;
}): { value: { name: string; description: string; args: string; body: string } } | {
  error: { code: string; message: string };
} {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0) {
    return {
      error: {
        code: "SKILL_NAME_REQUIRED",
        message: "skill name is required",
      },
    };
  }
  if (name.includes("/") || /\s/.test(name)) {
    return {
      error: {
        code: "SKILL_NAME_INVALID",
        message: "skill name cannot contain spaces or slashes",
      },
    };
  }
  return {
    value: {
      name,
      description:
        typeof body.description === "string" ? body.description.trim() : "",
      args: typeof body.args === "string" ? body.args.trim() : "",
      body: typeof body.body === "string" ? body.body.trimStart() : "",
    },
  };
}
