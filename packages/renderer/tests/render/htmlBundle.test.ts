import { describe, expect, it } from "vitest";
import {
  htmlBundleUrl,
  sessionAttachmentContentUrl,
  sessionRawUrl,
} from "../../src/render/htmlBundle.js";

describe("session raw URL builders", () => {
  it("threads root scope through HTML and file resource URLs", () => {
    expect(
      htmlBundleUrl(
        "2026-06-18-teams2",
        "report.html",
        "tok",
        { pathId: "6bcca1c96e2a" },
        { reload: "2" },
      ),
    ).toBe(
      "/sessions/2026-06-18-teams2/raw/report.html/index.html?token=tok&path_id=6bcca1c96e2a&reload=2",
    );

    expect(
      sessionRawUrl(
        "2026-06-18-teams2",
        "nested/file name.csv",
        null,
        { root: "/home/roey/workspace/CABAL/cabal-be" },
      ),
    ).toBe(
      "/sessions/2026-06-18-teams2/raw/nested/file%20name.csv?root=%2Fhome%2Froey%2Fworkspace%2FCABAL%2Fcabal-be",
    );

    expect(
      sessionAttachmentContentUrl(
        "2026-06-18-teams2",
        "att_abcdef123456",
        "tok",
        { pathId: "6bcca1c96e2a" },
      ),
    ).toBe(
      "/sessions/2026-06-18-teams2/attachments/att_abcdef123456/content?token=tok&path_id=6bcca1c96e2a",
    );
  });
});
