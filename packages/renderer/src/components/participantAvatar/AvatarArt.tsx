import type { JSX, ReactNode } from "react";
import type { AvatarTone, AvatarToneMap } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  primary: "primary",
  space: " ",
  newline: "\n",
} as const;

const DEFAULT_CHAR_TONES: AvatarToneMap = {
  "#": "primary",
  "@": "accent",
  "+": "spark",
  "*": "spark",
  "=": "accent",
  ">": "accent",
  "<": "accent",
  "_": "soft",
  "-": "soft",
  "'": "soft",
  ".": "shadow",
  "o": "shine",
};

function toneForChar(char: string, tones: AvatarToneMap | undefined): AvatarTone {
  return tones?.[char] ?? DEFAULT_CHAR_TONES[char] ?? NO_LOOSE_STRING_VALUES.primary;
}

function renderLine(
  line: string,
  lineIndex: number,
  tones: AvatarToneMap | undefined,
): ReactNode[] {
  return Array.from(line).map((char, charIndex) => {
    if (char === NO_LOOSE_STRING_VALUES.space) return char;
    return (
      <span
        key={`${lineIndex}-${charIndex}`}
        className="avatar-art-char"
        data-avatar-tone={toneForChar(char, tones)}
      >
        {char}
      </span>
    );
  });
}

export function AvatarArt({
  lines,
  tones,
}: {
  lines: readonly string[];
  tones?: AvatarToneMap;
}): JSX.Element {
  return (
    <pre className="avatar-art-glyph" aria-hidden="true">
      {lines.map((line, index) => (
        <span key={index} className="avatar-art-line">
          {renderLine(line, index, tones)}
          {index < lines.length - 1 ? NO_LOOSE_STRING_VALUES.newline : null}
        </span>
      ))}
    </pre>
  );
}
