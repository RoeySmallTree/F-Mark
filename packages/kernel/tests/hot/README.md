# F-Mark Hot-Test Harness

This directory is for manual or explicitly gated hot-test notes and helpers. Hot tests may invoke real CLIs, real tmux sessions, real local F-Mark projects, and temp vendor config directories. They must not run as normal unit tests unless guarded.

## Guardrail

Require `FMARK_HOT=1` before any hot test that can touch real runtime behavior:

```bash
if [ "${FMARK_HOT:-}" != "1" ]; then
  echo "Set FMARK_HOT=1 to run hot tests." >&2
  exit 1
fi
```

Do not write secrets into project config. Do not use the developer's normal `HOME`, `XDG_CONFIG_HOME`, or `CODEX_HOME` for vendor CLI config writes.

## Isolation Harness

Use this shell pattern for every Phase 0+ runtime hot test:

```bash
ROOT="$(mktemp -d /tmp/fmark-hot-project-XXXXXX)"
HOME_DIR="$(mktemp -d /tmp/fmark-hot-home-XXXXXX)"
XDG_DIR="$(mktemp -d /tmp/fmark-hot-xdg-XXXXXX)"

export HOME="$HOME_DIR"
export XDG_CONFIG_HOME="$XDG_DIR"
export CODEX_HOME="$HOME_DIR/.codex"
export FMARK_HOT=1

cleanup() {
  # Also kill any tmux sessions or long-running kernel processes created by the test.
  rm -rf "$ROOT" "$HOME_DIR" "$XDG_DIR"
}
trap cleanup EXIT INT TERM
```

Use `$ROOT` as the temp F-Mark project path. Use `$HOME_DIR`, `$XDG_CONFIG_HOME`, and `$CODEX_HOME` for all vendor runtime config probes.

## Session Smoke Shape

Expected session setup for hot tests:

1. Build or run the kernel from the local workspace.
2. Initialize a temp project at `$ROOT`.
3. Start the kernel with `--path "$ROOT"` and an explicit test port, or use the existing route injection harness when a long-lived server is unnecessary.
4. Create a session through `POST /sessions` with a unique slug such as `mcp-hot-baseline`.
5. Register or spawn a managed agent participant only when the phase explicitly needs agent runtime behavior.
6. Verify files under `$ROOT/.f-mark/sessions/<session-id>/`.
7. Close the kernel, close tmux sessions, and delete temp config homes.

For a creation-only smoke, the expected session folder state is:

```text
$ROOT/.f-mark/sessions/<session-id>/ exists
directory entries: []
```

If the test writes events, the folder may contain only the event files created by that test. Record the exact file names and payload expectations in `planning/mcp/research-smoke-tests.md` or the phase-specific research file.

## Documentation Requirements

Each hot-test record should include:

- Exact command.
- Temp project path and temp config paths.
- Expected filesystem state.
- Observed filesystem state.
- CLI output or HTTP response body.
- Pass/fail status.
- Cleanup result.
- Caveats, especially if a route injection check was used instead of a real listening server.
