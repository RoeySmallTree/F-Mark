# Live bug subagent queue

Created: 2026-06-10 20:03 CEST

Purpose: append every bug report as it arrives, even while earlier bugs are still unresolved. Each bug gets a focused subagent, and this file is the running coordination record.

## Operating rules

- Append new bugs immediately under `Bug queue`; do not wait for prior bugs to finish.
- Launch one focused subagent per bug unless a later bug is clearly the same root cause.
- Give every subagent a bounded ownership area and remind it not to revert unrelated work.
- Mark a bug `Done` only after its fix is integrated and verification is recorded.
- Keep unresolved work visible as `Queued`, `Running`, `Needs review`, or `Blocked`.

## Status key

- `Queued`: recorded, subagent not yet launched.
- `Running`: subagent launched and working.
- `Needs review`: subagent returned changes or findings; integration/review pending.
- `Done`: fix integrated and verification recorded.
- `Blocked`: cannot proceed without new user input or external state.

## Bug queue

### Bug 1: Dark theme integration modal has black-on-black UI

- Reported: 2026-06-10 20:04 CEST
- Source: user screenshot of the Claude integration setup modal.
- Status: Done
- Subagent: Ptolemy (`019eb2b5-170d-7f62-abd1-6a50e4a3e638`)
- Problem: in dark themes, multiple controls and text areas render black or near-black on a near-black modal. The screenshot shows the setup scope tabs, item copy, and some labels losing contrast.
- Likely owner: `packages/renderer/src/modals/IntegrationSetupModal.tsx` and `packages/renderer/src/modals/modals.css`.
- Expected outcome: dark theme modal surfaces, tab states, setup item labels/details, and action buttons have readable contrast without regressing light themes.
- Root cause: integration modal styles reused dim theme tokens and referenced undefined `--ink-1`, causing invalid text/hover colors to fall back poorly in dark themes.
- Fix: added modal-local contrast tokens and a focused class-state test.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run tests/modals/integration-setup.test.tsx` passed locally.

### Bug 2: Gemini should be removed as an agent/runtime option everywhere

- Reported: 2026-06-10 20:10 CEST
- Source: user screenshot of the connected agents/runtime cards.
- Status: Done
- Subagent: Bohr (`019eb2b7-2088-7a73-8c56-c61e584fe969`)
- Problem: Gemini still appears as an available runtime/provider option even though it should no longer be offered.
- Likely owner: runtime defaults/registry plumbing and renderer launcher/settings runtime option surfaces.
- Expected outcome: Gemini is not shown as an option in launcher, connected-agent cards, settings/runtime selection, or any other provider picker. Existing historical data should not crash if it contains Gemini.
- Root cause: stale persisted runtime registries and env-probe data could reintroduce `gemini` into renderer option lists even after defaults removed it.
- Fix: added shared retired-runtime filtering, filtered kernel `/runtimes` outputs and renderer offer surfaces, and rejected re-adding retired runtimes.
- Verification: `pnpm --filter @f-mark/shared build`, `pnpm --filter f-mark test -- tests/runtimes/registry.test.ts tests/routes/runtimes.test.ts`, and `pnpm --filter @f-mark/renderer exec vitest run tests/shell/topBar.test.tsx tests/modals/settings.test.tsx tests/modals/settings/runtimesPanel.test.tsx` passed locally.

### Bug 3: Runtime/provider cards use initials instead of actual provider icons

- Reported: 2026-06-10 20:10 CEST
- Source: user screenshot of connected agents/runtime cards.
- Status: Done
- Subagent: Heisenberg (`019eb2b7-3673-7990-bc01-76a85d379ae8`)
- Problem: provider cards render text initials such as `CC`, `CX`, `OC`, and `GE` rather than the actual Claude, Codex/OpenAI, and Opencode provider icons.
- Likely owner: renderer launcher/runtime card components and static/provider icon assets.
- Expected outcome: runtime/provider cards and related picker surfaces use actual provider icons where available, with initials only as a fallback for unknown/custom providers.
- Root cause: `AgentLauncher` and picker rows had a separate initials-based logo path instead of shared provider icon metadata.
- Fix: added shared runtime provider visual helpers, applied them to provider cards and plus-menu rows, and kept initials for custom fallback.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run tests/runtimes.test.ts tests/shell/agentLauncher.test.tsx tests/components/plusButton.test.tsx` passed locally.

### Bug 4: Agent dropdown opens downward and gets clipped

- Reported: 2026-06-10 20:11 CEST
- Source: user screenshot of the agent chip dropdown near the composer/participant strip.
- Status: Done
- Subagent: Boyle (`019eb2b7-634e-7590-926c-b600784867ca`)
- Problem: the agent dropdown opens downward from a chip near the lower part of the viewport and is cut off at the bottom instead of flipping upward or clamping within the viewport.
- Likely owner: participant strip / agent chip menu positioning in the renderer.
- Expected outcome: agent dropdown remains fully visible on screen across lower-viewport placements, either by flipping above the trigger or by viewport-aware clamping.
- Root cause: agent chip menu was always placed at `rect.bottom + 4` and only clamped horizontally.
- Fix: added viewport-aware placement, post-render measuring, resize handling, and menu max-height scrolling.
- Verification: `pnpm --dir packages/renderer exec vitest run tests/shell/topBar.test.tsx -t "agent action menu flips above"` passed locally.

### Bug 5: Custom profile color input needs a live preview

- Reported: 2026-06-10 20:13 CEST
- Source: user screenshot of the Profile modal color row.
- Status: Done
- Subagent: Sagan (`019eb2ba-4dba-7323-a2cc-3b4305f957c2`)
- Problem: when the user enters a color that is not one of the preset swatches, the Profile modal does not show a preview swatch for that custom color.
- Likely owner: profile/settings modal UI and related tests.
- Expected outcome: valid custom color text renders a live preview swatch in the color row, including colors that are not in the preset set; invalid values should not create a misleading preview.
- Root cause: valid custom hex input updated state but only preset swatches were rendered in the color row.
- Fix: rendered a non-clicking live preview swatch for valid non-preset hex values.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run tests/modals/settings.test.tsx` passed locally.

### Bug 6: User profile image upload should drive user avatar everywhere

- Reported: 2026-06-10 20:13 CEST
- Source: user screenshot of the Profile modal.
- Status: Done
- Subagent: Kant (`019eb2ba-6a44-7271-b924-afbf7622fa4f`)
- Problem: the user cannot upload a profile image, and user avatars across the app do not use a user-supplied profile image.
- Likely owner: participant/profile data contract, profile/settings modal UI, persistence route, and `ParticipantAvatar` rendering.
- Expected outcome: Profile modal supports image upload for the current user, persists the image/reference, and renders it as the user's profile image everywhere user avatars are shown, with existing initials/icon fallback preserved.
- Root cause: participants only persisted `name` and `color`, and `ParticipantAvatar` always rendered the built-in human/provider icon path.
- Fix: added bounded `avatar_data_url` participant contract/validation, Profile upload/preview/remove UI, and user-only avatar image rendering.
- Verification: `pnpm --filter @f-mark/shared build`, `pnpm --dir packages/kernel exec vitest run tests/participants.test.ts tests/routes/participants.test.ts`, `pnpm --filter @f-mark/renderer exec vitest run tests/modals/settings.test.tsx tests/components/participantAvatar.test.tsx`, `pnpm --filter f-mark exec tsc --noEmit --pretty false`, and `pnpm --filter @f-mark/renderer exec tsc -b --pretty false` passed locally.

### Bug 7: Empty chat should render a loading layout instead of the guide text

- Reported: 2026-06-10 20:16 CEST
- Source: user screenshot of an empty chat/feed area.
- Status: Done
- Subagent: Volta (`019eb2bc-5a6c-75e1-a4f7-ba372c6e7a7b`)
- Problem: an empty chat currently renders `No events yet - start with /guide or paste an invite to an agent.` The desired empty state is a loading layout, not that static text.
- Likely owner: chat/feed empty-state rendering in the renderer shell/feed components.
- Expected outcome: when the chat/feed has no events, the user sees an appropriate loading/skeleton layout instead of the guide/invite text.
- Root cause: the default Everything empty branch in `Feed.tsx` rendered static guide/invite onboarding copy.
- Fix: replaced that branch with a dark-theme-safe loading skeleton/status layout.
- Verification: `pnpm --dir packages/renderer exec vitest run tests/shell/view-toggle.test.tsx` passed locally.

### Bug 8: Dark theme still has black text from free-styled component colors

- Reported: 2026-06-11 09:23 CEST
- Source: user screenshot of the F-Mark tool selection/internal tool card raw-details area.
- Status: Done
- Subagent: Hypatia (`019eb590-81b0-7903-b0c4-87a117e4fe29`)
- Problem: dark themes still have black or near-black text in multiple places. The screenshot shows internal tool-card/raw-details text inheriting or explicitly using colors that do not resolve through the theme system.
- Likely owner: renderer tool/card presentation styles, theme tokens, inline style usage in components, and lint/ESLint guardrails.
- Expected outcome: the visible tool-card/raw-details text uses semantic theme tokens with readable contrast in dark themes, and components cannot freely introduce string/literal colors that bypass theme tokens.
- Root cause: compact internal `ToolSearch` cards rendered raw details with partial `<pre>` styling and card/body text inheritance did not force semantic foreground tokens, while components had no guard against raw color literals in React style objects.
- Fix: completed local `--tool-card-*` semantic tokens, fully tokenized raw-details pre styling, added internal raw-details regression coverage, and added a static renderer guard wired into `pnpm test` to reject obvious raw component color literals while allowing theme vars and intentional data-driven colors.
- Verification: `pnpm -F @f-mark/renderer run test:static-colors` and `pnpm -F @f-mark/renderer exec vitest run src/cards/ToolUseCard.test.tsx tests/static-color-guard.test.ts` passed locally.

### Bug 9: Toolbox/internal tool cards use a poor dark-theme color palette

- Reported: 2026-06-11 09:24 CEST
- Source: user screenshot of an expanded internal F-Mark tool selection card inside an agent tool group.
- Status: Done
- Subagent: Lovelace (`019eb592-1f07-7c03-a3d8-c38b10b05eab`)
- Problem: the toolbox/internal tool-card palette is generally unpleasant in dark themes, with a red/brown tinted body band and low-contrast details that make the internal tool output feel broken even where text uses tokens.
- Likely owner: renderer card CSS/theme tokens for tool groups, internal tool cards, status badges, raw details, and dark-theme surface colors.
- Expected outcome: toolbox/internal surfaces use intentional semantic theme colors with readable contrast and a calmer dark-theme palette, without ad hoc per-component colors.
- Root cause: internal tool cards reused the normal tool/status palette, mixed dark surfaces with the agent amber/orange token, and dimmed the whole card with opacity, which made expanded internal tools read as a muddy red/brown band.
- Fix: added scoped semantic tool-card CSS variables, switched failed tool cards to rose/error tones, removed internal-card opacity dimming, and gave internal cards a calmer neutral panel/canvas palette with tokenized raw-details surfaces.
- Verification: `pnpm --filter @f-mark/renderer test src/cards/ToolUseCard.test.tsx` passed locally.

### Bug 10: Clicking a file crashes on failed dynamic import chunk

- Reported: 2026-06-11 09:26 CEST
- Source: user pasted browser stack trace after clicking a file.
- Status: Done
- Subagent: Einstein (`019eb593-fd68-7cc3-8729-7c3743b586db`)
- Problem: clicking a file crashes the app with `TypeError: Failed to fetch dynamically imported module: http://localhost:7778/assets/index-BjtbifiZ.js`, bubbling through the built bundle and leaving the app uncaught.
- Likely owner: renderer file viewer/right files lazy imports, dynamic import error handling, build asset/chunk naming, and app error boundaries.
- Expected outcome: opening a file does not crash the whole app when a lazy viewer chunk is unavailable or stale; the UI should recover gracefully or prompt a reload while preserving the rest of the shell.
- Root cause: code/text files mount `MonacoRenderer`, whose `React.lazy(import("@monaco-editor/react"))` can reject when a browser tab holds a stale build chunk; no file-viewer-local boundary caught the render/lazy failure.
- Fix: added a scoped `FileViewerErrorBoundary`, wrapped only the file viewer body with reset on active-file changes, and added a stale-chunk reload affordance with themed fallback styling.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run tests/panels/file-viewer-error-boundary.test.tsx` and `pnpm --filter @f-mark/renderer exec tsc -b --pretty false` passed locally.

### Bug 11: Chat loading state should use the pixel loading animation

- Reported: 2026-06-11 09:28 CEST
- Source: user follow-up on the empty/loading chat bug.
- Status: Done
- Subagent: Mencius (`019eb595-8b3d-73b2-9c44-66a654f9695c`)
- Problem: the chat empty/loading state introduced for the empty feed should use the existing pixel loading animation, like the one shown within the right panel, instead of a separate skeleton/loading layout.
- Likely owner: renderer feed/chat empty-state rendering and shared loading animation component/styles.
- Expected outcome: empty/loading chat renders the same pixel animation pattern used elsewhere, theme-safe and without reintroducing the old guide text.
- Root cause: the right panel already used the shared pixel loader, but the chat Everything empty/loading state still used a separate skeleton-style layout.
- Fix: replaced the chat empty/loading layout with the shared `LoadingAnimation` pixel animation, removed the chat-specific skeleton rules, and kept the old guide text out.
- Verification: `pnpm --dir packages/renderer exec vitest run tests/shell/view-toggle.test.tsx` passed locally.

### Bug 12: File tree should load as soon as the session loads

- Reported: 2026-06-11 09:30 CEST
- Source: user follow-up on Files panel behavior.
- Status: Done
- Subagent: Pauli (`019eb597-1997-7983-9a9e-733f690a8fa8`)
- Problem: project files are fetched only when the user clicks or opens the Files tab, so the Files panel feels cold and delayed. The tree should begin loading as soon as the session/project is loaded.
- Likely owner: renderer app/session bootstrap or always-mounted preloader for files tree/favorites, plus existing RightFiles rendering state.
- Expected outcome: when a session/project becomes active, the renderer starts loading the file tree without waiting for the Files tab to mount; opening Files should use cached/in-flight state rather than initiating the first fetch.
- Root cause: `RightFiles.tsx` owned the initial file-tree fetch, so the request only started after the Files tab mounted.
- Fix: added a shared in-flight/cached `loadFilesTree` helper, mounted a `FilesTreePreloader` in app/session lifecycle, and updated `RightFiles` to reuse the same loader so opening Files during preload does not duplicate the initial fetch.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run tests/panels/right-files-preload.test.tsx` and `pnpm --filter @f-mark/renderer exec tsc -b --pretty false` passed locally.

### Bug 13: Files tab should auto-reload on file/folder changes and remove manual refresh

- Reported: 2026-06-11 09:31 CEST
- Source: user follow-up on Files panel refresh behavior.
- Status: Done
- Subagent: Herschel (`019eb598-48f0-7021-8549-f4bc04e35d7d`)
- Problem: the Files tab only reloads the tree when the user clicks the refresh button. File and folder changes can happen externally or from inside F-Mark, so the file tree becomes stale and manual refresh is the wrong interaction.
- Likely owner: kernel filesystem change watching or event publishing, renderer file tree cache invalidation/reload, and Files tab chrome.
- Expected outcome: file/folder creates, deletes, renames, and edits trigger automatic file tree reload/invalidation for the active project/session; the manual refresh button is removed from the Files tab; in-app file modifications also refresh the tree when they affect files/folders.
- Root cause: the Files tab cached `filesTreeByPath` and only forced a reload from the manual refresh button; no kernel-side file-change signal invalidated the renderer cache.
- Fix: added a debounced kernel file watcher that publishes `files.changed`, wired renderer websocket handling to force reload through the shared `loadFilesTree` helper, and removed the manual refresh button from the Files tab.
- Verification: `pnpm --filter f-mark test tests/services/filesWatcher.test.ts`, `pnpm --filter @f-mark/renderer exec vitest run tests/panels/files-auto-reload.test.tsx`, `pnpm --filter f-mark exec tsc --noEmit`, and `pnpm --filter @f-mark/renderer exec tsc --noEmit` passed locally.

### Bug 14: Agent wrapper stays active after the agent's turn ends

- Reported: 2026-06-11 09:33 CEST
- Source: user screenshot of the participant/agent wrapper after `AZROK'S TURN ENDED`.
- Status: Done
- Subagent: Anscombe (`019eb59a-67c6-7073-8b8c-5461feb422c3`)
- Problem: the feed shows the agent's turn has ended, but the agent wrapper/chip still appears active/running with the active indicator, making the UI state inconsistent.
- Likely owner: renderer participant strip/agent chip active-state derivation, managed-agent presence/turn-end event handling, and store aggregation.
- Expected outcome: when an agent turn ends, the corresponding agent wrapper/chip stops showing the active/running state promptly unless a new turn is actually active.
- Root cause: `Feed` derived `activeAgentIds` from agent presence alone, so online/stale/launching agents stayed visually active even after their own `turn-end` moved the aggregate turn back to the user.
- Fix: split runnable/present agents from currently active-turn agents and only pass active ids to `ParticipantStrip` when the effective turn is an agent turn.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run tests/shell.test.tsx -t "clears the agent active wrapper"` and `pnpm --filter @f-mark/renderer exec tsc --noEmit` passed locally.

### Bug 15: Clicking the user's avatar should open Settings on the Profile tab

- Reported: 2026-06-11 09:33 CEST
- Source: user follow-up on avatar/profile behavior.
- Status: Done
- Subagent: Avicenna (`019eb59a-84b2-7f90-b35b-064321e1f0a2`)
- Problem: clicking the current user's avatar does not open the Settings modal directly on the Profile tab.
- Likely owner: user avatar/participant strip click handling, settings modal routing, and active settings tab state.
- Expected outcome: clicking the user's avatar opens Settings with the Profile tab selected, while preserving existing avatar display behavior and other participant/agent interactions.
- Root cause: the current-user avatar rendered as a passive `ParticipantAvatar` span even though settings already supported `openSettings("profile")`.
- Fix: wrapped the current user's avatar in an accessible button that opens Settings on the Profile tab, with tokenized focus styling.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run tests/shell/topBar.test.tsx` and `pnpm --filter @f-mark/renderer exec tsc -b --pretty false` passed locally.

### Bug 16: Access request raw details are unreadable and approval actions are too weak

- Reported: 2026-06-11 09:42 CEST
- Source: user screenshot of an access/request card with raw details and approve/deny buttons.
- Status: Done
- Subagent: Carver (`019eb5a2-2035-7800-aafb-b8df38d9e71e`)
- Problem: access request cards still show low-contrast/non-readable dark-theme text in raw details, and the approve/deny icon-only controls are too subtle for a high-stakes permission decision.
- Likely owner: renderer access request card presentation, raw-details styling, action button copy/states, and related tests.
- Expected outcome: raw details are readable across dark themes, and approve/deny controls are prominent semantic actions with explicit wording such as Approve and Deny/Reject, proper colors, hover/focus/disabled states, and accessible labels.
- Root cause: access request cards reused shared raw-details rendering without defining the `--tool-card-*` color variables it reads, letting raw details inherit poor dark-theme colors, and open requests used quiet icon-only action buttons.
- Fix: gave access request cards readable raw-details theme-token fallbacks, changed default and provider-specific decisions into prominent worded buttons, and styled approve/deny states with semantic green/rose token hooks plus hover/focus/disabled states.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run src/cards/AccessRequestCard.test.tsx tests/cards/accessRequest.test.tsx src/cards/ToolUseCard.test.tsx`, `pnpm --filter @f-mark/renderer run test:static-colors`, and `pnpm --filter @f-mark/renderer exec tsc --noEmit` passed locally.

### Bug 17: Left pane shows a white void when it is not full height

- Reported: 2026-06-13 14:31 CEST
- Source: user screenshot of the Comments left pane header followed by a large white background when the pane is not full height.
- Status: Done
- Subagent: James (`019ec0f8-2ea1-7512-a3b1-9585f8319440`)
- Problem: the left-panel surface does not maintain the app/theme background through the full panel area when the pane height is shorter than the viewport, producing a stark white void below the dark header/content chrome.
- Likely owner: renderer shell/left-panel layout CSS, Comments panel content/empty-state surface, and shell tests or DOM style coverage.
- Expected outcome: left pane and its nested panels keep a dark theme-tokenized surface for their entire visible area at reduced heights and across routed left-panel tabs, without forcing the panel to overflow or cover unrelated app regions.
- Root cause: `.left-panel-host` owned the resized panel box but did not paint a themed surface, while the nested `.left-panel` could collapse to content height. Empty or loading Comments content left the rest of the host showing the default page background.
- Fix: made the left panel host stretch and paint `var(--panel)`, made the routed `.left-panel` fill the host with hidden overflow, and gave `.panel-list` a tokenized surface/min-height contract for empty/loading states.
- Verification: `pnpm --filter @f-mark/renderer exec vitest run tests/shell.test.tsx`, `pnpm --filter @f-mark/renderer run test:static-colors`, and `git diff --check -- packages/renderer/src/shell/shell.css packages/renderer/tests/shell.test.tsx` passed locally. `pnpm --filter @f-mark/renderer exec tsc --noEmit` is blocked by an existing unrelated `src/modals/settings/Appearance.tsx(27,7)` theme-map error.

## Subagent ledger

- Ptolemy (`019eb2b5-170d-7f62-abd1-6a50e4a3e638`): Bug 1, integration setup modal dark-theme contrast. Status: Done.
- Bohr (`019eb2b7-2088-7a73-8c56-c61e584fe969`): Bug 2, remove Gemini from offered runtime/provider options. Status: Done.
- Heisenberg (`019eb2b7-3673-7990-bc01-76a85d379ae8`): Bug 3, provider icons instead of initials. Status: Done.
- Boyle (`019eb2b7-634e-7590-926c-b600784867ca`): Bug 4, viewport-aware agent dropdown placement. Status: Done.
- Sagan (`019eb2ba-4dba-7323-a2cc-3b4305f957c2`): Bug 5, custom profile color preview. Status: Done.
- Kant (`019eb2ba-6a44-7271-b924-afbf7622fa4f`): Bug 6, profile image upload and avatar rendering. Status: Done.
- Volta (`019eb2bc-5a6c-75e1-a4f7-ba372c6e7a7b`): Bug 7, loading layout for empty chat/feed. Status: Done.
- Hypatia (`019eb590-81b0-7903-b0c4-87a117e4fe29`): Bug 8, dark-theme card/tool color tokens and literal-color guardrail. Status: Done.
- Lovelace (`019eb592-1f07-7c03-a3d8-c38b10b05eab`): Bug 9, toolbox/internal tool-card dark-theme palette revisit. Status: Done.
- Einstein (`019eb593-fd68-7cc3-8729-7c3743b586db`): Bug 10, file click crash from failed dynamic import chunk. Status: Done.
- Mencius (`019eb595-8b3d-73b2-9c44-66a654f9695c`): Bug 11, chat loading state should reuse pixel loading animation. Status: Done.
- Pauli (`019eb597-1997-7983-9a9e-733f690a8fa8`): Bug 12, preload file tree when session/project loads. Status: Done.
- Herschel (`019eb598-48f0-7021-8549-f4bc04e35d7d`): Bug 13, auto-reload files tree on filesystem changes and remove manual refresh. Status: Done.
- Anscombe (`019eb59a-67c6-7073-8b8c-5461feb422c3`): Bug 14, clear agent wrapper active state after turn end. Status: Done.
- Avicenna (`019eb59a-84b2-7f90-b35b-064321e1f0a2`): Bug 15, user avatar opens Settings Profile tab. Status: Done.
- Carver (`019eb5a2-2035-7800-aafb-b8df38d9e71e`): Bug 16, readable access request raw details and prominent approve/deny actions. Status: Done.
- James (`019ec0f8-2ea1-7512-a3b1-9585f8319440`): Bug 17, left pane keeps theme surface when not full height. Status: Done.
