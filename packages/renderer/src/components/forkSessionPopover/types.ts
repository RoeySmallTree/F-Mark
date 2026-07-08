import type { FormEvent, RefObject } from "react";
import type { ForkSessionResponse, SessionMeta } from "../../api/client.js";

export interface ForkSessionPopoverProps {
  anchorRect: DOMRect | null;
  target: SessionMeta;
  onClose(): void;
  onForked?(response: ForkSessionResponse): void;
}

export interface ForkSessionController {
  inputRef: RefObject<HTMLInputElement>;
  name: string;
  setName(value: string): void;
  busy: boolean;
  error: string | null;
  result: ForkSessionResponse | null;
  warnings: string[];
  canSubmit: boolean;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}
