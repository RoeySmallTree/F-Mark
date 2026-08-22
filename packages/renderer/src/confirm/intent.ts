declare const confirmedIntentBrand: unique symbol;

/** Proof that a human confirmed a destructive action. Obtainable only from
    useConfirmDestructive — never construct one directly. */
export interface ConfirmedIntent {
  readonly [confirmedIntentBrand]: true;
  readonly action: string;
}

export function mintConfirmedIntent(action: string): ConfirmedIntent {
  return { action } as unknown as ConfirmedIntent;
}
