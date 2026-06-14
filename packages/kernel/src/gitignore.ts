import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

/* ensureFmarkGitignored — when the kernel creates `.f-mark/` in a project,
   surface that to git by adding it to the project's existing `.gitignore`.

   Search rules:
   - Walk upward from `root` (the dir that contains the new `.f-mark/`).
   - At each level, look for a `.gitignore`. The closest one wins.
   - Stop at the dir containing a `.git/` (don't cross into a parent repo) or
     at the filesystem root.
   - If no `.gitignore` is found anywhere in the walk, do nothing — we don't
     create one (the user didn't ask us to).

   Idempotent: scans existing entries and skips when `.f-mark/` (or an
   equivalent form: `.f-mark`, `/.f-mark`, with/without trailing slash) is
   already covered. Best-effort: callers should not rely on the side effect
   completing — a permissions error or read failure leaves the file alone. */
export async function ensureFmarkGitignored(root: string): Promise<void> {
  const target = await findGitignore(root);
  if (target === null) return;
  const { gitignorePath, dir } = target;

  const entry = computeEntry(dir, root);
  const existing = await readFile(gitignorePath, "utf8");
  if (alreadyIgnored(existing, entry)) return;

  const sep = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const block = `${sep}\n# F-Mark project data\n${entry}\n`;
  await writeFile(gitignorePath, existing + block);
}

interface Target {
  gitignorePath: string;
  dir: string;
}

/* Walk up from `start`. Return the first `.gitignore` we find. Walk stops
   after checking the dir containing a `.git/` (so a repo-root `.gitignore`
   IS considered, but we never look at a grandparent's `.gitignore`), and
   stops at the filesystem root regardless. */
async function findGitignore(start: string): Promise<Target | null> {
  let dir = start;
  while (true) {
    const gi = join(dir, ".gitignore");
    if (await fileExists(gi)) {
      return { gitignorePath: gi, dir };
    }
    const atGitRoot = await dirExists(join(dir, ".git"));
    if (atGitRoot) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function computeEntry(gitignoreDir: string, fmarkParent: string): string {
  // `.f-mark/` lives at `fmarkParent/.f-mark`. Express it relative to the
  // .gitignore's location, normalized to forward slashes (gitignore syntax).
  const rel = relative(gitignoreDir, fmarkParent);
  const prefix = rel === "" ? "" : `${rel.split(/[\\/]/).join("/")}/`;
  return `${prefix}.f-mark/`;
}

function alreadyIgnored(contents: string, entry: string): boolean {
  // Accept any form that would already match the .f-mark/ directory at the
  // intended location. Compare on stripped, comment-free lines.
  const target = entry.replace(/\/$/, "");
  const targetWithSlash = `/${target}`;
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const noTrailingSlash = line.replace(/\/$/, "");
    if (noTrailingSlash === target) return true;
    if (noTrailingSlash === targetWithSlash) return true;
  }
  return false;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}
