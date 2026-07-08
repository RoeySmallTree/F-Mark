import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AVATAR_PRESETS, getAvatarPreset } from "@f-mark/shared";
import { ParticipantAvatar } from "../../src/components/ParticipantAvatar.js";
import { useStore } from "../../src/state/store.js";

afterEach(() => {
  cleanup();
  useStore.setState({ participants: {}, events: [], currentUserId: null });
});

describe("ParticipantAvatar", () => {
  test("catalog exposes 105 eight-column ascii presets", () => {
    expect(AVATAR_PRESETS.length).toBe(105);
    expect(getAvatarPreset("55")?.label).toBe("Cross");
    expect(getAvatarPreset("105")?.label).toBe("Rune");
    for (const preset of AVATAR_PRESETS) {
      for (const line of preset.lines) {
        expect(line.length).toBe(8);
      }
    }
  });

  test("renders ascii art when avatar_preset is set", () => {
    const preset = getAvatarPreset("02")!;
    const { container } = render(
      <ParticipantAvatar
        participantId="us-a7f3"
        participant={{
          kind: "user",
          name: "Roey",
          color: "#2a5fa8",
          avatar_preset: "02",
        }}
      />,
    );

    expect(
      container.querySelector("[data-avatar-preset]")?.getAttribute("data-avatar-preset"),
    ).toBe(preset.id);
    expect(container.querySelector(".avatar-art-glyph")).not.toBeNull();
    expect(container.querySelector(".avatar.with-glyph")).not.toBeNull();
    expect(container.querySelector(".icon-mask")).toBeNull();
  });

  test("renders ascii art for agent runtimes", () => {
    const { container } = render(
      <ParticipantAvatar
        participantId="ag-claude"
        participant={{
          kind: "agent",
          name: "Claude",
          color: "#b86a1f",
          runtime_id: "claude",
        }}
      />,
    );

    expect(
      container.querySelector("[data-avatar-kind]")?.getAttribute("data-avatar-kind"),
    ).toBe("claude");
    expect(container.querySelector(".avatar-art-glyph")).not.toBeNull();
    expect(container.querySelector(".avatar.with-glyph")).not.toBeNull();
    expect(container.querySelector(".icon-mask")).toBeNull();
  });

  test("resolves the user's avatar preset from the store by id when only id is passed", () => {
    useStore.setState({
      participants: {
        "us-a7f3": {
          kind: "user",
          name: "Roey",
          color: "#2a5fa8",
          avatar_preset: "03",
        },
      },
    });

    const { container } = render(
      <ParticipantAvatar
        participantId="us-a7f3"
        kind="user"
        name="Roey"
        color="#2a5fa8"
      />,
    );

    expect(
      container.querySelector("[data-avatar-preset]")?.getAttribute("data-avatar-preset"),
    ).toBe(getAvatarPreset("03")!.id);
  });

  test("an explicit participant preset overrides the store", () => {
    useStore.setState({
      participants: {
        "us-a7f3": {
          kind: "user",
          name: "Roey",
          color: "#2a5fa8",
          avatar_preset: "03",
        },
      },
    });

    const { container } = render(
      <ParticipantAvatar
        participantId="us-a7f3"
        participant={{
          kind: "user",
          name: "Roey",
          color: "#2a5fa8",
          avatar_preset: "05",
        }}
      />,
    );

    expect(
      container.querySelector("[data-avatar-preset]")?.getAttribute("data-avatar-preset"),
    ).toBe(getAvatarPreset("05")!.id);
  });

  test("uses a deterministic default glyph when no preset is set", () => {
    const { container } = render(
      <ParticipantAvatar participantId="us-none" kind="user" name="Nobody" />,
    );

    expect(container.querySelector(".avatar-art-glyph")?.textContent?.length).toBeGreaterThan(
      0,
    );
    expect(container.querySelector(".avatar.with-glyph")).not.toBeNull();
  });
});
