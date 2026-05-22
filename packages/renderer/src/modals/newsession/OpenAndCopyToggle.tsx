/* OpenAndCopyToggle — checkbox row "[ ] Open immediately + copy orientation snippet".
   Controlled boolean. Copy happens in the parent modal's onCreate after a session
   is successfully created. */

import type { JSX } from "react";

export interface OpenAndCopyToggleProps {
  value: boolean;
  onChange(next: boolean): void;
}

export function OpenAndCopyToggle(props: OpenAndCopyToggleProps): JSX.Element {
  return (
    <label className="pop-toggle">
      <input
        type="checkbox"
        checked={props.value}
        onChange={(e) => props.onChange(e.target.checked)}
        aria-label="Open immediately and copy orientation snippet"
      />
      <span>Open immediately and copy the agent-orientation snippet</span>
    </label>
  );
}

/** Build the orientation snippet that gets copied to clipboard after create. */
export function orientationSnippet(input: {
  origin: string;
  sessionId: string;
  token: string | null;
}): string {
  const tokenPart =
    input.token !== null && input.token.length > 0
      ? `&token=${encodeURIComponent(input.token)}`
      : "";
  return `You're joining an F-Mark session. Fetch ${input.origin}/guide?sessionId=${encodeURIComponent(input.sessionId)}${tokenPart} for the full protocol.`;
}
