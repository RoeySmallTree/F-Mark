import type { JSX } from "react";

const NO_LOOSE_STRING_VALUES = {
  none: "none",
} as const;

interface ProfileIdentityRowProps {
  currentUserId: string | null;
}

export function ProfileIdentityRow({
  currentUserId,
}: ProfileIdentityRowProps): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-l">Current participant</div>
      <div className="settings-r profile-identity-row">
        <code className="codish">{currentUserId ?? NO_LOOSE_STRING_VALUES.none}</code>
      </div>
    </div>
  );
}
