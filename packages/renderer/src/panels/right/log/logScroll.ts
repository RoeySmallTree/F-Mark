export function jumpToLogEvent(filename: string): void {
  if (typeof document === "undefined") return;
  const element = document.querySelector(`[data-event-filename="${filename}"]`);
  const elementMatched = element !== null && element instanceof HTMLElement;
  if (elementMatched) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
