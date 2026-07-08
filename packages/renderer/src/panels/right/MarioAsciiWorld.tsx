import type { JSX } from "react";

const NO_LOOSE_STRING_VALUES = {
  marioWorld: "mario-world",
  marioClouds: "mario-clouds",
  marioMountains: "mario-mountains",
  marioPipe: "mario-pipe",
  marioQBlockWrapper: "mario-q-block-wrapper",
  marioCoin: "mario-coin",
  marioCoinText: "$",
  marioQBlock: "mario-q-block",
  marioCharWrapper: "mario-char-wrapper",
  marioSpriteContainer: "mario-sprite-container",
  marioRunning: "mario-running",
  marioRunStrip: "mario-run-strip",
  marioFrame: "mario-frame",
  marioJumping: "mario-jumping",
  marioGround: "mario-ground",
  ariaHiddenTrue: "true",
  cloudsArt: "      ~ ~ ~          ~ ~ ~\n     (     )        (     )\n      ~ ~ ~          ~ ~ ~",
  mountainsArt: "        /\\            /\\\n       /  \\  /\\      /  \\  /\\\n      /    \\/  \\    /    \\/  \\",
  pipeArt: "   _███_\n  [ ███ ]\n  [ ███ ]",
  frame1: "  _█_\n (o.o)\n ┌(▓)┐\n  / \\",
  frame2: "  _█_\n (o.o)\n ‹(▓)┐\n  /  \\",
  frame3: "  _█_\n (o.o)\n ┌(▓)›\n  /  \\",
  frameJump: "  _█_\n (^.^)\n ‹(▓)›\n _/ \\_",
  groundArt: "▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒\n█▄█▄██▄█▄██▄█▄██▄█▄██▄█▄██▄█▄██▄█▄██▄█▄██▄█▄██▄█▄██▄█▄██▄█▄█",
} as const;

/* Purely decorative — the empty-state title/hint below already carries the
   meaningful copy, so the whole scene is hidden from assistive tech once,
   at the root, rather than on every layer. */
export function MarioAsciiWorld(): JSX.Element {
  return (
    <div
      className={NO_LOOSE_STRING_VALUES.marioWorld}
      aria-hidden={NO_LOOSE_STRING_VALUES.ariaHiddenTrue}
    >
      <div className={NO_LOOSE_STRING_VALUES.marioClouds}>
        {NO_LOOSE_STRING_VALUES.cloudsArt}
      </div>

      <div className={NO_LOOSE_STRING_VALUES.marioMountains}>
        {NO_LOOSE_STRING_VALUES.mountainsArt}
      </div>

      <div className={NO_LOOSE_STRING_VALUES.marioPipe}>
        {NO_LOOSE_STRING_VALUES.pipeArt}
      </div>

      {/* Question block + coin, coordinated with Mario's jump apex below */}
      <div className={NO_LOOSE_STRING_VALUES.marioQBlockWrapper}>
        <div className={NO_LOOSE_STRING_VALUES.marioCoin}>
          {NO_LOOSE_STRING_VALUES.marioCoinText}
        </div>
        <div className={NO_LOOSE_STRING_VALUES.marioQBlock} />
      </div>

      <div className={NO_LOOSE_STRING_VALUES.marioCharWrapper}>
        <div className={NO_LOOSE_STRING_VALUES.marioSpriteContainer}>
          {/* Running: 3-frame vertical strip, stepped through on a loop */}
          <div className={NO_LOOSE_STRING_VALUES.marioRunning}>
            <div className={NO_LOOSE_STRING_VALUES.marioRunStrip}>
              <pre className={NO_LOOSE_STRING_VALUES.marioFrame}>
                {NO_LOOSE_STRING_VALUES.frame1}
              </pre>
              <pre className={NO_LOOSE_STRING_VALUES.marioFrame}>
                {NO_LOOSE_STRING_VALUES.frame2}
              </pre>
              <pre className={NO_LOOSE_STRING_VALUES.marioFrame}>
                {NO_LOOSE_STRING_VALUES.frame3}
              </pre>
            </div>
          </div>

          {/* Jumping: single frame, shown only around the jump apex */}
          <div className={NO_LOOSE_STRING_VALUES.marioJumping}>
            <pre className={NO_LOOSE_STRING_VALUES.marioFrame}>
              {NO_LOOSE_STRING_VALUES.frameJump}
            </pre>
          </div>
        </div>
      </div>

      <div className={NO_LOOSE_STRING_VALUES.marioGround}>
        {NO_LOOSE_STRING_VALUES.groundArt}
      </div>
    </div>
  );
}
