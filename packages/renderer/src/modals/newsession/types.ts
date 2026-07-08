import type { State } from "../../state/storeTypes.js";

export interface NewSessionController {
  folder: string | null;
  pickerOpen: boolean;
  submitting: boolean;
  error: string | null;
  canSubmit: boolean;
  favorites: State["favorites"];
  recentPresets: string[];
  setFolder(path: string): void;
  setPickerOpen(open: boolean): void;
  closeModal(): void;
  createSession(): Promise<void>;
}
