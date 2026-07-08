import type { JSX } from "react";
import type {
  EffortDescriptor,
  ModelDescriptor,
  RuntimeAccessModeOption,
} from "@f-mark/shared";
import { PlusButtonView } from "./plusButton/PlusButtonView.js";
import { usePlusButtonController } from "./plusButton/usePlusButtonController.js";
import "./chips.css";

export interface PlusButtonRuntime {
  id: string;
  displayName: string;
  available: boolean;
}

export interface PlusButtonProps {
  runtimes: PlusButtonRuntime[];
  onSpawnRuntime(id: string): void;
  /** Deprecated: standalone terminals now launch from the Terminal dock tab. */
  onSpawnTerminal?(): void;
  onManageRuntimes(): void;
  accessModeForRuntime?(id: string): string;
  accessModeOptionsForRuntime?(id: string): RuntimeAccessModeOption[];
  onAccessModeChange?(id: string, mode: string): void;
  modelForRuntime?(id: string): string;
  effortForRuntime?(id: string): string;
  modelOptionsForRuntime?(id: string): ModelDescriptor[];
  effortOptionsForRuntime?(id: string): EffortDescriptor[];
  onModelChange?(id: string, model: string): void;
  onEffortChange?(id: string, effort: string): void;
  /** Deprecated: terminal availability is owned by the Terminal dock tab. */
  tmuxMissing?: boolean;
  /* When the kernel process-spawning API is disabled, runtime rows
     stay visible but become non-actionable with a precise tooltip. */
  spawnDisabledReason?: string | null;
}

export function PlusButton(props: PlusButtonProps): JSX.Element {
  const controller = usePlusButtonController(props);
  return <PlusButtonView controller={controller} />;
}
