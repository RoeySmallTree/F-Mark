# Real UI Verification Lane

This lane covers the chat/session risks from
`planning/chat-issues-mitigation-tasks.md` in an actual browser. It is meant
to complement the renderer Vitest suites and the kernel hot-test scripts.

## Automated Browser Smoke

Run:

```bash
pnpm test:real-ui
```

By default Playwright starts the renderer Vite dev server on port `4175` and
mocks the kernel REST boundary in the browser. This still exercises the real
React app, CSS, feed projection, card dispatch, popovers, and launch UI.

To point the same tests at an already running renderer:

```bash
FMARK_REAL_UI_BASE_URL=http://127.0.0.1:5173 pnpm test:real-ui
```

Current automated coverage:

- Tool-use card rendering and expansion with provider-shaped Bash input/result.
- Pending access request controls, including the actual approval POST body.
- Fork-session popover flow and focus switch to the forked session.
- Empty-session launcher readiness for Codex and Opencode, including the
  Opencode spawn request.

## Provider Hot Checks

These still require live local CLIs and should stay outside the default test
suite:

1. Start F-Mark with process spawning enabled:

   ```bash
   pnpm dev:no-auth:process-api -- --port 7777
   ```

2. In the browser, create or open a session.
3. Launch Codex and Opencode from the empty-session launcher or topbar plus
   menu. Confirm ready runtimes connect without opening setup when MCP/hooks
   are current.
4. Trigger a real Claude permission prompt for `Bash` and `Edit`.
5. Wait past the old request timeout window. The chat card must not become a
   misleading plain `expired` state while the provider is still waiting.
6. Approve and deny once from F-Mark. Confirm the provider terminal resumes and
   the chat card records the chosen decision.
7. Run a long Bash command from a provider. Confirm live/current tool rendering
   behavior manually until tool lifecycle events are automated.
8. Comment on wrapped prose, inline code, a list item, and a code block. Confirm
   the target preview, right-panel quote, feed highlight, and wake context point
   at the same slice.

Record failures with the exact command, browser URL, provider/runtime, session
id, and whether the run used mocked Playwright, local dev server, or live CLI
providers.
