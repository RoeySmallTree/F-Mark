import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../api/client.js";
import { useStore } from "../../state/store.js";
import { canSaveSkill, shortSkillPath } from "./model.js";
import type { SkillEditorController } from "./types.js";

export function useSkillEditorController(): SkillEditorController {
  const editingSkill = useStore((state) => state.editingSkill);
  const closeModal = useStore((state) => state.closeModal);
  const token = useStore((state) => state.token);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(editingSkill?.name ?? "");
  const [description, setDescription] = useState(editingSkill?.description ?? "");
  const [args, setArgs] = useState(editingSkill?.args ?? "");
  const [body, setBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (editingSkill === null) {
      setLoading(false);
      setError("No skill selected.");
      return;
    }
    setLoading(true);
    setError(null);
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      try {
        const file = await client.getSkillFile(editingSkill.path);
        if (cancelled) return;
        setName(file.name);
        setDescription(file.description);
        setArgs(file.args ?? "");
        setBody(file.body);
        setLoading(false);
        queueMicrotask(() => nameRef.current?.focus());
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingSkill, token]);

  const canSave = canSaveSkill(name) && !loading && !saving;
  const pathLabel = useMemo(
    () => (editingSkill === null ? "" : shortSkillPath(editingSkill.path)),
    [editingSkill],
  );

  const save = useCallback((): void => {
    if (editingSkill === null || !canSave) return;
    setSaving(true);
    setError(null);
    const client = createClient({ baseUrl: "", token });
    void client
      .saveSkillFile({
        path: editingSkill.path,
        name,
        description,
        args,
        body,
      })
      .then(() => {
        closeModal();
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        setSaving(false);
      });
  }, [args, body, canSave, closeModal, description, editingSkill, name, token]);

  return {
    args,
    body,
    canSave,
    description,
    error,
    loading,
    name,
    nameRef,
    pathLabel,
    saving,
    close: closeModal,
    save,
    setArgs,
    setBody,
    setDescription,
    setName,
  };
}
