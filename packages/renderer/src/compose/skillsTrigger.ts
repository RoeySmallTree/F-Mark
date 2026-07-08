export interface SkillTrigger {
  start: number;
  end: number;
  query: string;
}

export function skillTriggerAt(
  value: string,
  caret: number,
): SkillTrigger | null {
  const safeCaret = Math.min(value.length, Math.max(0, caret));
  const beforeCaret = value.slice(0, safeCaret);
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(beforeCaret);
  if (match === null) return null;
  const raw = match[0];
  const slashOffset = raw.startsWith("/") ? 0 : 1;
  const start = match.index + slashOffset;
  return {
    start,
    end: safeCaret,
    query: match[1] ?? "",
  };
}
