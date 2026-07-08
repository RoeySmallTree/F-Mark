/* SkillsPaletteModal — invoke project-scoped commands/skills (P9). */

import { type JSX } from "react";
import { SkillsPaletteView } from "./skillsPalette/SkillsPaletteView.js";
import { useSkillsPaletteController } from "./skillsPalette/useSkillsPaletteController.js";

export function SkillsPaletteModal(): JSX.Element {
  return <SkillsPaletteView controller={useSkillsPaletteController()} />;
}
