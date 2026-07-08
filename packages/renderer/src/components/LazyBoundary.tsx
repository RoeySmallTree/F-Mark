/* LazyBoundary — error boundary for lazily-loaded subtrees.
 *
 * A stale-chunk dynamic-import failure self-heals via a one-time page reload
 * (the same recovery the global `vite:preloadError` handler uses). Any other
 * render error renders nothing — a lazy overlay/panel is optional chrome, so a
 * failure there must not take down the whole app. */

import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  isDynamicImportError,
  reloadForStaleChunk,
} from "../staleChunkReload.js";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class LazyBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isDynamicImportError(error)) {
      reloadForStaleChunk();
      return;
    }
    console.error("Lazy subtree failed to render", error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
