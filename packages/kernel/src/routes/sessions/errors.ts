export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function routeStatusForSessionError(message: string): number {
  return /not found/i.test(message) ? 404 : 400;
}
