/* Full-bleed loading placeholder for the file viewer — the SAME PixelBlast
   ambient animation the chat pane shows while it loads (LoadingAnimation),
   tinted with the active theme accent. Replaces the old "loading …" text so
   every editor / diff / preview load state matches the rest of the app. */

import { LoadingAnimation } from "../../components/LoadingAnimation.js";

export function FvLoading(): JSX.Element {
  return (
    <div className="fv-loading-anim" data-testid="fv-loading-anim">
      <LoadingAnimation />
    </div>
  );
}
