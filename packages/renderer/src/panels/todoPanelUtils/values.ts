export function generateTodoId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `td-${rand}`;
}

export function titleForPost(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : " ";
}

export function fieldValue(value: string | undefined): string {
  if (value === undefined) return "";
  return value.trim().length === 0 ? "" : value;
}
