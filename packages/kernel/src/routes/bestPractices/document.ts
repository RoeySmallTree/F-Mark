import { buildCanonicalRecipeSection } from "./recipeSection.js";
import { buildModelSection } from "./modelSection.js";
import { buildPatternsSection } from "./patternsSection.js";
import { buildSemanticsSection } from "./semanticsSection.js";

type SectionBuilder = () => string;

const SECTION_BUILDERS: SectionBuilder[] = [
  buildModelSection,
  buildCanonicalRecipeSection,
  buildPatternsSection,
  buildSemanticsSection,
];

export function buildBestPractices(): string {
  return SECTION_BUILDERS.map((buildSection) => buildSection()).join("");
}
