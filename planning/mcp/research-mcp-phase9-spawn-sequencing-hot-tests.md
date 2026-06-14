# MCP Phase 9 Spawn Sequencing Hot Tests

Date: 2026-05-25
Workspace: `/home/roey/workspace/F-Mark`
Scope: Phase 9 setup-first spawn response, MCP-first prompt injection, runtime-session desired naming, and vendor launch argv behavior.

## Result Summary

| Check | Status | Observed |
| --- | --- | --- |
| Benign runtime prompt injection | PASS | Real tmux session ran `/usr/bin/tee`; captured a 2633-byte MCP-first guide plus launch packet |
| Claude real vendor launch argv | PASS | Real tmux session launched `claude --name <fmark-session-id>` |
| Codex real vendor launch argv | PASS | Real tmux session launched Codex without faking a native `--name` |
| Gemini real vendor launch argv | PASS | Real tmux session launched Gemini without faking a native `--name` |

Hot report:

```text
/tmp/fmark-mcp-phase9-hot-D1q8ZT/report.json
```

Run command:

```bash
FMARK_HOT=1 node packages/kernel/tests/hot/phase9-spawn-sequencing-hot.mjs
```

Output:

```text
HOT_TEST_REPORT /tmp/fmark-mcp-phase9-hot-D1q8ZT/report.json
{
  "run": "phase9-mplq621l",
  "artifactRoot": "/tmp/fmark-mcp-phase9-hot-D1q8ZT",
  "passes": 4
}
```

## What Was Verified

- A real F-Mark session was created before each spawn.
- Spawn responses included setup status and `runtime_session.desired_name`.
- The launch prompt included `fmark_post_prose`, `fmark_end_turn`, the participant id, the F-Mark session id, and a bounded launch packet.
- The launch prompt did not include curl instructions, raw `POST /sessions` guidance, or `.f-mark/AGENT.md` fallback language.
- `/managed-agents` surfaced the stored runtime-session desired name.
- Claude received the F-Mark session id via native `--name`.
- Codex and Gemini stored the desired name but did not receive the session id in process argv.
- The runner killed all spawned tmux sessions; no Phase 9 processes remained after the run.

## Issue Found

The first hot-run harness tried to read `runtime-session.json` from the legacy project `.f-mark/agents` directory. In the current multi-path state layout, managed runtime-session state is exposed from the global project bucket and through `/managed-agents`. The product behavior was correct; the harness now verifies via the live API.

Failed harness report:

```text
/tmp/fmark-mcp-phase9-hot-rjCALZ/report.failed.json
```

## Gate Decision

Phase 9 is complete:

- Spawn now performs a best-effort setup preflight and returns `mcp_status` / `hooks_status`.
- Spawn injects the MCP-first guide plus launch packet instead of the old REST/static guide pointer.
- Runtime-session desired names are stored and surfaced.
- Claude uses native session naming; Codex and Gemini do not receive fake native naming flags.

Phase 10 can build the integration setup UI on top of preflight/apply/spawn.
