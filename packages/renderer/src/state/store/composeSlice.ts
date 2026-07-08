import type { State } from "../storeTypes.js";
import type { StoreSet } from "./sliceTypes.js";

const NO_LOOSE_STRING_VALUES = {
  message: "message",
} as const;

type ComposeSlice = Pick<
  State,
  | "composeMode"
  | "commentTarget"
  | "pendingFileReveal"
  | "focusedCommentId"
  | "composeDraft"
  | "composeInsertion"
  | "setComposeMode"
  | "setCommentTarget"
  | "requestFileReveal"
  | "clearFileReveal"
  | "setFocusedCommentId"
  | "setComposeDraft"
  | "requestComposeInsertion"
  | "clearComposeInsertion"
>;

export function createComposeSlice(set: StoreSet): ComposeSlice {
  return {
    composeMode: NO_LOOSE_STRING_VALUES.message,
    commentTarget: null,
    pendingFileReveal: null,
    focusedCommentId: null,
    composeDraft: null,
    composeInsertion: null,
    setComposeMode: (composeMode) => set({ composeMode }),
    setCommentTarget: (commentTarget) => set({ commentTarget }),
    requestFileReveal: (absPath, line, opts) =>
      set((s) => ({
        pendingFileReveal: {
          absPath,
          line,
          nonce: (s.pendingFileReveal?.nonce ?? 0) + 1,
          ...(opts?.lineContext !== undefined
            ? { lineContext: opts.lineContext }
            : {}),
          ...(opts?.lines !== undefined ? { lines: opts.lines } : {}),
        },
      })),
    clearFileReveal: () => set({ pendingFileReveal: null }),
    setFocusedCommentId: (focusedCommentId) => set({ focusedCommentId }),
    setComposeDraft: (composeDraft) => set({ composeDraft }),
    requestComposeInsertion: (text) =>
      set((s) => ({
        composeInsertion: {
          text,
          nonce: (s.composeInsertion?.nonce ?? 0) + 1,
        },
      })),
    clearComposeInsertion: () => set({ composeInsertion: null }),
  };
}
