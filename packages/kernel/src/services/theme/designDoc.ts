import {
  resolveThemeTokens,
  THEME_META,
  THEME_NAMES,
  type ThemeTokenName,
  type ThemeTokens,
} from "@f-mark/shared";
import { addPrimaryButton, addSecondaryButton } from "./buttons.js";
import { addComponentRecipes } from "./components.js";
import { addCssVariables } from "./cssVariables.js";
import { MarkdownDocument } from "./markdown.js";
import { addNativeUiRecipes } from "./nativeUiRecipes.js";
import { addColorPalette } from "./palette.js";
import { themeSourceNote, type ThemeSource } from "./source.js";
import { addBorderSystem, addTypography } from "./structure.js";

export type { ThemeSource } from "./source.js";

class ThemeDesignDocBuilder {
  private readonly doc = new MarkdownDocument();
  private readonly tokens: ThemeTokens;

  constructor(
    private readonly name: ThemeTokenName,
    private readonly source: ThemeSource,
  ) {
    this.tokens = resolveThemeTokens(name);
  }

  build(): string {
    this.addIntro();
    addColorPalette(this.doc, this.tokens);
    addTypography(this.doc, this.tokens);
    addBorderSystem(this.doc, this.tokens);
    addPrimaryButton(this.doc, this.tokens);
    addSecondaryButton(this.doc, this.tokens);
    addComponentRecipes(this.doc, this.tokens);
    addNativeUiRecipes(this.doc, this.tokens);
    addCssVariables(this.doc, this.tokens);
    return this.doc.toString();
  }

  private addIntro(): void {
    const meta = THEME_META[this.name];
    const { source } = this;

    this.doc.line(`# F-Mark Theme: ${meta.label}`);
    this.doc.line();
    this.doc.line(`> ${meta.description}`);
    this.doc.line();
    if (source === "default") {
      const allThemes = THEME_NAMES.map((n) => THEME_META[n].label).join(", ");
      this.doc.line(
        `⚠️ No client has reported an active theme this session. The tokens below are **${meta.label}** (\`${this.name}\`), the code-level default, but the running client may be on any of the ${THEME_NAMES.length} themes: ${allThemes}. Do **NOT** ship a mockup themed to Light without either (a) asking the user which theme they see, or (b) tokenizing every color via \`var(--…)\` so the mockup inherits whatever theme is applied.`,
      );
    } else {
      this.doc.line(
        `This is the **${meta.label}** theme (\`${this.name}\`), ${themeSourceNote(source)}.`,
      );
    }
    this.doc.line();
    this.doc.line(
      `Use the tokens and recipes below for the two F-Mark-resident visual targets. (1) **session-artifact** — charts, analyses, standalone previews with no product destination: the house default is the Amber theme, so if you did not request one, fetch \`GET /theme?theme=amber\` (\`fmark_get_theme\` with \`theme: "amber"\`) and build with its palette. (2) **fmark-ui** — mockups of F-Mark's own product UI: use these tokens via the *F-Mark native UI recipes* as a token reference only, and take layout/structure from the real renderer source. If you're instead building **target-repo-ui** — UI to ship in the current repo or another product — match that target system's own design language rather than these tokens; F-Mark is only the delivery surface, not the design authority. All values are already resolved — drop them straight into inline styles or a \`<style>\` block. The sandbox does not load the app stylesheet, so keep the HTML self-contained: copy the snippets here (and, when mocking F-Mark's own UI, the structural CSS you reuse) rather than relying on app class names like \`.prose-card\` being styled for you.`,
    );
    this.doc.line();
  }
}

export function renderThemeDesignDoc(
  name: ThemeTokenName,
  source: ThemeSource,
): string {
  return new ThemeDesignDocBuilder(name, source).build();
}
