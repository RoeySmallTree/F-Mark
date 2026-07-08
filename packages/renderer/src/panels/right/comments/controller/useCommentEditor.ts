import { useCallback, useState } from "react";
import type { AnyEventRecord } from "@f-mark/shared";
import { contentOf } from "../commentModel.js";

export interface CommentEditor {
  cancelEdit(event: AnyEventRecord): void;
  clearEdit(filename: string): void;
  editing: Record<string, string>;
  setEditDraft(event: AnyEventRecord, value: string): void;
  startEdit(event: AnyEventRecord): void;
}

export function useCommentEditor(): CommentEditor {
  const [editing, setEditing] = useState<Record<string, string>>({});

  const startEdit = useCallback((event: AnyEventRecord): void => {
    setEditing((prev) => ({
      ...prev,
      [event.filename]: contentOf(event),
    }));
  }, []);

  const setEditDraft = useCallback(
    (event: AnyEventRecord, value: string): void => {
      setEditing((prev) => ({ ...prev, [event.filename]: value }));
    },
    [],
  );

  const clearEdit = useCallback((filename: string): void => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[filename];
      return next;
    });
  }, []);

  const cancelEdit = useCallback(
    (event: AnyEventRecord): void => {
      clearEdit(event.filename);
    },
    [clearEdit],
  );

  return {
    cancelEdit,
    clearEdit,
    editing,
    setEditDraft,
    startEdit,
  };
}
