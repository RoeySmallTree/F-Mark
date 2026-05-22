import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sharedDist = join(here, "..", "..", "shared", "dist");
const targetDir = join(here, "..", "dist", "_shared");

await mkdir(dirname(targetDir), { recursive: true });
await rm(targetDir, { recursive: true, force: true });
await cp(sharedDist, targetDir, { recursive: true });
console.log(`bundled shared → ${targetDir}`);
