/* RuntimesPanel — Settings → Runtimes.
   Shows the system probe summary first (OS, installer, tmux), then renders
   the runtime catalog (claude/codex/opencode + custom entries) as a table.
   Each row has Edit + Remove buttons; builtin rows can be edited but not
   removed. The "Add runtime" button expands an inline form whose `executable`
   field is validated against the same regex the kernel uses
   (`^[a-zA-Z0-9_./-]+$`) and whose `id` field is validated against
   `^[a-z][a-z0-9_-]{0,31}$`. */

import type { JSX } from "react";
import type { EnvProbeResult, RuntimeEntry } from "@f-mark/shared";
import {
  RuntimeInlineError,
  RuntimeListHeader,
  RuntimePanelIntro,
  RuntimeReadOnlyNote,
} from "./runtimes/RuntimeChrome.js";
import { RuntimeEditor } from "./runtimes/RuntimeEditor.js";
import { RuntimeSystemDetails } from "./runtimes/RuntimeSystemDetails.js";
import { RuntimeTable } from "./runtimes/RuntimeTable.js";
import { useAsyncAction } from "./runtimes/useAsyncAction.js";
import { useRuntimeForm } from "./runtimes/useRuntimeForm.js";
import { useRuntimeRows } from "./runtimes/useRuntimeRows.js";

export interface RuntimesPanelProps {
  runtimes: Record<string, RuntimeEntry>;
  onAdd(id: string, entry: RuntimeEntry): Promise<void>;
  onUpdate(id: string, entry: RuntimeEntry): Promise<void>;
  onRemove(id: string): Promise<void>;
  envProbe?: EnvProbeResult | null;
  onReprobe?(): Promise<void>;
  /* When set, surfaces a read-only banner and suppresses mutation controls. */
  readOnlyNote?: string;
}

export function RuntimesPanel({
  runtimes,
  onAdd,
  onUpdate,
  onRemove,
  envProbe = null,
  onReprobe,
  readOnlyNote,
}: RuntimesPanelProps): JSX.Element {
  const rows = useRuntimeRows(runtimes);
  const formController = useRuntimeForm({ onAdd, onUpdate });
  const removeAction = useAsyncAction(onRemove);
  const reprobeAction = useAsyncAction(onReprobe);
  const readOnly = readOnlyNote !== undefined;

  return (
    <>
      <RuntimePanelIntro />
      <RuntimeSystemDetails
        envProbe={envProbe}
        onReprobe={onReprobe !== undefined ? reprobeAction.run : undefined}
        probeBusy={reprobeAction.busy}
        probeError={reprobeAction.error}
      />
      <RuntimeListHeader />
      <RuntimeReadOnlyNote note={readOnlyNote} />
      <RuntimeTable
        rows={rows}
        envProbe={envProbe}
        readOnly={readOnly}
        onEdit={formController.openEdit}
        onRemove={(id) => {
          void removeAction.run(id);
        }}
      />
      <RuntimeInlineError error={removeAction.error} />
      <RuntimeEditor readOnly={readOnly} controller={formController} />
    </>
  );
}
