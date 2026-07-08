import type { StageFiles } from "./types.js";

export function stageFilesInBackground(
  stageFiles: StageFiles,
  files: File[],
): void {
  void stageFiles(files).catch(reportAttachmentUploadFailure);
}

function reportAttachmentUploadFailure(err: unknown): void {
  console.error("Attachment upload failed", err);
}
