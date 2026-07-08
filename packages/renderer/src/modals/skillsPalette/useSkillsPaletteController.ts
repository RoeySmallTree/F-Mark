import { useCallback, useMemo, useState } from "react";
import type { SkillRef } from "@f-mark/shared";
import {
  resolveActiveAgent,
  writeStoredActiveAgent,
  type AgentKey,
} from "../skills/active-agent.js";
import {
  filterSkills,
  flattenSkills,
  groupByAgent,
  insertionFor,
} from "../skills/sources.js";
import { useSkillsLoader } from "./useSkillsLoader.js";
import { useSkillsPaletteBindings } from "./useSkillsPaletteBindings.js";
import type { SkillsPaletteController } from "./types.js";

export function useSkillsPaletteController(): SkillsPaletteController {
  const {
    closeModal,
    currentSessionId,
    openSkillEditor,
    participants,
    requestComposeInsertion,
    token,
  } = useSkillsPaletteBindings();
  const [activeAgent, setActiveAgent] = useState<AgentKey>(() =>
    resolveActiveAgent(participants, currentSessionId),
  );
  const [query, setQuery] = useState("");
  const { error, loading, skills } = useSkillsLoader({
    activeAgent,
    token,
  });

  const filtered = useMemo(
    () => filterSkills(skills, query.trim()),
    [skills, query],
  );
  const groups = useMemo(() => groupByAgent(filtered), [filtered]);
  const flatRows = useMemo(() => flattenSkills(groups), [groups]);

  const activate = useCallback(
    (skill: SkillRef): void => {
      requestComposeInsertion(insertionFor(skill));
      closeModal();
    },
    [closeModal, requestComposeInsertion],
  );

  const editSkill = useCallback(
    (skill: SkillRef): void => {
      openSkillEditor(skill);
    },
    [openSkillEditor],
  );

  const changeAgent = useCallback((agent: AgentKey): void => {
    setActiveAgent(agent);
    writeStoredActiveAgent(agent);
  }, []);

  return {
    activeAgent,
    error,
    flatRows,
    groups,
    loading,
    query,
    activate,
    changeAgent,
    editSkill,
    setQuery,
  };
}
