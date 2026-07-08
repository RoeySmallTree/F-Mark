import { randomBytes } from "node:crypto";

const CONFIRM_TTL_MS = 10_000;

interface ConfirmEntry {
  token: string;
  exp: number;
}

export type ConfirmTokenStore = Map<string, ConfirmEntry>;

export function mintConfirm(tokens: ConfirmTokenStore, id: string): string {
  const token = randomBytes(8).toString("hex");
  tokens.set(id, { token, exp: Date.now() + CONFIRM_TTL_MS });
  return token;
}

export function consumeConfirm(
  tokens: ConfirmTokenStore,
  id: string,
  token: string,
): boolean {
  const entry = tokens.get(id);
  if (!entry) return false;
  if (Date.now() > entry.exp) {
    tokens.delete(id);
    return false;
  }
  if (entry.token !== token) return false;
  tokens.delete(id);
  return true;
}
