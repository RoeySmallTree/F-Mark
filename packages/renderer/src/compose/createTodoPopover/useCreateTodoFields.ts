import { useEffect, useRef, useState } from "react";
import type { CreateTodoFields } from "./types.js";

export function useCreateTodoFields(): CreateTodoFields {
  const titleRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return {
    titleRef,
    descriptionRef,
    title,
    setTitle,
    description,
    setDescription,
    parentId,
    setParentId,
  };
}
