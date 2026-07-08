import type { AvatarToneMap } from "@f-mark/shared";
import type { AvatarKind } from "./types.js";

const AVATAR_KIND_VALUES = {
  human: "human",
} as const;

function normalizeArtLine(line: string): string {
  if (line.length >= 8) {
    return line.slice(0, 8);
  }
  const pad = 8 - line.length;
  const left = Math.floor(pad / 2);
  return `${" ".repeat(left)}${line}${" ".repeat(pad - left)}`;
}

interface AgentArtPreset {
  lines: readonly string[];
  tones: AvatarToneMap;
}

const AGENT_KIND_ART: Record<
  Exclude<AvatarKind, "human">,
  AgentArtPreset
> = {
  /* Claude — sharper Anthropic-style radial burst with crossing arms. */
  claude: {
    lines: [
      "\\  ## / ",
      " \\ ##/  ",
      "  \\##   ",
      "###++###",
      "###++###",
      "   ##/  ",
      "  /## \\ ",
      " / ##  \\",
    ],
    tones: {
      "#": "primary",
      "\\": "accent",
      "/": "accent",
      "+": "spark",
    },
  },
  /* GPT / OpenAI — six-lobed knot with a preserved inner negative space. */
  gpt: {
    lines: [
      "  ####  ",
      " ##++## ",
      "##+..+##",
      "##.##.##",
      "##.##.##",
      "##+..+##",
      " ##++## ",
      "  ####  ",
    ],
    tones: {
      "#": "primary",
      "+": "accent",
      ".": "soft",
    },
  },
  /* Opencode — precise code aperture / opposing chevrons, less blobby. */
  opencode: {
    lines: [
      "<<    >>",
      " <<##>> ",
      "  <##>  ",
      "##<++>##",
      "##<++>##",
      "  <##>  ",
      " <<##>> ",
      "<<    >>",
    ],
    tones: {
      "<": "accent",
      ">": "accent",
      "+": "spark",
      "#": "primary",
    },
  },
  /* Terminal prompt — boxed prompt with cursor block. */
  terminal: {
    lines: [
      "########",
      "#>....# ",
      "#..##.# ",
      "#...## #",
      "#..##.# ",
      "#...._##",
      "########",
      "        ",
    ],
    tones: {
      "#": "primary",
      ">": "accent",
      "_": "spark",
      ".": "soft",
    },
  },
};

export function agentKindArtLines(
  kind: AvatarKind,
): readonly string[] | undefined {
  if (kind === AVATAR_KIND_VALUES.human) {
    return undefined;
  }
  return AGENT_KIND_ART[kind].lines.map(normalizeArtLine);
}

export function agentKindArtTones(
  kind: AvatarKind,
): AvatarToneMap | undefined {
  if (kind === AVATAR_KIND_VALUES.human) {
    return undefined;
  }
  return AGENT_KIND_ART[kind].tones;
}
