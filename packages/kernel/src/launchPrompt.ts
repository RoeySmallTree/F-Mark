export const FMARK_LAUNCH_PROMPT_MARKER = "<!-- fmark:launch-prompt:v1 -->";

export function markFmarkLaunchPrompt(content: string): string {
  return `${FMARK_LAUNCH_PROMPT_MARKER}\n${content}`;
}

export function isFmarkLaunchPrompt(content: string): boolean {
  return content.trimStart().startsWith(FMARK_LAUNCH_PROMPT_MARKER);
}
