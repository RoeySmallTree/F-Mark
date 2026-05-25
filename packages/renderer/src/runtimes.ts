/* Built-in runtime catalog. The full editable registry is available through
   /runtimes; this table gives built-ins stable labels for surfaces that only
   have an env-probe snapshot. */
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
