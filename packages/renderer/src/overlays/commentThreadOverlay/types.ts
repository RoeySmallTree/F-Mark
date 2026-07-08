import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";

export interface CommentThreadOverlayProps {
  targetFile: string;
  comments: AnyEventRecord[];
}

export type CommentLineRange = [number, number];

export type CommentPayload = ProsePayload & {
  in_reply_to?: string;
  supersedes?: string;
};

export type ParticipantMap = Record<string, Participant>;

export interface CommentThreadRow {
  root: AnyEventRecord;
  resolved: boolean;
}

export interface CommentThreadModel {
  target: AnyEventRecord | undefined;
  targetTitle: string;
  lines: CommentLineRange | undefined;
  quotedLines: string | null;
  allTargetComments: AnyEventRecord[];
  threads: CommentThreadRow[];
}

export interface CommentThreadActions {
  postReply: (root: AnyEventRecord, content: string) => Promise<void>;
  postResolve: (root: AnyEventRecord) => Promise<void>;
  postUnresolve: (root: AnyEventRecord) => Promise<void>;
}

export interface CommentThreadOverlayController
  extends CommentThreadModel,
    CommentThreadActions {
  participants: ParticipantMap;
  onClose: () => void;
}
