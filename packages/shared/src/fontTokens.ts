import type { ThemeTokens } from "./themeTokens.js";

export type FontTokenName =
  | "theme"
  | "studio"
  | "editorial"
  | "terminal"
  | "system"
  | "geist"
  | "plus-jakarta"
  | "space-grotesk"
  | "manrope"
  | "sora"
  | "outfit"
  | "work-sans"
  | "ibm-plex-sans"
  | "instrument-sans"
  | "bricolage"
  | "fraunces"
  | "lora"
  | "cormorant"
  | "libre-baskerville"
  | "merriweather"
  | "ibm-plex-serif"
  | "fira-code"
  | "ibm-plex-mono"
  | "source-code-pro"
  | "space-mono";

export const DEFAULT_FONT: FontTokenName = "theme";

export interface FontMeta {
  name: FontTokenName;
  label: string;
  description: string;
}

export const FONT_META: Record<FontTokenName, FontMeta> = {
  theme: {
    name: "theme",
    label: "Theme default",
    description: "Let each theme choose its own typography.",
  },
  studio: {
    name: "studio",
    label: "Studio Sans",
    description: "DM Sans for UI, Source Serif for prose, JetBrains Mono for code.",
  },
  editorial: {
    name: "editorial",
    label: "Editorial Serif",
    description: "Source Serif-led reading texture with mono code accents.",
  },
  terminal: {
    name: "terminal",
    label: "Terminal Mono",
    description: "JetBrains Mono across the interface for a command-line feel.",
  },
  system: {
    name: "system",
    label: "System Native",
    description: "Use the operating system's sans, serif, and monospace stacks.",
  },
  geist: {
    name: "geist",
    label: "Geist",
    description: "Crisp Vercel-style grotesk with Source Serif prose and JetBrains code.",
  },
  "plus-jakarta": {
    name: "plus-jakarta",
    label: "Plus Jakarta Sans",
    description: "Warm geometric UI sans with editorial prose and precise mono.",
  },
  "space-grotesk": {
    name: "space-grotesk",
    label: "Space Grotesk",
    description: "Technical display sans with squared rhythm and code contrast.",
  },
  manrope: {
    name: "manrope",
    label: "Manrope",
    description: "Calm rounded product sans for soft, highly legible UI.",
  },
  sora: {
    name: "sora",
    label: "Sora",
    description: "Wide tech-forward sans with a compact, engineered texture.",
  },
  outfit: {
    name: "outfit",
    label: "Outfit",
    description: "Modern rounded sans with generous counters and clean labels.",
  },
  "work-sans": {
    name: "work-sans",
    label: "Work Sans",
    description: "Practical grotesk tuned for dense screens and long sessions.",
  },
  "ibm-plex-sans": {
    name: "ibm-plex-sans",
    label: "IBM Plex Sans",
    description: "Editorial enterprise sans with a disciplined technical voice.",
  },
  "instrument-sans": {
    name: "instrument-sans",
    label: "Instrument Sans",
    description: "Contemporary Swiss-style UI sans with crisp hierarchy.",
  },
  bricolage: {
    name: "bricolage",
    label: "Bricolage Grotesque",
    description: "Expressive grotesk with crafted irregularity for bolder surfaces.",
  },
  fraunces: {
    name: "fraunces",
    label: "Fraunces",
    description: "High-contrast serif with soft editorial drama across the UI.",
  },
  lora: {
    name: "lora",
    label: "Lora",
    description: "Readable literary serif for calmer, prose-led sessions.",
  },
  cormorant: {
    name: "cormorant",
    label: "Cormorant Garamond",
    description: "Elegant old-style serif for refined editorial density.",
  },
  "libre-baskerville": {
    name: "libre-baskerville",
    label: "Libre Baskerville",
    description: "Sturdy book serif with classic contrast and quiet authority.",
  },
  merriweather: {
    name: "merriweather",
    label: "Merriweather",
    description: "Screen-first serif with robust rhythm for long reading.",
  },
  "ibm-plex-serif": {
    name: "ibm-plex-serif",
    label: "IBM Plex Serif",
    description: "Structured serif companion with a product-documentation feel.",
  },
  "fira-code": {
    name: "fira-code",
    label: "Fira Code",
    description: "Developer mono across UI and code for a focused editor feel.",
  },
  "ibm-plex-mono": {
    name: "ibm-plex-mono",
    label: "IBM Plex Mono",
    description: "Humanist mono for dense technical workflows without harshness.",
  },
  "source-code-pro": {
    name: "source-code-pro",
    label: "Source Code Pro",
    description: "Adobe's readable mono for precise code-heavy sessions.",
  },
  "space-mono": {
    name: "space-mono",
    label: "Space Mono",
    description: "Retro-futurist mono with distinctive forms and roomy cadence.",
  },
};

export const FONT_NAMES = Object.keys(FONT_META) as FontTokenName[];

export type FontStackTokens = Pick<ThemeTokens, "sans" | "serif" | "mono">;

const BASE_SERIF = "'Source Serif 4', Georgia, serif";
const BASE_MONO = "'JetBrains Mono', ui-monospace, monospace";

function sansStack(font: string): FontStackTokens {
  return { sans: font, serif: BASE_SERIF, mono: BASE_MONO };
}

function serifStack(font: string): FontStackTokens {
  return { sans: font, serif: font, mono: BASE_MONO };
}

function monoStack(font: string): FontStackTokens {
  return { sans: font, serif: font, mono: font };
}

export const FONT_TOKEN_OVERRIDES: Record<
  Exclude<FontTokenName, "theme">,
  FontStackTokens
> = {
  studio: sansStack("'DM Sans', system-ui, sans-serif"),
  editorial: serifStack(BASE_SERIF),
  terminal: monoStack(BASE_MONO),
  system: {
    sans:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    mono:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  geist: sansStack("'Geist', system-ui, sans-serif"),
  "plus-jakarta": sansStack("'Plus Jakarta Sans', system-ui, sans-serif"),
  "space-grotesk": sansStack("'Space Grotesk', system-ui, sans-serif"),
  manrope: sansStack("'Manrope', system-ui, sans-serif"),
  sora: sansStack("'Sora', system-ui, sans-serif"),
  outfit: sansStack("'Outfit', system-ui, sans-serif"),
  "work-sans": sansStack("'Work Sans', system-ui, sans-serif"),
  "ibm-plex-sans": sansStack("'IBM Plex Sans', system-ui, sans-serif"),
  "instrument-sans": sansStack("'Instrument Sans', system-ui, sans-serif"),
  bricolage: sansStack("'Bricolage Grotesque', system-ui, sans-serif"),
  fraunces: serifStack("'Fraunces', 'Source Serif 4', Georgia, serif"),
  lora: serifStack("'Lora', 'Source Serif 4', Georgia, serif"),
  cormorant: serifStack("'Cormorant Garamond', 'Source Serif 4', Georgia, serif"),
  "libre-baskerville": serifStack(
    "'Libre Baskerville', 'Source Serif 4', Georgia, serif",
  ),
  merriweather: serifStack("'Merriweather', 'Source Serif 4', Georgia, serif"),
  "ibm-plex-serif": serifStack(
    "'IBM Plex Serif', 'Source Serif 4', Georgia, serif",
  ),
  "fira-code": monoStack("'Fira Code', 'JetBrains Mono', ui-monospace, monospace"),
  "ibm-plex-mono": monoStack(
    "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
  ),
  "source-code-pro": monoStack(
    "'Source Code Pro', 'JetBrains Mono', ui-monospace, monospace",
  ),
  "space-mono": monoStack(
    "'Space Mono', 'JetBrains Mono', ui-monospace, monospace",
  ),
};

export function isFontName(value: unknown): value is FontTokenName {
  return typeof value === "string" && value in FONT_META;
}

export function resolveFontTokens(
  themeTokens: ThemeTokens,
  fontName: FontTokenName,
): FontStackTokens {
  if (fontName === "theme") {
    return {
      sans: themeTokens.sans,
      serif: themeTokens.serif,
      mono: themeTokens.mono,
    };
  }
  return FONT_TOKEN_OVERRIDES[fontName];
}

export function resolveThemeWithFontTokens(
  themeTokens: ThemeTokens,
  fontName: FontTokenName,
): ThemeTokens {
  return { ...themeTokens, ...resolveFontTokens(themeTokens, fontName) };
}
