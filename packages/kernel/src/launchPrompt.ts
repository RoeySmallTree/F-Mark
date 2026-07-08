export const FMARK_LAUNCH_PROMPT_MARKER = "<!-- fmark:launch-prompt:v1 -->";
export const FMARK_WAKE_PROMPT_MARKER = "<!-- fmark:wake-packet:v1 -->";

export function markFmarkLaunchPrompt(content: string): string {
  return `${FMARK_LAUNCH_PROMPT_MARKER}\n${content}`;
}

export function markFmarkWakePrompt(content: string): string {
  return `${FMARK_WAKE_PROMPT_MARKER}\n${content}`;
}

export function isFmarkLaunchPrompt(content: string): boolean {
  return content.trimStart().startsWith(FMARK_LAUNCH_PROMPT_MARKER);
}

/* True for any prompt the kernel itself injects into an agent's composer
   (launch onboarding, wake packets). UserPromptSubmit hooks must drop these —
   they are kernel→agent plumbing, not user prose to mirror into the session. */
export function isFmarkInjectedPrompt(content: string): boolean {
  const head = content.trimStart();
  return (
    head.startsWith(FMARK_LAUNCH_PROMPT_MARKER) ||
    head.startsWith(FMARK_WAKE_PROMPT_MARKER)
  );
}
