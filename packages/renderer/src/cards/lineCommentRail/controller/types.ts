import type { ProseMention } from "@f-mark/shared";

export interface UseLineCommentControllerOptions {
  content: string;
  mode: unknown;
  lineHeight: number;
  defaultMentions: ProseMention[];
}
