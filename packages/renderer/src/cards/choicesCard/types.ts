import type {
  AnyEventRecord,
  ChoiceCustomOption,
  ChoicesOption,
  ChoicesPayload,
  Participant,
} from "@f-mark/shared";
import type { WhoInfo } from "../format.js";

export type ChoicesVariant = "standalone" | "embedded";
export type ChoiceOption = ChoicesPayload["options"][number];
export type ChoiceCommentTarget = Pick<ChoicesOption | ChoiceCustomOption, "id" | "label">;

export interface ChoiceOptionComment {
  filename: string;
  author: string;
  timestamp: string;
  body: string;
}

export interface ChoicesCardModel {
  event: AnyEventRecord;
  payload: ChoicesPayload;
  who: WhoInfo;
  sessionId: string | null;
  selectedIds: string[];
  customOptions: ChoiceCustomOption[];
  latest: AnyEventRecord | undefined;
  hasHtml: boolean;
  isEmbedded: boolean;
  pick(optionId: string): Promise<void>;
  pickCustom(label: string): Promise<void>;
  commentOnOption(option: ChoiceCommentTarget, text: string): Promise<void>;
  commentsForOption(option: ChoiceCommentTarget): ChoiceOptionComment[];
  openPreview(filename: string, title: string): void;
  formatTimestamp(timestamp: string): string;
}

export interface ChoicesModelInput {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents: AnyEventRecord[];
  variant: ChoicesVariant;
}
