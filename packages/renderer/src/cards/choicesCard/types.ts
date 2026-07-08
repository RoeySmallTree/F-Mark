import type {
  AnyEventRecord,
  ChoicesPayload,
  Participant,
} from "@f-mark/shared";
import type { WhoInfo } from "../format.js";

export type ChoicesVariant = "standalone" | "embedded";
export type ChoiceOption = ChoicesPayload["options"][number];

export interface ChoicesCardModel {
  event: AnyEventRecord;
  payload: ChoicesPayload;
  who: WhoInfo;
  sessionId: string | null;
  selectedIds: string[];
  latest: AnyEventRecord | undefined;
  hasHtml: boolean;
  isEmbedded: boolean;
  pick(optionId: string): Promise<void>;
  openPreview(filename: string, title: string): void;
  formatTimestamp(timestamp: string): string;
}

export interface ChoicesModelInput {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
  variant: ChoicesVariant;
}
