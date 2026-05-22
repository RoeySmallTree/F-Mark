import { Composer } from "../components/Composer.js";

/**
 * P4 placeholder shell — wraps the existing Phase 0 Composer so message-submit
 * keeps working. P6 will rewrite the compose internals (mode pills, hotkeys,
 * named title input). For now this only owns the outer `.compose-inner`
 * structural shell; the inner controls remain the legacy Composer.
 */
export function Compose(): JSX.Element {
  return (
    <div className="compose-inner">
      <Composer />
    </div>
  );
}
