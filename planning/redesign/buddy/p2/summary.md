# P2 — Backend extensions

## Intent

Add the endpoints the redesigned renderer will need: todos (with supersession), files, html bundles (folder events), raw-file serving, presets (built-in + project), skills scanner + endpoint, and search across the event log. All routes follow the existing kernel patterns (Fastify schema validation, WS bus publish on writes, `assertWithinSession` path safety, vitest coverage).

## Commit

`c0b6003 feat(kernel): redesign backend — todos, files, html, raw, presets, skills, search`

## Files created (per implementer report)

- `packages/kernel/src/routes/todos.ts` — POST + GET
- `packages/kernel/src/routes/files.ts` — POST
- `packages/kernel/src/routes/html.ts` — POST writes folder bundle
- `packages/kernel/src/routes/raw.ts` — GET serves files inside session folder
- `packages/kernel/src/routes/presets.ts` — GET, builtin + project
- `packages/kernel/src/routes/skills.ts` — GET, calls scanner
- `packages/kernel/src/routes/search.ts` — GET, fans out across event log
- `packages/kernel/src/skills/scanner.ts` — pure `findSkills(cwd, agent?)`
- `packages/shared/src/extensions.ts` — `Preset`, `SkillRef`, `SearchHit` types (re-exported from index.ts)
- `packages/kernel/assets/presets/*.md` (8 files)
- `packages/kernel/tests/routes/{todos,files,html,raw,presets,skills,search}.test.ts`
- `packages/kernel/tests/skills/scanner.test.ts`

## Files modified

- `packages/kernel/src/server.ts` — registers the 7 new route groups
- `packages/kernel/src/routes/static.ts` — adds `/presets`, `/skills`, `/search` to the API-paths classifier so 404s render JSON
- `packages/shared/src/index.ts` — re-exports `./extensions.js`
- `packages/shared/src/events.ts` — adds `TodoEventRecord`, `FileEventRecord`, `HtmlEventRecord`, `HtmlManifest`, extends `AnyEventRecord`
- `planning/redesign/progress.md`

## Verification done by implementer

- `pnpm -F f-mark test` → 120 tests across 28 files, all passing.
- `pnpm -F f-mark build` clean, `pnpm -F f-mark build:bundle` clean.

## What you (Codex) verify

Read `git show c0b6003 --stat`, then dig into each new file. Answer each item PASS / FAIL + short line. Be specific. Don't repeat the implementer's claim — verify.

1. **Todos route correctness:**
   - `POST /sessions/:id/events/todo` validates body (required: participant_id, id, title, status; allowed status enum: `open|wip|done`; supersedes optional).
   - File written as `<ts>_<pid>.todo.json` (verified via filename regex in routes/todos.ts or a test).
   - `publish()` emits `event_added` with `kind: "todo"`, and `event_superseded` when `supersedes` is set.
   - `GET /sessions/:id/todos`: aggregates by `id`, keeps **latest** version (by ts), drops events pointed at by another's `supersedes`. Groups by status into `{ open, wip, done }`. Sorts each bucket newest-first. Filters by `assigned_to` query param.
2. **Files route:** POST validates participant_id + id + path + mime_type; writes `<ts>_<pid>.file.json`; refuses path traversal.
3. **HTML route:** POST writes a folder `<ts>_<pid>.html/`, containing `manifest.json` (`id`, optional `title`, optional `dependencies`), `index.html`, and optional `style.css` / `script.js` only when those body fields are provided.
4. **Raw route:** `GET /sessions/:id/raw/:filename` and `…/:filename/*` serve files within the session folder, with `assertWithinSession` rejecting `../` escapes; correct `Content-Type` per extension.
5. **Presets:** GET returns `{ builtin, project }`. Built-in count = 8. Each preset has frontmatter (`name`, `group`, optional `icon`) and a non-empty body. Group enum honored. If `?session=<id>` is supplied, project presets come from `.f-mark/presets/*.md` in that session's project root.
6. **Skills scanner:** `findSkills(cwd, agent?)` walks up from `cwd` to filesystem root; at each dir checks `.{agent}/skills/*/SKILL.md` and `.skills/*/SKILL.md`. Dedupes by `name` (closer-to-cwd wins). Missing `SKILL.md` files are skipped, not thrown. With no `agent` param, includes all known agents (claude / codex / gemini) AND generic.
7. **Search:** `GET /search?q=&session=&limit=` returns `{ hits }` ordered by event ts desc. Search matches: prose `content`, prose `name`, choices `question` + option labels, todo `title` + `body`. `snippet` ~120 chars around the first match. Limit default 50, max 200.
8. **Registration + classifier:** `server.ts` calls all 7 new `register*Routes(...)` functions; `static.ts` notFoundHandler's `isApi` check includes `/presets`, `/skills`, `/search` so they return JSON 404s instead of falling through to the SPA index.html.
9. **Type exports:** `Preset`, `SkillRef`, `SearchHit` are exported from `@f-mark/shared` via `packages/shared/src/extensions.ts` re-export.
10. **No regressions:** all pre-existing tests in `packages/kernel/tests/` still pass.
11. **Scope adherence:** no renderer files touched.

End with: `Overall verdict: ready to advance` OR `Overall verdict: fix the following before advancing: …`

Write the review to `/home/roey/workspace/F-Mark/planning/redesign/buddy/p2/review_1.md`. Do not modify any source files.
