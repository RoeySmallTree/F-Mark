import { describe, expect, it } from "vitest";
import { AvatarImageError, readImageFile } from "../../src/lib/avatarImage.js";

/* cropToAvatarDataUrl needs a real <canvas> (not available under jsdom), so it
   is exercised in the browser smoke-test. These cover the MIME gating and the
   file read that runs without canvas. */
describe("readImageFile", () => {
  it("rejects non-image files with a helpful message", async () => {
    const file = new File(["nope"], "notes.txt", { type: "text/plain" });
    await expect(readImageFile(file)).rejects.toBeInstanceOf(AvatarImageError);
    await expect(readImageFile(file)).rejects.toThrow(
      /PNG, JPEG, WebP, or GIF/,
    );
  });

  it("reads an accepted image file to its data URL (no size rejection)", async () => {
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    // base64 of "avatar" is "YXZhdGFy"
    expect(await readImageFile(file)).toBe("data:image/png;base64,YXZhdGFy");
  });
});
