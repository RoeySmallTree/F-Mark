import type { CSSProperties, RefObject } from "react";
import type {
  EffortDescriptor,
  ModelDescriptor,
  RuntimeAccessModeOption,
} from "@f-mark/shared";
import type { PlusButtonRuntime } from "../PlusButton.js";

export type { PlusButtonRuntime };

export interface RuntimeMenuItemModel extends PlusButtonRuntime {
  disabled: boolean;
  title: string | undefined;
  hint: string | null;
  accessMode: string;
  accessModeOptions: RuntimeAccessModeOption[];
  model: string;
  effort: string;
  modelOptions: ModelDescriptor[];
  effortOptions: EffortDescriptor[];
}

export interface TerminalMenuItemModel {
  disabled: boolean;
  title: string | undefined;
  hint: string | null;
}

export interface MenuPosition {
  top: number;
  left: number;
  placement: "above" | "below";
}

export interface PlusButtonController {
  open: boolean;
  /* True while the menu is animating out but still mounted. */
  closing: boolean;
  wrapRef: RefObject<HTMLDivElement>;
  menuRef: RefObject<HTMLDivElement>;
  menuStyle: CSSProperties;
  runtimeItems: RuntimeMenuItemModel[];
  toggleOpen(): void;
  spawnRuntime(item: RuntimeMenuItemModel): void;
  manageRuntimes(): void;
  expandedRuntimeId: string | null;
  menuPlacement: MenuPosition["placement"] | null;
  changeAccessMode(id: string, mode: string): void;
  changeModel(id: string, model: string): void;
  changeEffort(id: string, effort: string): void;
  toggleRuntimeOptions(id: string): void;
}
