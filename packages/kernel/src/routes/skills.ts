import type { FastifyInstance } from "fastify";
import { findSkills } from "../skills/scanner.js";

export function registerSkillRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { agent?: string } }>(
    "/skills",
    async (req) => {
      const startCwd = process.env.INIT_CWD ?? process.cwd();
      const agent =
        typeof req.query.agent === "string" && req.query.agent.length > 0
          ? req.query.agent
          : undefined;
      const skills = await findSkills(startCwd, agent);
      return { skills };
    },
  );
}
