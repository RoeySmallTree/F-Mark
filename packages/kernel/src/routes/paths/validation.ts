import { realpathSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";

export interface PathErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidatePathResult {
  ok: true;
  canonical: string;
}

export interface ValidatePathError {
  ok: false;
  status: number;
  body: PathErrorShape;
}

export async function validatePath(
  raw: unknown,
): Promise<ValidatePathResult | ValidatePathError> {
  const input = validatePathShape(raw);
  if (!input.ok) return input;
  const canonical = canonicalPath(input.value);
  if (!canonical.ok) return canonical;
  const writable = await validateWritablePath(canonical.canonical);
  return writable ?? canonical;
}

export function validateRequiredQueryPath(raw: unknown): PathErrorShape | null {
  return typeof raw === "string" && raw.length > 0
    ? null
    : { code: "PATH_REQUIRED", message: "path query param is required" };
}

interface ValidatePathInput {
  ok: true;
  value: string;
}

function validatePathShape(raw: unknown): ValidatePathInput | ValidatePathError {
  if (typeof raw !== "string" || raw.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { code: "PATH_REQUIRED", message: "path is required" },
    };
  }
  if (!isAbsolute(raw)) {
    return {
      ok: false,
      status: 400,
      body: { code: "PATH_NOT_ABSOLUTE", message: "path must be absolute" },
    };
  }
  return { ok: true, value: raw };
}

function canonicalPath(raw: string): ValidatePathResult | ValidatePathError {
  try {
    return { ok: true, canonical: realpathSync(resolvePath(raw)) };
  } catch (err) {
    return canonicalPathError(raw, err as NodeJS.ErrnoException);
  }
}

function canonicalPathError(
  raw: string,
  err: NodeJS.ErrnoException,
): ValidatePathError {
  const code = err.code ?? "EUNKNOWN";
  if (code === "ENOENT" || code === "ENOTDIR") {
    return {
      ok: false,
      status: 400,
      body: {
        code: "PATH_NOT_FOUND",
        message: `path not found: ${raw}`,
        details: { path: raw },
      },
    };
  }
  return {
    ok: false,
    status: 400,
    body: {
      code: "PATH_NOT_CANONICAL",
      message: `failed to canonicalize path: ${raw}`,
      details: { path: raw, errno: code },
    },
  };
}

async function validateWritablePath(
  canonical: string,
): Promise<ValidatePathError | null> {
  try {
    await access(canonical, constants.W_OK);
    return null;
  } catch {
    return {
      ok: false,
      status: 403,
      body: {
        code: "PATH_NOT_WRITABLE",
        message: `path not writable: ${canonical}`,
        details: { path: canonical },
      },
    };
  }
}
