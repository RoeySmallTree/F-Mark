import { useState } from "react";

export interface AsyncActionState<TArgs extends readonly unknown[]> {
  busy: boolean;
  error: string | null;
  run(...args: TArgs): Promise<void>;
}

export function useAsyncAction<TArgs extends readonly unknown[]>(
  action: ((...args: TArgs) => Promise<void>) | undefined,
): AsyncActionState<TArgs> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(...args: TArgs): Promise<void> {
    if (action === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await action(...args);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}
