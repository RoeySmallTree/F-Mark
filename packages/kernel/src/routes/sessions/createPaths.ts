import type { CreateSessionRequest } from "@f-mark/shared";
import { paths as makePaths, type Paths } from "../../paths.js";
import { validateWritableDirectory } from "../fs.js";
import { SessionPathResolver } from "./pathResolver.js";

export async function resolveCreateSessionPaths(
  body: CreateSessionRequest,
  pathResolver: SessionPathResolver,
): Promise<
  | { ok: true; paths: Paths }
  | { ok: false; status: number; body: unknown }
> {
  if (typeof body.path !== "string" || body.path.length === 0) {
    return { ok: true, paths: pathResolver.resolveListPaths() };
  }

  const validated = await validateWritableDirectory(body.path);
  if (!validated.ok) {
    return { ok: false, status: validated.status, body: validated.body };
  }

  return { ok: true, paths: makePaths(validated.canonical) };
}
