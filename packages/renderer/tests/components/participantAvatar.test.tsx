import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ParticipantAvatar } from "../../src/components/ParticipantAvatar.js";

describe("ParticipantAvatar", () => {
  test("renders a user avatar image when avatar_data_url is present", () => {
    const avatar = "data:image/png;base64,aGVsbG8=";
    const { container } = render(
      <ParticipantAvatar
        participantId="us-a7f3"
        participant={{
          kind: "user",
          name: "Roey",
          color: "#2a5fa8",
          avatar_data_url: avatar,
        }}
      />,
    );

    const img = container.querySelector(".avatar-img") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(avatar);
    expect(container.querySelector(".icon-mask")).toBeNull();
  });

  test("keeps provider icons for agents even if avatar_data_url is present", () => {
    const { container } = render(
      <ParticipantAvatar
        participantId="ag-claude"
        participant={{
          kind: "agent",
          name: "Claude",
          color: "#b86a1f",
          runtime_id: "claude",
          avatar_data_url: "data:image/png;base64,aGVsbG8=",
        }}
      />,
    );

    expect(container.querySelector(".avatar-img")).toBeNull();
    const mask = container.querySelector(".icon-mask") as HTMLElement | null;
    expect(mask?.style.getPropertyValue("--icon-url")).toContain(
      "claude-icon.png",
    );
  });
});
