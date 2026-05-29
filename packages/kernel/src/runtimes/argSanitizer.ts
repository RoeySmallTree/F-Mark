import type { RuntimeOverridePatch } from "@f-mark/shared";

export type SanitizerRuntime = "claude" | "codex" | "opencode";

interface FlagSpec {
  /* Flag tokens that take a value as the NEXT arg (e.g. "-m gpt-5.5"). */
  withValueArgs: string[];
  /* "--model=foo" / "-m=foo" — single-arg form. Includes the trailing "=" in the prefix. */
  equalsPrefixes: string[];
  /* For codex -c key=value: when the previous arg was "-c", strip if the
     current arg matches one of these key= prefixes. */
  cKeyPrefixes?: string[];
}

const SPECS: Record<SanitizerRuntime, { model: FlagSpec; effort: FlagSpec }> = {
  codex: {
    model: {
      withValueArgs: ["-m", "--model"],
      equalsPrefixes: ["-m=", "--model="],
      cKeyPrefixes: ["model="],
    },
    effort: {
      withValueArgs: [],
      equalsPrefixes: [],
      cKeyPrefixes: ["model_reasoning_effort="],
    },
  },
  claude: {
    model: {
      withValueArgs: ["-m", "--model"],
      equalsPrefixes: ["-m=", "--model="],
    },
    effort: {
      withValueArgs: ["--effort"],
      equalsPrefixes: ["--effort="],
    },
  },
  opencode: {
    model: {
      withValueArgs: ["-m", "--model"],
      equalsPrefixes: ["-m=", "--model="],
    },
    effort: {
      withValueArgs: ["--variant"],
      equalsPrefixes: ["--variant="],
    },
  },
};

function stripBySpec(args: string[], spec: FlagSpec): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const tok = args[i];
    if (tok === undefined) continue;

    if (spec.withValueArgs.includes(tok)) {
      i++; // skip its value
      continue;
    }
    if (spec.equalsPrefixes.some((p) => tok.startsWith(p))) {
      continue;
    }
    if (spec.cKeyPrefixes && tok === "-c") {
      const next = args[i + 1];
      if (next !== undefined && spec.cKeyPrefixes.some((p) => next.startsWith(p))) {
        i++; // skip the key=value
        continue;
      }
    }

    out.push(tok);
  }
  return out;
}

export function sanitizeArgs(
  existing: string[],
  runtime: SanitizerRuntime,
  patch: RuntimeOverridePatch,
): string[] {
  let out = existing;
  const specs = SPECS[runtime];
  if (patch.model !== undefined) out = stripBySpec(out, specs.model);
  if (patch.effort !== undefined) out = stripBySpec(out, specs.effort);
  return out;
}
