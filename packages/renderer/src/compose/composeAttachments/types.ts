import type { Dispatch, SetStateAction } from "react";
import type { StagedAttachment } from "../AttachmentChip.js";

export type AttachmentSetter = Dispatch<SetStateAction<StagedAttachment[]>>;

export type StageFiles = (files: File[]) => Promise<void>;
