import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const rendererDist = join(here, "..", "..", "renderer", "dist");
const kernelDist = join(here, "..", "dist");
const target = join(kernelDist, "renderer");

await mkdir(kernelDist, { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(rendererDist, target, { recursive: true });
console.log(`bundled renderer → ${target}`);
