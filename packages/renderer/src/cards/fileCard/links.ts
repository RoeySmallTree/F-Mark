import type { FileRefPayload } from "@f-mark/shared";
import type { RootScope } from "../../api/rootScope.js";
import {
  sessionAttachmentContentUrl,
  sessionRawUrl,
} from "../../render/htmlBundle.js";

interface FileHrefInput {
  sessionId: string | null;
  payload: FileRefPayload;
  token: string | null;
  scope: RootScope | null;
}

export function hrefFor({
  sessionId,
  payload,
  token,
  scope,
}: FileHrefInput): string {
  const url =
    payload.schema === "fmark.file.v1" || payload.path.startsWith("attachments/")
      ? sessionAttachmentContentUrl(sessionId, payload.id, token, scope)
      : sessionRawUrl(sessionId, payload.path, token, scope);
  return url.length > 0 ? url : "#";
}
