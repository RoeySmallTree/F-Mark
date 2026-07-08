import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { ForkSessionResponse } from "../../api/client.js";
import { useStore } from "../../state/store.js";
import { submitForkSession } from "./actions.js";
import { defaultForkName, forkWarnings } from "./model.js";
import type {
  ForkSessionController,
  ForkSessionPopoverProps,
} from "./types.js";

type ControllerProps = Pick<
  ForkSessionPopoverProps,
  "target" | "onClose" | "onForked"
>;

export function useForkSessionController({
  target,
  onClose,
  onForked,
}: ControllerProps): ForkSessionController {
  const bridge = useForkSessionStoreBridge();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(() => defaultForkName(target));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForkSessionResponse | null>(null);

  useEffect(() => {
    setName(defaultForkName(target));
    setResult(null);
    setError(null);
    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [target.id]);

  const warnings = useMemo(() => forkWarnings(result), [result]);
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      void submitForkSession({
        ...bridge,
        target,
        name,
        inputRef,
        setBusy,
        setError,
        setResult,
        onClose,
        onForked,
      });
    },
    [bridge, target, name, onClose, onForked],
  );

  return {
    inputRef,
    name,
    setName,
    busy,
    error,
    result,
    warnings,
    canSubmit: !busy && result === null && name.trim().length > 0,
    onSubmit,
  };
}

function useForkSessionStoreBridge(): Pick<
  Parameters<typeof submitForkSession>[0],
  | "token"
  | "activePath"
  | "setCurrentSession"
  | "setSessions"
  | "setParticipants"
  | "setPathsState"
  | "setManagedAgents"
> {
  const token = useStore((s) => s.token);
  const activePath = useStore((s) => s.activePath);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setPathsState = useStore((s) => s.setPathsState);
  const setManagedAgents = useStore((s) => s.setManagedAgents);

  return useMemo(
    () => ({
      token,
      activePath,
      setCurrentSession,
      setSessions,
      setParticipants,
      setPathsState,
      setManagedAgents,
    }),
    [
      token,
      activePath,
      setCurrentSession,
      setSessions,
      setParticipants,
      setPathsState,
      setManagedAgents,
    ],
  );
}
