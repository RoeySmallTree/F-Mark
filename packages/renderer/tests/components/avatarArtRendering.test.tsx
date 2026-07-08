import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AVATAR_PRESETS } from "@f-mark/shared";
import { AvatarArt } from "../../src/components/participantAvatar/AvatarArt.js";
import { AgentKindArt } from "../../src/components/participantAvatar/AgentKindArt.js";
import { AvatarPresetPicker } from "../../src/components/AvatarPresetPicker.js";

afterEach(() => {
  cleanup();
});

describe("AvatarArt rendering outside .avatar.with-glyph", () => {
  test("picker tiles contain dense multi-line glyph text", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AvatarPresetPicker seed="test" value="01" onChange={() => {}} />,
    );
    await user.click(container.querySelector(".avatar-preset-trigger")!);

    const glyph = container.querySelector(".avatar-preset-tile-ring .avatar-art-glyph");
    expect(glyph).not.toBeNull();
    expect(glyph?.textContent?.includes("\n")).toBe(true);
    expect((glyph?.textContent ?? "").replace(/\s/g, "").length).toBeGreaterThan(20);
  });

  test("provider art is multi-line dense ascii, not a single character", () => {
    const { container } = render(
      <div className="provider-logo-art avatar-art-mark">
        <AgentKindArt kind="claude" />
      </div>,
    );
    const glyph = container.querySelector(".avatar-art-glyph");
    expect(glyph).not.toBeNull();
    expect(glyph?.textContent?.includes("\n")).toBe(true);
    expect((glyph?.textContent ?? "").replace(/\s/g, "").length).toBeGreaterThan(20);
  });

  test("preset art in tile rings is dense silhouettes", () => {
    const heart = AVATAR_PRESETS[0]!;
    const { container } = render(
      <span className="avatar-preset-tile-ring">
        <AvatarArt lines={heart.lines} />
      </span>,
    );
    const glyph = container.querySelector(".avatar-art-glyph");
    expect(glyph?.textContent).toContain("#");
    expect((glyph?.textContent ?? "").replace(/\s/g, "").length).toBeGreaterThan(30);
  });
});
