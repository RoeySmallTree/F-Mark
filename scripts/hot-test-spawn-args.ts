/* Verify that applyRuntimeOverride produces correct spawn args for each
   runtime. Mirrors what spawnArgsForRuntime would feed into tmux. */

import { applyRuntimeOverride } from "../packages/kernel/src/routes/managedAgents.js";

function header(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log("  " + title);
  console.log("=".repeat(60));
}

function checkContains(label: string, args: string[], wanted: string[]): void {
  const missing = wanted.filter((w) => !args.some((a) => a.includes(w)));
  const status = missing.length === 0 ? "✓" : "✗";
  console.log(`${status} ${label}:`);
  console.log(`  args=${JSON.stringify(args)}`);
  if (missing.length > 0) console.log(`  MISSING: ${JSON.stringify(missing)}`);
}

header("CODEX spawn-args round-trip");
// Pre-existing args include conflicting model/effort flags
const codexBase = ["-m", "gpt-5.4", "-c", "model_reasoning_effort=low", "--other"];
const codexOut = applyRuntimeOverride("codex", codexBase, {
  model: "gpt-5.5",
  effort: "xhigh",
});
checkContains("codex model+effort override", codexOut, [
  "-m",
  "gpt-5.5",
  "model_reasoning_effort=xhigh",
]);
console.log(`  no leftover old model: ${!codexOut.includes("gpt-5.4")}`);
console.log(`  no leftover old effort: ${!codexOut.some((a) => a.includes("=low"))}`);

header("CLAUDE spawn-args round-trip");
const claudeBase = ["--model", "opus", "--effort", "low", "--other"];
const claudeOut = applyRuntimeOverride("claude", claudeBase, {
  model: "claude-sonnet-4-6",
  effort: "high",
});
checkContains("claude model+effort override", claudeOut, [
  "--model",
  "claude-sonnet-4-6",
  "--effort",
  "high",
]);
console.log(`  no leftover opus: ${!claudeOut.includes("opus")}`);

header("OPENCODE spawn-args round-trip");
const ocBase = ["-m", "openai/gpt-5.4", "--variant", "low"];
const ocOut = applyRuntimeOverride("opencode", ocBase, {
  model: "openai/gpt-5.5",
  effort: "high",
});
checkContains("opencode model+effort override", ocOut, [
  "-m",
  "openai/gpt-5.5",
  "--variant",
  "high",
]);
console.log(`  no leftover gpt-5.4: ${!ocOut.includes("openai/gpt-5.4")}`);
console.log(`  no leftover variant low: ${!ocOut.some((a, i, arr) => arr[i-1] === "--variant" && a === "low")}`);

header("OPENCODE: brand-new args, model only");
const ocNew = applyRuntimeOverride("opencode", [], { model: "openai/gpt-5.5" });
checkContains("opencode bare model", ocNew, ["-m", "openai/gpt-5.5"]);
console.log("  effort omitted:", !ocNew.includes("--variant"));

header("CLAUDE: empty patch is identity");
const claudeId = applyRuntimeOverride("claude", ["--model", "opus"], {});
console.log("  identity:", JSON.stringify(claudeId) === JSON.stringify(["--model", "opus"]));

header("UNKNOWN runtime: no-op");
const unknown = applyRuntimeOverride("custom-runtime", ["-m", "x"], {
  model: "y",
});
console.log("  no-op:", JSON.stringify(unknown) === JSON.stringify(["-m", "x"]));

console.log("\nSpawn-args hot-test complete.");
