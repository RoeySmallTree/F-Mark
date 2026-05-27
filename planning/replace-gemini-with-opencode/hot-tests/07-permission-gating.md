# A6 — Permission Gating (🛑 BLOCKER) — PARTIAL, with cleaner workaround

**Verdict: PARTIAL FAIL of the original assumption (`permission.ask` plugin hook gates tools in headless mode).** A better mechanism exists; plan revised accordingly.

## What was tested
- Probe v2 (plugin sets `output.status = "allow"` in `permission.ask`)
- Probe v3 (plugin observes `event.type = permission.asked` and tries to POST `{response: "always"}` via `input.client`)
- Both invoked via `opencode run "use bash to echo …"` with `permission: { bash: "ask" }` in opencode.json

## What happened
1. The plugin's `permission.ask` hook **did NOT fire** in headless `opencode run`. No `permission.ask:in` log line in either probe run.
2. The bus event `permission.asked` (note past tense — different from the hook!) DID fire with full data: `{id, sessionID, permission, patterns, metadata, tool: {messageID, callID}}`.
3. Opencode auto-replied `reject` ~3ms after the ask, before any plugin code could call `client.postSessionIdPermissionsPermissionId`.
4. `tool.execute.before` fired for bash; `tool.execute.after` did NOT — confirming the rejection blocked the tool.

## The real control plane

Opencode exposes `POST /session/{sid}/permissions/{permissionID}` with body `{response: "once" | "always" | "reject"}` (SDK type `PostSessionIdPermissionsPermissionIdData`, sdk.gen.d.ts:381). The plugin already has access to this via `input.client.postSessionIdPermissionsPermissionId(...)`.

But in `opencode run` headless mode, opencode races to auto-reject before any plugin HTTP call can resolve — so the API alone is insufficient there.

## What works (revised architecture)

| Scenario | Mechanism | Notes |
|---|---|---|
| TUI mode (what F-Mark managed agents use) | `permission.ask` plugin hook OR SDK API | Likely both work; needs TUI-mode verification in Phase 7 E2E |
| `opencode run` headless | Observability via `event.permission.asked`/`permission.replied` | Cannot actively approve; auto-rejected before plugin can intervene |
| `opencode serve` (daemon) | SDK API to a known sessionID/permissionID | Full active control |

For F-Mark's primary use case (TUI in a tmux pane), the plugin `permission.ask` hook should fire and we can implement the v1 sync-block flow as planned.

## Plan impact

1. **Move the verification to Phase 7 E2E** — launch opencode in TUI mode (via tmux), trigger a permission, verify both:
   - Plugin `permission.ask` hook fires
   - Plugin can set `output.status = "allow"` and the tool then executes
2. **Stop relying on `opencode run` headless tests for permission flow** — they're misleading.
3. **Plugin template ADDITION**: also subscribe to bus `permission.asked` for observability. Posts an F-Mark `access-request` event regardless of mode. This gives a uniform UI experience even when active gating isn't possible.
4. **Backup path**: if Phase 7 E2E reveals `permission.ask` plugin hook also doesn't fire in TUI mode, fall back to `event.permission.asked` + `client.postSessionIdPermissionsPermissionId`. Race against opencode's auto-reject window — likely fails in headless, but TUI mode probably waits indefinitely for user input.

## Updated plugin pseudocode

```typescript
event: async ({ event }) => {
  if (event.type === "permission.asked") {
    // Observability: post access-request to F-Mark regardless of mode.
    // Active gating: rely on permission.ask hook below (TUI) or race to POST decision (server mode).
    const { id: permissionID, sessionID, permission, patterns, tool } = (event as any).properties;
    /* post access-request to F-Mark; spawn polling task */
  }
  /* ... other event handlers ... */
},
"permission.ask": async (i, o) => {
  // TUI mode: opencode waits here. We post access-request to F-Mark, poll for response, set output.status.
  /* same logic as access-response polling planned for v1 */
},
```

## Verdict for Phase 0 stop conditions

- Stop #5 (A6 permission gating) — DEFERRED to Phase 7 E2E for TUI-mode test. Plan proceeds with a dual-path strategy: bus-event observability + plugin-hook active gating.
- Stop #6 (A15 sync block in `permission.ask`) — still need to verify in TUI mode. If hook doesn't fire in TUI either, downgrade to observability-only with explicit "F-Mark cannot approve opencode permissions in this mode" UI label.
