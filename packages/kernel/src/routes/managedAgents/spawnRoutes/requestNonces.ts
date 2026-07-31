import { randomBytes } from "node:crypto";

/* A single-use nonce with a short TTL. It protects against replayed and
   double-submitted lifecycle calls — nothing more.

   It is NOT proof that a human confirmed anything: any client can mint and
   immediately spend one in the same code path. Human confirmation is a
   renderer-side contract (see renderer/src/confirm). Do not add server logic
   that assumes this token implies consent. */
const REQUEST_NONCE_TTL_MS = 10_000;

interface ConfirmEntry {
  token: string;
  exp: number;
}

export type RequestNonceStore = Map<string, ConfirmEntry>;

export function mintRequestNonce(
  tokens: RequestNonceStore,
  id: string,
): string {
  const token = randomBytes(8).toString("hex");
  tokens.set(id, { token, exp: Date.now() + REQUEST_NONCE_TTL_MS });
  return token;
}

export function consumeRequestNonce(
  tokens: RequestNonceStore,
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
