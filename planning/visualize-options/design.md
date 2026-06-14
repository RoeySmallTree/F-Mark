# Visualizing Options Design

## Decision

Choose fork A: add an atomic visual-alternatives write path.

The agent-facing path is a new MCP tool, `fmark_post_alternatives`, backed by a new REST route, `POST /sessions/:id/events/alternatives`. One call accepts:

```ts
{
  id: string;
  question: string;
  multi: boolean;
  options: Array<{
    id: string;
    label: string;
    html: string;
    css?: string;
    js?: string;
    title?: string;
    dependencies?: string[];
  }>;
  supersedes?: string;
  append_to?: string;
}
```

The server writes one HTML bundle per option, then writes one normal `choices` event whose `options[]` carry the generated bundle filename in `option.html`. This directly implements the grand-vision use case where an agent generates many HTML mockups and ranks/refines them in the document (`planning/grand-vision.md:38`, `planning/grand-vision.md:79`, `planning/grand-vision.md:220`).

Reject fork B. B makes the agent post N HTML events, parse N returned filenames, then post choices with those filenames. That is a brittle multi-call protocol, and `fmark_post_html` currently has no caller-supplied id (`packages/kernel/src/mcp/tools.ts:654`). A is the only path that can make the alternatives widget the unit of authoring, validation, websocket publishing, supersession, and guide documentation.

## Core Contract

No new `EventKind` is needed. The persisted user-visible widget is still `kind: "choices"` (`packages/shared/src/events.ts:1`). The new route is a convenience writer that creates asset HTML events plus one choices event.

Change `ChoicesOption` from `{ id, label }` to:

```ts
export interface ChoicesOption {
  id: string;
  label: string;
  /**
   * Bare html event bundle filename, for example
   * 20260613T120000.001Z_ag-codex.html.
   * No "html:" prefix and not the manifest id.
   */
  html?: string;
}
```

Current type location: `packages/shared/src/events.ts:73`. Current `ChoicesPayload.options` consumes that type at `packages/shared/src/events.ts:78`. Current write body reuses `ChoicesOption[]` at `packages/shared/src/eventContracts.ts:86`.

`ChoicesOption.html` is the bare HTML event filename, not `HtmlManifest.id`. The renderer already serves embeds from `/sessions/{sessionId}/raw/{event.filename}/index.html` (`packages/renderer/src/cards/EmbedCard.tsx:53`) and the raw route serves a session child path by filename (`packages/kernel/src/routes/raw.ts:101`, `packages/kernel/src/routes/raw.ts:120`). `HtmlManifest.id` is metadata loaded from `manifest.json` (`packages/kernel/src/events/reader.ts:24`) and is currently auto-derived from the allocated folder name (`packages/kernel/src/services/events.ts:785`). It is not the serving key.

The alternatives route response should be the choices write response plus the generated option file map:

```ts
interface PostAlternativesResponse extends EventWriteResponse<"choices"> {
  html: Array<{ option_id: string; filename: string }>;
}
```

Do not add legacy aliases like `html_id`, `htmlRef`, `file`, or `preview`. Change the single shared contract and update every caller/schema that touches choices options.

## Kernel Plan

### Shared Types

Update `packages/shared/src/events.ts`:

- Extend `ChoicesOption` with `html?: string` at `packages/shared/src/events.ts:73`.
- Leave `ChoicesPayload`, `ChoicePayload`, `HtmlManifest`, and `EventKind` otherwise unchanged (`packages/shared/src/events.ts:78`, `packages/shared/src/events.ts:89`, `packages/shared/src/events.ts:179`).

Update `packages/shared/src/eventContracts.ts`:

- Keep `PostChoicesBody.options: ChoicesOption[]` (`packages/shared/src/eventContracts.ts:86`).
- Add `PostAlternativesOption`, `PostAlternativesBody`, and `PostAlternativesResponse`.
- Export them from `packages/shared/src/index.ts`, which already exports the contracts file (`packages/shared/src/index.ts:1`).

After type changes, rebuild shared before kernel or renderer checks. The root build already does shared first (`package.json:12`), and `@f-mark/shared` publishes `dist/index.js` plus `dist/index.d.ts` (`packages/shared/package.json:6`, `packages/shared/package.json:12`).

### Event Service

Add `writeAlternativesEvent` in `packages/kernel/src/services/events.ts`, near `writeChoicesEvent` and `writeHtmlEvent` (`packages/kernel/src/services/events.ts:321`, `packages/kernel/src/services/events.ts:738`).

Behavior:

1. Validate `append_to` with `validateNonProseAppendTo` before writing anything (`packages/kernel/src/events/proseValidate.ts:36`).
2. Validate the session and participant once, matching `writeHtmlEvent`'s current checks (`packages/kernel/src/services/events.ts:755`, `packages/kernel/src/services/events.ts:758`).
3. Validate option ids are non-empty and unique within the alternatives body. Reject duplicate ids before writing files.
4. Validate every option has non-empty `html`. Reject before writing files.
5. Write one HTML bundle per option. Reuse the same allocation and `manifest.json`/`index.html`/`style.css`/`script.js` behavior that `writeHtmlEvent` uses today (`packages/kernel/src/services/events.ts:763`, `packages/kernel/src/services/events.ts:793`, `packages/kernel/src/services/events.ts:800`, `packages/kernel/src/services/events.ts:802`, `packages/kernel/src/services/events.ts:807`).
6. Child HTML manifests should get `title` and `dependencies` from the option, but should not get `append_to` and should not get `supersedes`. The choices event is the visible widget and the supersession unit.
7. Write the choices event with the original `id`, `question`, `multi`, `supersedes`, `append_to`, and options rewritten to `{ id, label, html: generatedFilename }`.
8. Return the choices filename plus the `option_id -> filename` map.

Atomicity requirement: validate all cheap failures first, and if a file write fails after one or more HTML bundles were created, best-effort remove those newly-created bundle directories before returning the error. This filesystem model cannot be perfectly transactional, but the route should not knowingly leave partial option bundles from a failed alternatives write.

Publishing requirement: publish the choices event first, then the child HTML asset events. `publishEventWrites` can already publish multiple records (`packages/kernel/src/services/eventPublisher.ts:34`). Publishing choices first avoids a transient renderer frame where option HTML bundles appear as standalone cards before the choices event that consumes them. The response/publish shape can be assembled from the existing `outcome` shape (`packages/kernel/src/services/events.ts:108`) without adding a second event kind.

### Choices Validation

Update `writeChoicesEvent` so a direct choices write can carry existing `option.html` refs (`packages/kernel/src/services/events.ts:321`). This is not the primary authoring path, but it keeps the shared contract honest.

Validation rules for `option.html`:

- If absent, it is a normal text option.
- If present, it must match the event filename pattern and end in `.html`. Reuse or mirror `EVENT_FILENAME_RE` from `packages/kernel/src/events/proseValidate.ts:29`.
- The referenced bundle must exist under the same session and have `index.html`.
- Reject traversal, empty strings, and manifest ids. Do not silently accept missing refs.

Update the JSON schema in `packages/kernel/src/routes/events.ts` so option items allow `html?: string`; current schema rejects additional option properties (`packages/kernel/src/routes/events.ts:568`, `packages/kernel/src/routes/events.ts:573`). Keep text choices working by making `html` optional, not by adding a second legacy choices route.

### Alternatives Route

Create `packages/kernel/src/routes/alternatives.ts` and register it in `packages/kernel/src/server.ts` next to the other event routes (`packages/kernel/src/server.ts:248`, `packages/kernel/src/server.ts:251`, `packages/kernel/src/server.ts:252`).

Route:

```txt
POST /sessions/:id/events/alternatives
```

Schema:

- `participant_id`, `id`, `question`, `options`, and `multi` required.
- `options[].id`, `options[].label`, and `options[].html` required.
- `options[].css`, `options[].js`, `options[].title`, `options[].dependencies` optional.
- `supersedes` and `append_to` optional.
- `additionalProperties: false` at every object level.

Return 400 for validation/write failures, matching the existing event routes (`packages/kernel/src/routes/events.ts:594`, `packages/kernel/src/routes/html.ts:65`, `packages/kernel/src/routes/flow.ts:118`).

### MCP Tool

Add `fmark_post_alternatives` to `FMARK_MCP_TOOL_NAMES` so Claude allow-list generation stays in sync (`packages/kernel/src/mcp/tools.ts:35`). Register the tool next to choices/html (`packages/kernel/src/mcp/tools.ts:541`, `packages/kernel/src/mcp/tools.ts:654`).

Tool schema:

```ts
{
  ...baseContextSchema,
  id: z.string(),
  question: z.string(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    html: z.string(),
    css: z.string().optional(),
    js: z.string().optional(),
    title: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
  })),
  multi: z.boolean(),
  supersedes: optionalRef(),
  append_to: optionalRef(),
}
```

The handler resolves write context like the existing write tools (`packages/kernel/src/mcp/tools.ts:562`, `packages/kernel/src/mcp/tools.ts:676`) and POSTs to `/sessions/{sessionId}/events/alternatives`.

Also update `fmark_post_choices` so its `options` schema accepts `html?: optionalRef()`, because the shared contract changed (`packages/kernel/src/mcp/tools.ts:550`). Do not teach agents to use this for newly generated alternatives; it is for referencing existing bundles.

### Agent Guide And Assets

Update `buildMcpGuide` to include `fmark_post_alternatives` in Core MCP Tools and add a short "Visual alternatives" section after "Composing Long Documents" (`packages/kernel/src/routes/guide.ts:122`, `packages/kernel/src/routes/guide.ts:131`). It should teach:

- Use `fmark_post_alternatives` when generating multiple HTML mockups/options in one turn.
- Put the prose/doc parent in `append_to` on the alternatives call, not on the child HTML.
- Preserve `append_to` when superseding a visual options widget, just like other blocks (`packages/kernel/src/routes/guide.ts:138`).
- Selection state is still posted through `fmark_post_choice`.
- Do not hand-write `option.html` unless referencing an existing HTML bundle filename returned by F-Mark.

Update the REST guide/asset references that currently describe choices only as `{id,label}` (`packages/kernel/assets/AGENT.md:43`, `packages/kernel/assets/codex-skill/f-mark/api.md:53`). The old text-only examples can remain, but the schema line must mention `html?`, and the alternatives endpoint must be documented. Package name stays `f-mark` (`packages/kernel/package.json:2`).

### Search

Keep choices search by question and labels (`packages/kernel/src/routes/search.ts:61`). Include `option.html` filenames in the choices text only as a low-value fallback, not as the primary snippet. Keep HTML manifest indexing for option asset events unchanged (`packages/kernel/src/routes/search.ts:111`) so titles/dependencies remain searchable.

Because child HTML asset events will be hidden from the feed, search results that match a child HTML title may point at an `html` event that is not rendered standalone. That is acceptable for the current non-navigating search panel (`packages/renderer/src/panels/Search.tsx:178`). If search later gets click-to-jump behavior, add parent-choice targeting then; do not block this feature on a search navigation redesign.

## Renderer Plan

### URL And Frame Primitive

Extract the raw HTML URL construction used by `EmbedCard` into a small renderer helper, for example `htmlBundleUrl(sessionId, filename, token, extraQuery?)`. Current `EmbedCard` builds the URL inline and appends `?token=` when auth is present (`packages/renderer/src/cards/EmbedCard.tsx:53`). Preserve that token behavior because the auth hook accepts query tokens and then sets the cookie used by later iframe subresource requests (`packages/kernel/src/auth.ts:205`, `packages/kernel/src/auth.ts:216`).

Create a reusable `HtmlPreviewFrame` component:

- Props: `sessionId`, `filename`, `title`, `className?`, `reloadKey?`.
- Renders an iframe with `sandbox="allow-scripts"` exactly like `EmbedCard` currently does (`packages/renderer/src/cards/EmbedCard.tsx:125`).
- Does not add `allow-same-origin`, `allow-popups`, or top-navigation permissions.
- Shows the existing `.placeholder` pattern when no session or no filename exists (`packages/renderer/src/cards/EmbedCard.tsx:136`, `packages/renderer/src/cards/cards.css:958`).

### ChoicesCard

`ChoicesCard` currently renders every option as a full-width text button and posts choice state through `pick()` (`packages/renderer/src/cards/ChoicesCard.tsx:51`, `packages/renderer/src/cards/ChoicesCard.tsx:102`). Keep that exact choice-posting behavior.

Add rich rendering when at least one option has `html`:

- Render a grid, not a vertical button stack.
- Each option is a non-button `.choice-preview-card` containing:
  - Header row with an actual select button, label, and selected badge.
  - Compact live iframe preview using `HtmlPreviewFrame`.
  - Footer with a `Fullscreen` icon+text button.
- Do not wrap the iframe in a `<button>`. Iframes are interactive content, and putting them inside the current option button would create invalid markup and accidental selections.
- The select button calls the same `pick(opt.id)` function, preserving single and multi-select semantics and `postChoice` payloads (`packages/renderer/src/cards/ChoicesCard.tsx:54`, `packages/renderer/src/cards/ChoicesCard.tsx:59`).
- In single-select mode, use a radio-style control. In multi-select mode, use a checkbox-style control. The payload remains `selected: string[]`.
- If a mixed choices event has one HTML option and one text option, render the whole grid. Text-only options get a quiet placeholder panel in the preview area, not a second layout.

Grid CSS:

```css
.choices-options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.choice-preview-card { min-width: 0; border: 1px solid var(--line-2); border-radius: 8px; }
.choice-preview-frame { height: 220px; }
.choices-card-embedded .choice-preview-frame { height: 180px; }
```

Use existing restrained card vocabulary from `.choices-card` and `.embed-frame` (`packages/renderer/src/cards/cards.css:757`, `packages/renderer/src/cards/cards.css:941`). Do not introduce a new visual theme.

### Fullscreen Modal

Use the global modal store and `ModalRoot`, not a local per-card portal. The app already has one modal dispatch and Escape/backdrop behavior (`packages/renderer/src/state/store.ts:97`, `packages/renderer/src/modals/ModalRoot.tsx:18`). Reusing it keeps fullscreen HTML consistent between `EmbedCard` and visual choices.

Store changes:

- Add `ModalKey` value `"html-preview"` (`packages/renderer/src/state/store.ts:97`).
- Add payload state:

```ts
interface HtmlPreviewModalState {
  sessionId: string;
  filename: string;
  title: string;
  mode: "preview" | "source";
}
```

- Add `htmlPreview: HtmlPreviewModalState | null`.
- Add `openHtmlPreview(payload)` and clear `htmlPreview` in `closeModal`, following the existing `editingPreset` payload pattern (`packages/renderer/src/state/store.ts:667`, `packages/renderer/src/state/store.ts:1015`, `packages/renderer/src/state/store.ts:1024`).

Modal component:

- `packages/renderer/src/modals/HtmlPreviewModal.tsx`.
- Uses `<div className="modal html-preview-modal" role="dialog" aria-modal="true">`.
- Calls `e.stopPropagation()` on the modal shell so the backdrop click handler in `ModalRoot` still closes only when the backdrop itself is clicked (`packages/renderer/src/modals/ModalRoot.tsx:57`).
- Preview mode renders a large iframe at `/sessions/{sessionId}/raw/{filename}/index.html`.
- Source mode fetches the same `index.html` as text and renders escaped text in `<pre><code>`.
- Escape closes via `ModalRoot` (`packages/renderer/src/modals/ModalRoot.tsx:25`).

CSS:

```css
.modal.html-preview-modal {
  width: min(1180px, calc(100vw - 48px));
  height: min(820px, calc(100vh - 48px));
}
.html-preview-body {
  padding: 0;
  flex: 1;
  min-height: 0;
}
.html-preview-body iframe,
.html-source-code {
  width: 100%;
  height: 100%;
}
```

This extends the modal frame that already defines max height, overflow, and animation (`packages/renderer/src/modals/modals.css:19`, `packages/renderer/src/modals/modals.css:29`).

### EmbedCard Footer

Implement the footer from the redesign for standalone and embedded `EmbedCard`: `Fullscreen`, `Reload`, and `View source` (`planning/redesign/cards.jsx:177`). Do not add `Comment`; line comments already belong to prose/comment surfaces and adding a fourth action is outside this widget.

Definitions:

- Fullscreen: opens `openHtmlPreview({ sessionId, filename: activeFilename, title, mode: "preview" })`.
- Reload: increments a local `reloadKey` and appends `reload=<n>` to the iframe URL. This remounts/reloads the active bundle without writing any event data.
- View source: opens `openHtmlPreview({ sessionId, filename: activeFilename, title, mode: "source" })` and displays the raw `index.html` text in the modal.

Keep variant chips as they are for standalone HTML cards (`packages/renderer/src/cards/EmbedCard.tsx:37`). Do not use variant chips inside `ChoicesCard` option previews; an option preview is a direct filename reference and must not accidentally flip to another HTML event with the same manifest id.

### Event Dispatch And Aggregation

`EventCard` needs no new branch. A visual alternatives widget is still `choices -> ChoicesCard` (`packages/renderer/src/cards/EventCard.tsx:125`).

Add an aggregation rule so child HTML asset events referenced by any choices option do not render as standalone `EmbedCard`s:

- Build `optionHtmlFilenames` from all events, not only visible events.
- Any `html` event whose filename appears in that set is hidden from `feed`, `feedDocument`, and `feedConversation`.
- Still keep those events in `agg.events` so `ChoicesCard`, search, logs, and source lookups can find them.

This must use all choices events, including superseded ones. If it only uses visible choices, then old option HTML bundles from a superseded alternatives widget will reappear as standalone cards after the parent choices event is hidden by supersession. Current supersession filtering happens before feed construction (`packages/renderer/src/state/aggregate.ts:142`, `packages/renderer/src/state/aggregate.ts:173`), so compute the option-ref set before that filter or from `sorted`.

Keep append-to composition at the choices level. `isComposableBlock` already allows `choices` as an inline block kind (`packages/shared/src/blocks.ts:19`). Do not set `append_to` on child HTML bundles. If an alternatives widget belongs in a document, the choices event gets `append_to`, and the renderer embeds that one widget.

Fix embedded state propagation:

- Add `allEvents` to `ProseCard`, `BlockAccordion`, and `ProseInlineBlock`.
- Pass `agg.events` from `EventCard` into `ProseCard`.
- Pass that through rendered and accordion inline paths.
- `InlineChoicesBlock` must call `<ChoicesCard allEvents={allEvents} ...>` instead of `allEvents={[event]}` (`packages/renderer/src/cards/ProseInlineBlock.tsx:114`).
- `InlineHtmlBlock` may continue using `[event]` for variants, but using `allEvents` is acceptable if option asset events are hidden by the aggregate rule (`packages/renderer/src/cards/ProseInlineBlock.tsx:106`).

Without this, anchored visual choices would render but selected state would not update because `ChoicesCard` finds the latest answer by scanning `allEvents` (`packages/renderer/src/cards/ChoicesCard.tsx:39`).

## Security And Auth Notes

Keep iframe sandbox as `allow-scripts` only (`packages/renderer/src/cards/EmbedCard.tsx:133`). Because the HTML is served by the same kernel origin, adding `allow-same-origin` would let option HTML act as same-origin script and potentially read app state. With scripts allowed but same-origin denied, mockup scripts can run, but the frame gets an opaque origin and cannot reach the parent DOM.

Raw URLs must continue to carry the token query parameter when auth is enabled (`packages/renderer/src/cards/EmbedCard.tsx:55`). The auth hook accepts the query token and sets the HttpOnly cookie (`packages/kernel/src/auth.ts:205`), and later raw subresource requests can authenticate via that cookie (`packages/kernel/src/auth.ts:216`). Source-mode fetches should use the same helper URL or an Authorization header.

Do not add arbitrary file serving. The route remains session-scoped raw serving with traversal rejection (`packages/kernel/src/routes/raw.ts:52`, `packages/kernel/src/routes/raw.ts:60`, `packages/kernel/src/routes/raw.ts:126`).

## Test Plan

### Shared And Kernel Unit Tests

Add shared type coverage by compiling shared first:

```txt
pnpm -F @f-mark/shared build
```

Kernel route tests:

- `POST /sessions/:id/events/alternatives` writes two HTML bundle folders plus one `.choices.json` whose options contain generated `.html` filenames.
- Response includes choices `filename`, `kind: "choices"`, and the `html` option map.
- Created `index.html`, `style.css`, and `script.js` are served through `/raw/{filename}/...`, extending the existing raw route pattern (`packages/kernel/tests/routes/raw.test.ts:18`).
- Direct `POST /events/choices` accepts `options[].html` when the referenced bundle exists.
- Direct `POST /events/choices` rejects a missing HTML ref, a manifest id, an empty string, and traversal.
- If alternatives validation fails before writes, no bundle dirs are created.
- If a write fails after bundle allocation, created dirs are cleaned up best-effort.
- Superseding an alternatives choices event does not require superseding child HTML events.

Update the existing choices route test at `packages/kernel/tests/routes/events.test.ts:354` and add a new alternatives describe block.

MCP tests:

- `FMARK_MCP_TOOL_NAMES` includes `fmark_post_alternatives` (`packages/kernel/src/mcp/tools.ts:35`).
- The tool POSTs `/events/alternatives` with compacted optional refs.
- `fmark_post_choices` preserves `options[].html`.

### Renderer Unit Tests

Choices:

- Text-only choices keep the existing rendering and click payload (`packages/renderer/tests/cards/choices.test.tsx:22`).
- Visual choices render `.choices-options-grid`, one iframe per HTML option, labels, selected state, and a Fullscreen button per option.
- Clicking the select control posts the same `choice` body as today (`packages/renderer/tests/cards/choices.test.tsx:46`).
- Iframe clicks do not select an option.
- Embedded visual choices receive `allEvents` and show `.chosen` when a later `choice` event exists.

Embed:

- Footer renders Fullscreen, Reload, View source.
- Fullscreen opens `activeModal: "html-preview"` with the active variant filename.
- Reload changes the iframe URL/key without posting events.
- View source opens source mode and fetches `index.html`.

Modal:

- Escape and backdrop close through `ModalRoot` (`packages/renderer/src/modals/ModalRoot.tsx:25`, `packages/renderer/tests/modals/new-session.test.tsx:267`).
- Preview mode preserves token query.
- Source mode escapes HTML text and does not execute it.

Aggregate:

- Option-referenced HTML events are not included in feed slices.
- Option-referenced HTML events remain in `agg.events`.
- Superseded choices still keep their old child HTML hidden.
- Standalone HTML not referenced by choices still renders through `EmbedCard` (`packages/renderer/tests/cards/event-card.test.tsx:161`).

### Real UI E2E

Extend `tests/e2e/real-ui-smoke.spec.ts`, whose mock layer already centralizes route responses (`tests/e2e/real-ui-smoke.spec.ts:173`).

Add a test fixture with:

- A session.
- A choices event with two or more options containing `.html` filenames.
- Matching child HTML events in the session event list.
- Raw route mocks for `/sessions/:id/raw/:filename/index.html` returning marker HTML.
- A `POST /sessions/:id/events/choice` mock that records selected ids.

Assertions:

- The visual choices grid appears in the real app.
- Child HTML bundles do not appear as standalone `.embed-card`s.
- The option iframe loads the marker HTML.
- Clicking Fullscreen opens the modal and loads the same marker at large size.
- Escape closes the modal.
- Selecting an option posts `{ choices_id, selected }`.

Run sequence after implementation:

```txt
pnpm -F @f-mark/shared build
pnpm -F f-mark test
pnpm -F @f-mark/renderer test
pnpm test:real-ui
```

Use the root `pnpm build` before packaging because it rebuilds shared, renderer, kernel, and the kernel bundle in order (`package.json:12`).

## Prioritized Risks

1. Child HTML leakage after supersession. If the renderer hides only child HTML referenced by visible choices, old option bundles will reappear when the parent choices widget is superseded. Compute option refs from all choices events.

2. Iframe same-origin escape. Raw HTML is served by the same kernel origin, so adding `allow-same-origin` to the iframe sandbox would be dangerous. Keep `sandbox="allow-scripts"` only.

3. Partial filesystem writes. Alternatives is a multi-file write in an append-only filesystem. Validate first, cleanup best-effort on failure, and publish only after the choices event is written.

4. Embedded choices state. `ProseInlineBlock` currently passes `allEvents={[event]}` to embedded choices, so anchored visual options would not show selected state. Thread `agg.events` through the inline path.

5. Filename vs manifest id confusion. The option ref is the bundle filename because raw serving and `EmbedCard` are filename-based. Manifest `id` is metadata and should not be used for iframe URLs.

6. Iframe density. Eight live iframes are heavier than text buttons. Use compact heights, lazy-load iframes with the browser default `loading="lazy"` where supported, and avoid loading hidden standalone duplicates.
