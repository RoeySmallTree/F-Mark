const NO_LOOSE_STRING_VALUES = {
  webgl2: "webgl2",
  webgl: "webgl",
} as const;

let webglSupported: boolean | null = null;

export function canCreateWebGlContext(): boolean {
  if (webglSupported !== null) return webglSupported;
  if (!hasWebGlGlobals()) {
    webglSupported = false;
    return webglSupported;
  }

  const canvas = document.createElement("canvas");
  try {
    const gl = canvas.getContext(NO_LOOSE_STRING_VALUES.webgl2) ?? canvas.getContext(NO_LOOSE_STRING_VALUES.webgl);
    webglSupported = gl !== null;
  } catch {
    webglSupported = false;
  }
  return webglSupported;
}

function hasWebGlGlobals(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    (typeof window.WebGLRenderingContext !== "undefined" ||
      typeof window.WebGL2RenderingContext !== "undefined")
  );
}
