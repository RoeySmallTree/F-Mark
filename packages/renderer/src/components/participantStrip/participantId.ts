const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

function hexByte(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

function cryptoRandomHex(bytes: number): string | null {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    return null;
  }
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  let hex = "";
  for (const byte of data) hex += hexByte(byte);
  return hex;
}

function randomHex(bytes: number): string {
  const secureHex = cryptoRandomHex(bytes);
  if (secureHex !== null) return secureHex;
  return Math.floor(Math.random() * 16 ** (bytes * 2))
    .toString(16)
    .padStart(bytes * 2, "0");
}

function participantIdRuntimePrefix(runtimeId: string): string {
  const safeRuntime = runtimeId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return safeRuntime.length > 0 ? safeRuntime : NO_LOOSE_STRING_VALUES.agent;
}

export function suggestedParticipantId(runtimeId: string): string {
  return `ag-${participantIdRuntimePrefix(runtimeId)}-${randomHex(2)}`;
}
