import type { ManagedAgentWsMessage } from "@f-mark/shared";

const MANAGED_AGENT_MESSAGE_TYPES = new Set([
  "presence",
  "managed-agent.spawned",
  "managed-agent.killed",
  "managed-agent.updated",
  "managed-agent.terminal-spawned",
  "managed-agent.terminal-closed",
  "env-probe.updated",
]);

/* Narrow the renderer's BusMessage handler to managed-agent / presence /
   env-probe types. The shared types describe the kernel's exact wire
   contract so we type-guard before dispatching. */
export function isManagedAgentMessage(m: unknown): m is ManagedAgentWsMessage {
  if (m === null) return false;
  if (typeof m !== "object") return false;
  if (!("type" in m)) return false;
  const type = (m as { type: unknown }).type;
  return typeof type === "string" && MANAGED_AGENT_MESSAGE_TYPES.has(type);
}
