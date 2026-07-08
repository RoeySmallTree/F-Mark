import type { KeyboardEvent, RefObject } from "react";
import type {
  AnyEventRecord,
  Participant,
  ProseMention,
} from "@f-mark/shared";
import type { PostProseBody } from "../../../../api/client.js";
import type { whoOf } from "../../../../cards/format.js";
import type { CommentGroup } from "../commentModel.js";

export type CommentPostBody = Omit<
  PostProseBody,
  "participant_id" | "append_to" | "mode" | "lines"
>;

export interface MentionTarget {
  rootFilename: string;
  rect: DOMRect;
}

export interface CommentThreadActions {
  onFocus(group: CommentGroup): void;
  onClose(): void;
  onReplyInputRef(root: AnyEventRecord, node: HTMLInputElement | null): void;
  onReplyDraft(root: AnyEventRecord, value: string): void;
  onReplyKey(
    e: KeyboardEvent<HTMLInputElement>,
    group: CommentGroup,
    root: AnyEventRecord,
  ): void;
  onOpenMentions(root: AnyEventRecord, rect: DOMRect): void;
  onSubmitReply(group: CommentGroup, root: AnyEventRecord): Promise<void>;
  onEmoji(group: CommentGroup, root: AnyEventRecord, emoji: string): Promise<void>;
  onStartEdit(event: AnyEventRecord): void;
  onEditDraft(event: AnyEventRecord, value: string): void;
  onCancelEdit(event: AnyEventRecord): void;
  onSaveEdit(group: CommentGroup, event: AnyEventRecord): Promise<void>;
  onRemove(group: CommentGroup, event: AnyEventRecord): Promise<void>;
  onResolve(group: CommentGroup, event: AnyEventRecord): Promise<void>;
  onUnresolve(group: CommentGroup, event: AnyEventRecord): Promise<void>;
}

export interface RightCommentsController {
  panelRef: RefObject<HTMLDivElement>;
  groups: CommentGroup[];
  activeKey: string | null;
  participants: Record<string, Participant>;
  currentWho: ReturnType<typeof whoOf>;
  replyDrafts: Record<string, string>;
  replyMentions: Record<string, ProseMention[]>;
  mentionTarget: MentionTarget | null;
  editing: Record<string, string>;
  busyKey: string | null;
  currentSessionId: string | null;
  token: string | null;
  actions: CommentThreadActions;
  addReplyMention(rootFilename: string, mention: ProseMention): void;
  closeReplyMentions(): void;
}
