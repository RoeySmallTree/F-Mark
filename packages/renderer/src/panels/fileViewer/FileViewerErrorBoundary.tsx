import { Component, type ErrorInfo, type ReactNode } from "react";

interface FileViewerErrorBoundaryProps {
  children: ReactNode;
  reloadApp?: () => void;
  resetKey: string;
}

interface FileViewerErrorBoundaryState {
  error: Error | null;
}

function errorMessage(error: Error): string {
  return error.message || String(error);
}

function isDynamicImportFailure(error: Error): boolean {
  const message = errorMessage(error);
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /loading chunk \S+ failed/i.test(message) ||
    error.name === "ChunkLoadError"
  );
}

export class FileViewerErrorBoundary extends Component<
  FileViewerErrorBoundaryProps,
  FileViewerErrorBoundaryState
> {
  state: FileViewerErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): FileViewerErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: FileViewerErrorBoundaryProps): void {
    if (
      prevProps.resetKey !== this.props.resetKey &&
      this.state.error !== null
    ) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("File viewer render failed", error, info.componentStack);
  }

  private reloadApp = (): void => {
    this.props.reloadApp?.() ?? window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    const dynamicImportFailure = isDynamicImportFailure(error);
    const detail = errorMessage(error);
    return (
      <div
        className="fv-render-error"
        role="alert"
        aria-live="polite"
      >
        <div className="fv-render-error-title">
          {dynamicImportFailure
            ? "This file viewer code is unavailable."
            : "The file viewer hit an error."}
        </div>
        <div className="fv-render-error-copy">
          {dynamicImportFailure
            ? "This usually means the app was updated while this browser tab still has an older build open. Reload to fetch the current chunks."
            : "Switch files or reload the app to try again."}
        </div>
        <button
          type="button"
          className="fv-render-error-action"
          onClick={this.reloadApp}
        >
          Reload app
        </button>
        <pre className="fv-render-error-detail">{detail}</pre>
      </div>
    );
  }
}
