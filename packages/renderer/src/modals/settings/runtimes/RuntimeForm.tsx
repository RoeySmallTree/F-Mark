import type { JSX } from "react";
import { RuntimeFormActions } from "./runtimeForm/RuntimeFormActions.js";
import { RuntimeFormError } from "./runtimeForm/RuntimeFormError.js";
import { RuntimeFormFields } from "./runtimeForm/RuntimeFormFields.js";
import { RuntimeFormFrame } from "./runtimeForm/RuntimeFormFrame.js";
import type { RuntimeFormController } from "./useRuntimeForm.js";

export function RuntimeForm({
  controller,
}: {
  controller: RuntimeFormController;
}): JSX.Element {
  const { error, busy, submit, cancel } = controller;
  return (
    <RuntimeFormFrame>
      <RuntimeFormFields controller={controller} />
      <RuntimeFormError error={error} />
      <RuntimeFormActions busy={busy} onCancel={cancel} onSubmit={submit} />
    </RuntimeFormFrame>
  );
}
