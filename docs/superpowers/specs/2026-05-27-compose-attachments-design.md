# Compose Attachments — Stage-then-Send

**Status:** Draft · approved 2026-05-27

## Problem

Today, pasting an image into the compose textarea immediately POSTs to `/sessions/:id/attachments`, which creates a standalone `file` event. The file appears in the feed *before* the user has typed anything — there is no preview, no way to abort, no relation to a prose message. Drag-and-drop is unsupported. There is no manual "attach a file" affordance.

## Goals

1. Pasted/dropped/picked files appear as **preview chips** in the compose bar. Hitting Send (or End turn) commits them; X removes them.
2. Dragging files over the compose region shows a "Drop to attach" overlay; dropping uploads.
3. New paperclip button in the compose action row opens a file picker.
4. When the user sends a message *with* attachments, the file events are linked to the prose via `append_to`. Attachments-only sends produce standalone file events (unchanged shape).

## Non-goals

- Inline editing (resize, crop, annotate) of attachments.
- Orphan-file cleanup (files uploaded but never sent). Punted to a follow-up.
- Reordering chips.
- Drag-attachments-out (download).

## Design

### Backend

| Endpoint | Before | After |
|---|---|---|
| `POST /sessions/:id/attachments` | Uploads file, writes `file` event, returns event record | **Uploads only.** Returns `{ id, display_name, path, mime_type, size_bytes, preview_kind }`. No event written. |
| `POST /sessions/:id/events/file` | Writes `file` event with metadata + optional `append_to` | Unchanged. Renderer uses this on Send. |
| `DELETE /sessions/:id/attachments/:file_id` | — | **New.** Removes the staged file from disk. Returns 404 if the file_id is already referenced by a `file` event (to prevent breaking already-committed events). |

`UploadAttachmentResponse` shape changes: was the full event record (with `filename`, `kind`, `participant_id`, `timestamp`, `payload`); becomes just the staged-attachment metadata (the `payload` subset). Renderer's `UploadAttachmentResponse` type updates correspondingly in `@f-mark/shared`.

### Compose state

```ts
type StagedAttachment = {
  id: string;              // att_xxxx from upload response
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  path: string;            // relative path: attachments/<id>/<filename>
  previewKind: FilePreviewKind;
  uploading: boolean;      // true while POST /attachments is in flight
  error?: string;          // upload or delete error, surfaced on the chip
};

// Local component state in Compose.tsx:
const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
```

Cleared on successful Send and on `currentSessionId` change.

### UI

```
compose-inner
├── NameChip          (existing, conditional)
├── compose-attachments     ← NEW: chip row, hidden when empty
│   ├── chip (thumb | icon · name · size · ×)
│   └── chip (...)
├── compose-box
│   ├── textarea            (existing, with new onDragEnter/Over/Leave/Drop)
│   └── compose-actions
│       ├── row 1 — primary action
│       └── row 2 — augment launchers
│           Mention · Presets · Skills · Task · Paperclip · Fork · Settings
└── drag-overlay       ← NEW: shown when .dragging, dashed border + "📎 Drop to attach"
```

- **Chip thumbnails**: for `image/*` use `<img src="/sessions/:id/attachments/:file_id/content">`. Other MIME types use a lucide file icon keyed by `previewKind` (e.g., `FileText`, `File`, `Image` for non-image image-like, etc.).
- **Drag overlay**: tracking `dragenter` counter on the `compose-inner` element so nested `dragleave`s don't flicker the state. CSS uses `pointer-events: none` on inner elements so only the outer container receives the drop.
- **Attach button**: lucide `Paperclip` icon, slotted in row 2 between `Task` and `Fork`. Click triggers a hidden `<input type="file" multiple>` (created once, ref'd, `accept` left unrestricted).
- **Drag overlay does not fire on text drags** — we only show it when `dataTransfer.types` includes `"Files"`.

### Send flow

```ts
async function submit() {
  if (attachments.length === 0) {
    // unchanged: post prose (or end-turn-only)
    return;
  }

  let appendTo: string | undefined = undefined;
  if (proseHasContent) {
    const { filename } = await client.postProse(...);
    appendTo = filename;
  }

  for (const att of attachments) {
    await client.postFile(sessionId, {
      participant_id: userId,
      id: att.id,
      path: att.path,
      mime_type: att.mimeType,
      display_name: att.displayName,
      size_bytes: att.sizeBytes,
      preview_kind: att.previewKind,
      ...(appendTo ? { append_to: appendTo } : {}),
    });
  }

  setAttachments([]);
}
```

(Existing `client.postFile` already accepts the metadata; needs to be checked for `size_bytes`/`display_name`/`preview_kind` propagation — these fields exist on the `file` event payload schema today.)

### Error handling

- **Upload fails** (network, validation): chip stays with `error` set; X removes from state. Other chips & Send unaffected.
- **Send mid-flight fails** (prose succeeds, one `file` event fails): prose already in feed. Surface error to console + leave failed chips with error state so user can retry. F-Mark is append-only — no rollback.
- **DELETE fails** (file already referenced): renderer treats 404 as "already committed, can't remove from disk" but still drops the chip locally. Treat 5xx as recoverable error on the chip.

### Tests

| Layer | Test |
|---|---|
| Kernel | `POST /attachments` returns metadata, does **not** write an event. Existing event-creation tests for `/events/file` unchanged. |
| Kernel | New `DELETE /attachments/:file_id` — removes file when not referenced; 404 when referenced. |
| Renderer | Paste a file → chip appears (no fetch to `/events/*`). |
| Renderer | Drag-and-drop a file → overlay shows, drop adds chip. |
| Renderer | Click paperclip → file input opens; selecting files adds chips. |
| Renderer | X on chip calls DELETE and removes from state. |
| Renderer | Send with prose + 2 attachments → prose POST → 2 file POSTs with `append_to`. |
| Renderer | Send with attachments only → 2 file POSTs, no `append_to`. |
| Renderer | Update existing 2 paste tests in `compose.test.tsx` to assert chip-then-send flow. |

## Risks

- **The current `POST /attachments` response is consumed in `cards/FileCard.tsx` (or wherever a file event is rendered)** — but those consumers read from the *event stream*, not from this POST's response, so shape change is contained to the renderer's `uploadAttachment` callers (only Compose). Worth verifying during impl.
- **Orphan files** accumulate in `<session>/attachments/<id>/` if a user uploads but never sends or deletes. Acceptable for v1.
- **Multi-file paste/drop** — the loop in `uploadClipboardFiles` already iterates; semantics carry over.
