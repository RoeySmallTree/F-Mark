import { createSession } from "../../../src/sessions.js";
import { readConfig, writeConfig } from "../../../src/project.js";
import type { GuidePaths } from "./harness.js";

type GuideParticipants = NonNullable<
  Awaited<ReturnType<typeof readConfig>>["participants"]
>;

export function createGuideSession(
  p: GuidePaths,
  slug: string,
): ReturnType<typeof createSession> {
  return createSession(p, { slug });
}

export async function replaceParticipants(
  p: GuidePaths,
  participants: GuideParticipants,
): Promise<void> {
  const cfg = await readConfig(p);
  cfg.participants = participants;
  await writeConfig(p, cfg);
}
