import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, "..", "dist");

async function walk(dir) {
  const entries = await readdir(dir);
  for (const name of entries) {
    if (name === "_shared") continue;
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) {
      await walk(full);
    } else if (
      full.endsWith(".js") ||
      full.endsWith(".d.ts") ||
      full.endsWith(".js.map")
    ) {
      let text = await readFile(full, "utf8");
      if (!text.includes("@f-mark/shared")) continue;
      const sharedTarget = join(distDir, "_shared", "index.js");
      const rel = relative(dirname(full), sharedTarget).replace(/\\/g, "/");
      const replacement = rel.startsWith(".") ? rel : `./${rel}`;
      text = text.replaceAll("@f-mark/shared", replacement);
      await writeFile(full, text);
    }
  }
}

await walk(distDir);
console.log("rewrote @f-mark/shared imports in dist");
