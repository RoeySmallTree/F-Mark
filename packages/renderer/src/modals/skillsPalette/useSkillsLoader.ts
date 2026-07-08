import { useEffect, useState } from "react";
import type { SkillRef } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import type { AgentKey } from "../skills/active-agent.js";

interface SkillsLoaderInput {
  activeAgent: AgentKey;
  reloadKey?: number;
  token: string | null;
}

interface SkillsLoaderState {
  error: string | null;
  loading: boolean;
  skills: SkillRef[];
}

export function useSkillsLoader(input: SkillsLoaderInput): SkillsLoaderState {
  const { activeAgent, reloadKey = 0, token } = input;
  const [state, setState] = useState<SkillsLoaderState>({
    error: null,
    loading: true,
    skills: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, error: null, loading: true }));
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      try {
        const res = await client.listSkills(activeAgent ?? undefined);
        if (!cancelled) {
          setState({ error: null, loading: false, skills: res.skills });
        }
      } catch (caught) {
        if (!cancelled) {
          setState({
            error: caught instanceof Error ? caught.message : String(caught),
            loading: false,
            skills: [],
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeAgent, reloadKey, token]);

  return state;
}
