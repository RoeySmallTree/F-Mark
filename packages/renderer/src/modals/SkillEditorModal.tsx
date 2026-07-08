import { type JSX } from "react";
import { SkillEditorView } from "./skillEditor/SkillEditorView.js";
import { useSkillEditorController } from "./skillEditor/useSkillEditorController.js";

export function SkillEditorModal(): JSX.Element {
  return <SkillEditorView controller={useSkillEditorController()} />;
}
