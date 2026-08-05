import { useCallback } from "react";
import type { ConfirmedIntent } from "./intent.js";
import { mintConfirmedIntent } from "./intent.js";

export interface ConfirmRequest {
  /** Stable identifier for the action, e.g. "agent.goodbye". */
  action: string;
  /** The question. Names the thing being destroyed. */
  title: string;
  /** What is irreversibly lost. Omit only when nothing is. */
  detail?: string;
}

function promptText(request: ConfirmRequest): string {
  return request.detail === undefined
    ? request.title
    : `${request.title}\n\n${request.detail}`;
}

export function useConfirmDestructive(): (
  request: ConfirmRequest,
) => Promise<ConfirmedIntent | null> {
  return useCallback(
    async (request: ConfirmRequest): Promise<ConfirmedIntent | null> =>
      window.confirm(promptText(request))
        ? mintConfirmedIntent(request.action)
        : null,
    [],
  );
}
