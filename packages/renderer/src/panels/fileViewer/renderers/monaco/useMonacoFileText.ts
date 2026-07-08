import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../../../api/client.js";
import { useStore } from "../../../../state/store.js";
import { useScopedFile } from "../../fileScope.js";

const MONACO_TEXT_MAX_BYTES = 8 * 1024 * 1024;
const AUTOSAVE_DEBOUNCE_MS = 600;

export interface UseMonacoFileTextOptions {
  autosave?: boolean;
}

export interface MonacoFileTextState {
  text: string | null;
  error: string | null;
  truncated: boolean;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  savedAt: number | null;
  setText(value: string): void;
  save(): Promise<void>;
}

export function useMonacoFileText(
  path: string,
  options: UseMonacoFileTextOptions = {},
): MonacoFileTextState {
  const autosave = options.autosave ?? false;
  const [text, setText] = useState<string | null>(null);
  const [savedText, setSavedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const scoped = useScopedFile(path);
  const token = useStore((s) => s.token);
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setSavedText(null);
    setError(null);
    setTruncated(false);
    setSaveError(null);
    setSavedAt(null);
    if (scoped === null) {
      setError("file is outside the project root");
      return;
    }
    client
      .fetchFileText(scoped.scope, scoped.relPath, MONACO_TEXT_MAX_BYTES)
      .then((res) => {
        if (cancelled) return;
        setText(res.content);
        setSavedText(res.content);
        setTruncated(res.truncated);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, client, scoped?.relPath, JSON.stringify(scoped?.scope ?? null)]);

  const save = useCallback(async (): Promise<void> => {
    if (scoped === null || text === null || text === savedText) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await client.saveFileText(scoped.scope, scoped.relPath, text);
      setText(res.content);
      setSavedText(res.content);
      setTruncated(res.truncated);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [client, savedText, scoped, text]);

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (
      !autosave ||
      scoped === null ||
      text === null ||
      savedText === null ||
      text === savedText ||
      truncated ||
      saving
    ) {
      return;
    }
    const timer = setTimeout(() => {
      void saveRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [autosave, path, savedText, saving, scoped, text, truncated]);

  return {
    text,
    error,
    truncated,
    dirty: text !== null && savedText !== null && text !== savedText,
    saving,
    saveError,
    savedAt,
    setText,
    save,
  };
}
