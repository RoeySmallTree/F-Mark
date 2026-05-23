/* Built-in runtime catalog. Kernel ships claude / codex / gemini by default
   and has no /runtimes endpoint to enumerate user-edited entries, so the
   renderer uses this table for display names. env-probe.runtimes is the
   authoritative set of IDs; this map provides the human label. */
export const KNOWN_RUNTIMES: Record<
  string,
  { displayName: string; executable: string }
> = {
  claude: { displayName: "Claude Code", executable: "claude" },
  codex: { displayName: "Codex", executable: "codex" },
  gemini: { displayName: "Gemini", executable: "gemini" },
};

export function runtimeDisplayName(runtimeId: string): string {
  return KNOWN_RUNTIMES[runtimeId]?.displayName ?? runtimeId;
}
