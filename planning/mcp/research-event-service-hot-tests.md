# Phase 3 Event Service Hot Tests

Date: 2026-05-25
Repository: `/home/roey/workspace/F-Mark`
Scope: current working tree baseline only. No production code was edited.

## Setup

The repository already had Phase 1/2 work in the working tree, including modified route files and new service/shared-contract files. I treated the current working tree as the baseline under test and isolated the live kernel state in temp directories.

Commands used:

```sh
mktemp -d /tmp/fmark-event-hot-project-XXXXXX
mktemp -d /tmp/fmark-event-hot-xdg-XXXXXX

XDG_CONFIG_HOME=/tmp/fmark-event-hot-xdg-S52lwa \
  pnpm --filter f-mark dev -- \
  --no-auth \
  --path /tmp/fmark-event-hot-project-tNdht8 \
  --port 18777
```

The server started at `http://localhost:18777`.

`GET /health` returned:

```json
{
  "status": "ok",
  "version": "0.0.1",
  "processApiEnabled": false
}
```

Client driver:

```sh
cd packages/kernel
node --input-type=module
```

The Node driver used built-in `fetch` for REST and the kernel package's installed `ws` package for `ws://127.0.0.1:18777/ws`. It created/used:

- Project root: `/tmp/fmark-event-hot-project-tNdht8`
- Agent participant: `ag-hot3`
- Clean session: `2026-05-25-event-service-hot-test-clean`
- Session dir: `/tmp/fmark-event-hot-project-tNdht8/.f-mark/sessions/2026-05-25-event-service-hot-test-clean`

## Primary Clean Run

Posted these REST events sequentially after opening the websocket:

| Kind | Endpoint | Filename |
| --- | --- | --- |
| prose | `POST /sessions/:id/events/prose` | `20260525T133218.251Z_ag-hot3.prose.md` |
| todo | `POST /sessions/:id/events/todo` | `20260525T133218.335Z_ag-hot3.todo.json` |
| flow | `POST /sessions/:id/events/flow` | `20260525T133218.419Z_ag-hot3.flow.json` |
| html | `POST /sessions/:id/events/html` | `20260525T133218.504Z_ag-hot3.html` |
| tool-use | `POST /sessions/:id/events/tool-use` | `20260525T133218.589Z_ag-hot3.tool-use.json` |
| turn-end | `POST /sessions/:id/events/turn-end` | `20260525T133218.674Z_ag-hot3.turn-end.json` |
| file | `POST /sessions/:id/events/file` | `20260525T133218.760Z_ag-hot3.file.json` |

Each REST response returned `filename`, `timestamp`, `participant_id`, and `kind`.

The websocket received exactly one `event_added` per posted event. Example:

```json
{
  "type": "event_added",
  "session_id": "2026-05-25-event-service-hot-test-clean",
  "filename": "20260525T133218.251Z_ag-hot3.prose.md",
  "kind": "prose",
  "participant_id": "ag-hot3",
  "pathId": "427efd470f57",
  "revision": 2
}
```

Duplicate count by filename was `1` for all seven files.

## Disk And Payload Observations

- Prose wrote a Markdown file with frontmatter:

  ```md
  ---
  name: Hot Test Anchor
  ---
  Phase 3 hot-test prose body

  Second paragraph.
  ```

- `GET /sessions/:id/events` parsed the prose payload as:

  ```json
  {
    "content": "Phase 3 hot-test prose body\n\nSecond paragraph.\n",
    "name": "Hot Test Anchor"
  }
  ```

  Note the trailing newline in parsed prose content.

- Todo wrote exactly:

  ```json
  {
    "id": "todo-hot-1",
    "title": "Validate shared event service extraction",
    "status": "open",
    "body": "REST baseline writes a todo event.",
    "assigned_to": "ag-hot3"
  }
  ```

- Flow accepted a two-node graph with a valid edge and preserved node position, `itemType`, `focused`, edge `style`, and edge `type`.

- HTML wrote a directory, not a JSON file:

  ```text
  20260525T133218.504Z_ag-hot3.html/
    index.html
    manifest.json
    script.js
    style.css
  ```

  `manifest.json` was:

  ```json
  {
    "id": "20260525T133218.504Z_ag-hot3",
    "title": "Hot Test Widget",
    "dependencies": ["https://example.test/fake-lib.js"]
  }
  ```

- Tool-use wrote `tool_name`, `tool_use_id`, `input`, `result`, `success`, and `duration_ms` as JSON.

- Turn-end wrote only:

  ```json
  {
    "participant_id": "ag-hot3"
  }
  ```

- File event wrote metadata only:

  ```json
  {
    "id": "file-hot-1",
    "path": "attachments/manual-hot/file.txt",
    "mime_type": "text/plain",
    "description": "Metadata-only file event created by hot test"
  }
  ```

  The referenced `attachments/manual-hot/file.txt` did not exist on disk. This route records a file reference; it does not upload or validate file content. Binary/content upload is a separate `POST /sessions/:id/attachments` route.

## Edge Probes

These probes were run against a separate exploratory session after the first full post run.

Invalid flow edge:

```sh
curl -sS -X POST \
  http://127.0.0.1:18777/sessions/2026-05-25-event-service-hot-test-2/events/flow \
  -H 'content-type: application/json' \
  --data '{"participant_id":"ag-hot3","id":"bad-flow","nodes":[{"id":"only","label":"Only"}],"edges":[{"id":"bad","source":"only","target":"missing"}]}'
```

Returned `400`:

```json
{"error":"edge bad references missing node: missing"}
```

Mixed legacy prose `target` with new `append_to`:

```json
{"error":"request body must not contain both legacy `target` and new `append_to`/`mode`/`lines`"}
```

Invalid non-prose `append_to`:

```json
{"error":"`append_to` does not match event-filename pattern"}
```

String `"true"` for prose `arbitrary`:

```json
{
  "statusCode": 400,
  "code": "FST_ERR_VALIDATION",
  "error": "Bad Request",
  "message": "body/arbitrary must be equal to one of the allowed values"
}
```

Unknown participant on HTML:

```json
{"error":"unknown participant: ag-missing"}
```

Extra JSON fields are not rejected in the observed baseline for at least `turn-end`, `file`, and `tool-use`. They are ignored/stripped before persistence. Examples with `"extra":"..."` returned `200`; persisted payloads omitted the extra field.

## Special Setup By Route

- Every event route requires an existing session and known participant. I used `POST /sessions` and `POST /participants/register`.
- The CLI server in multi-path mode envelopes websocket event messages with `pathId` and `revision`.
- Prose accepts the legacy `target` shape only when new composable fields are absent. It normalizes legacy `target` to `append_to + mode: "comment" + lines`.
- Prose `arbitrary` is strict boolean; string/coerced values reject.
- Non-prose `append_to` must match the event filename pattern.
- Flow validates graph integrity: every edge source/target must exist in `nodes`.
- HTML requires a known participant and allocates a session child directory named like an event filename with kind `html`. It writes `manifest.json`, `index.html`, optional `style.css`, and optional `script.js`.
- File metadata route does not require the referenced file to exist. Use `POST /sessions/:id/attachments` for actual uploaded content.

## Discrepancies / Risks For Extraction

- Parsed prose content includes a trailing newline after round-trip through disk. Preserve this or intentionally normalize it with tests.
- Unknown JSON properties appear to be stripped/ignored rather than rejected, even where schemas say `additionalProperties: false`. If Phase 3 centralizes validation, decide whether this permissive behavior is contract or bug before changing it.
- `turn-end` schema does not set `additionalProperties: false`, and the handler persists only `participant_id`. The current observable contract is permissive.
- File metadata event does not imply attachment existence. A shared service named too generically could accidentally blur metadata-write and upload-write semantics.
- HTML is structurally different from the other event kinds because the "event" is a directory bundle. Shared writer abstractions must not assume every event is one file.

## Recommended Phase 3 Gates

- Service parity tests for REST and MCP covering `prose`, `todo`, `flow`, `html`, `tool-use`, `turn-end`, and `file`, asserting response shape, filename pattern, disk shape, and parsed `GET /events` payload.
- Websocket contract test asserting exactly one `event_added` per write, with `session_id`, `filename`, `kind`, `participant_id`, and path envelope in CLI/multi-path mode.
- Supersession test for routes that accept `supersedes`, asserting both persisted payload and `event_superseded` websocket publish.
- HTML bundle test asserting directory allocation, manifest id, index/css/js writes, path confinement, and participant validation.
- Flow validation test for missing edge endpoints and duplicate node ids.
- Prose tests for strict `arbitrary`, legacy `target` normalization, mixed legacy/new rejection, and trailing-newline round-trip behavior.
- Non-prose `append_to` validation tests for valid event filename, invalid filename, and optional unset case.
- File tests that keep metadata route separate from multipart attachment upload behavior.
- Unknown-property behavior test. Either lock current stripping/ignore behavior or intentionally change it with explicit migration notes for REST clients and MCP callers.
- Rapid sequential write test asserting millisecond filenames preserve observable order for mixed event kinds.
