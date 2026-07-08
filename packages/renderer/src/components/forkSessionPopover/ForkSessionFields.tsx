import type { JSX } from "react";
import type { SessionMeta } from "../../api/client.js";
import { pathLabel } from "./model.js";
import { ForkSessionResult } from "./ForkSessionResult.js";
import type { ForkSessionController } from "./types.js";

interface ForkSessionFieldsProps {
  target: SessionMeta;
  controller: ForkSessionController;
}

export function ForkSessionFields({
  target,
  controller,
}: ForkSessionFieldsProps): JSX.Element {
  return (
    <div className="pop-section fork-session-fields">
      <ForkSourceLine target={target} />
      <ForkNameField controller={controller} />
      <ForkError error={controller.error} />
      <ForkSessionResult
        result={controller.result}
        warnings={controller.warnings}
      />
    </div>
  );
}

function ForkSourceLine({ target }: { target: SessionMeta }): JSX.Element {
  return (
    <div className="fork-source-line">
      <span className="fork-source-slug">{target.slug}</span>
      <span className="fork-source-path">{pathLabel(target.path)}</span>
    </div>
  );
}

function ForkNameField({
  controller,
}: {
  controller: ForkSessionController;
}): JSX.Element {
  return (
    <div className="form-row">
      <label className="form-label" htmlFor="fork-session-name">
        Name
      </label>
      <input
        ref={controller.inputRef}
        id="fork-session-name"
        className="form-input"
        type="text"
        value={controller.name}
        onChange={(event) => controller.setName(event.target.value)}
        disabled={controller.busy || controller.result !== null}
      />
    </div>
  );
}

function ForkError({ error }: { error: string | null }): JSX.Element | null {
  if (error === null) return null;

  return (
    <div className="fork-session-error" role="alert">
      {error}
    </div>
  );
}
