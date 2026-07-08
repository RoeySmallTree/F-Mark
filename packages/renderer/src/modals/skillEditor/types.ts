import type { RefObject } from "react";

export interface SkillEditorController {
  args: string;
  body: string;
  canSave: boolean;
  description: string;
  error: string | null;
  loading: boolean;
  name: string;
  nameRef: RefObject<HTMLInputElement>;
  pathLabel: string;
  saving: boolean;
  close(): void;
  save(): void;
  setArgs(value: string): void;
  setBody(value: string): void;
  setDescription(value: string): void;
  setName(value: string): void;
}
