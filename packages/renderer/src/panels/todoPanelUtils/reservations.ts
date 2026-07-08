const autoFirstReservations = new Set<string>();

export function reserveAutoFirstTodo(sessionId: string): boolean {
  if (autoFirstReservations.has(sessionId)) return false;
  autoFirstReservations.add(sessionId);
  return true;
}

export function releaseAutoFirstTodo(sessionId: string): void {
  autoFirstReservations.delete(sessionId);
}

export function resetAutoFirstTodoReservations(): void {
  autoFirstReservations.clear();
}
