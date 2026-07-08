import type { Preset } from "@f-mark/shared";
import type { CustomCategory } from "../customCategories.js";

export interface PresetSection {
  category: CustomCategory | null;
  presets: Preset[];
}

export interface PresetsPopoverController {
  query: string;
  loading: boolean;
  error: string | null;
  grouped: PresetSection[];
  filteredProject: Preset[];
  hasResults: boolean;
  onQueryChange(query: string): void;
  onAddPreset(): void;
  onEditPreset(preset: Preset): void;
  onPick(preset: Preset): void;
}
