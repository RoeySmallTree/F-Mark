import type { ProseMention } from "@f-mark/shared";
import { createClient, type RootScope } from "../api/client.js";
import { createManagedAgentsClient } from "../api/managedAgents.js";
import { scopeToBody } from "../api/rootScope.js";
import type { StagedAttachment } from "./AttachmentChip.js";
import type { ComposeMode } from "./composeHelpers.js";

const NO_LOOSE_STRING_VALUES = {
  userMessage: "user-message",
  named: "named",
  message: "message",
  mention: "mention",
} as const;

export interface ComposeSubmissionSnapshot {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  scope: RootScope | null;
  mode: ComposeMode;
  content: string;
  name: string;
  mentions: ProseMention[];
  attachments: StagedAttachment[];
  messageEndsTurn: boolean;
  hasContent: boolean;
  canSubmit: boolean;
}

export interface ComposeSubmitResult {
  sentAttachmentIds: Set<string>;
}

export class ComposeSubmissionController {
  constructor(private readonly snapshot: ComposeSubmissionSnapshot) {}

  async submit(options: { wake?: boolean } = {}): Promise<ComposeSubmitResult | null> {
    const ready = this.readyForSubmit();
    if (ready === null) return null;
    const { sessionId, userId, scope } = ready;
    const client = createClient({ baseUrl: "", token: this.snapshot.token });
    const proseFilename = await this.postProseIfNeeded(client, sessionId, userId, scope);
    const sendable = await this.postSendableAttachments(
      client,
      sessionId,
      userId,
      scope,
      proseFilename,
    );
    if (options.wake !== false) await this.wakeIfNeeded(sessionId, scope);

    return {
      sentAttachmentIds: new Set(sendable.map((attachment) => attachment.id)),
    };
  }

  async endTurn(): Promise<boolean> {
    const s = this.snapshot;
    if (s.sessionId === null || s.userId === null) return false;
    if (s.scope === null) return false;
    const client = createClient({ baseUrl: "", token: s.token });
    await client.postTurnEnd(s.sessionId, s.userId, s.scope);
    return true;
  }

  async wakeAfterUserMessage(): Promise<void> {
    const s = this.snapshot;
    if (s.sessionId === null || s.scope === null) return;
    const managedClient = createManagedAgentsClient({
      baseUrl: "",
      token: s.token,
    });
    await managedClient.wakeSession(s.sessionId, {
      reason: NO_LOOSE_STRING_VALUES.userMessage,
      ...scopeToBody(s.scope),
    });
  }

  async wakeAfterSubmittedMessage(): Promise<void> {
    const s = this.snapshot;
    if (s.sessionId === null || s.scope === null) return;
    await this.wakeIfNeeded(s.sessionId, s.scope);
  }

  private readyForSubmit(): {
    sessionId: string;
    userId: string;
    scope: RootScope;
  } | null {
    const s = this.snapshot;
    if (!s.canSubmit || s.sessionId === null || s.userId === null) return null;
    if (s.scope === null) return null;
    return { sessionId: s.sessionId, userId: s.userId, scope: s.scope };
  }

  private async postProseIfNeeded(
    client: ReturnType<typeof createClient>,
    sessionId: string,
    userId: string,
    scope: RootScope,
  ): Promise<string | undefined> {
    const s = this.snapshot;
    if (!s.hasContent) return undefined;
    const body: {
      participant_id: string;
      content: string;
      name?: string;
      mentions?: ProseMention[];
    } = { participant_id: userId, content: s.content };
    if (s.mode === NO_LOOSE_STRING_VALUES.named) body.name = s.name.trim();
    if (s.mentions.length > 0) body.mentions = s.mentions;
    const proseResponse = await client.postProse(sessionId, body, scope);
    return proseResponse.filename;
  }

  private async postSendableAttachments(
    client: ReturnType<typeof createClient>,
    sessionId: string,
    userId: string,
    scope: RootScope,
    proseFilename: string | undefined,
  ): Promise<StagedAttachment[]> {
    const sendable = this.snapshot.attachments.filter(
      (attachment) => !attachment.uploading && !attachment.error,
    );
    for (const attachment of sendable) {
      await client.postFile(
        sessionId,
        {
          participant_id: userId,
          id: attachment.id,
          path: attachment.path,
          mime_type: attachment.mimeType,
          display_name: attachment.displayName,
          size_bytes: attachment.sizeBytes,
          preview_kind: attachment.previewKind,
          ...(proseFilename !== undefined ? { append_to: proseFilename } : {}),
        },
        scope,
      );
    }
    return sendable;
  }

  private async wakeIfNeeded(
    sessionId: string,
    scope: RootScope,
  ): Promise<void> {
    const s = this.snapshot;
    if (s.mode !== NO_LOOSE_STRING_VALUES.message) return;
    const managedClient = createManagedAgentsClient({
      baseUrl: "",
      token: s.token,
    });
    if (s.mentions.length > 0) {
      await managedClient.wakeSession(sessionId, {
        reason: NO_LOOSE_STRING_VALUES.mention,
        target_participant_ids: s.mentions.map((m) => m.participant_id),
        ...scopeToBody(scope),
      });
      return;
    }
    if (!s.messageEndsTurn) return;
    await managedClient.wakeSession(sessionId, {
      reason: NO_LOOSE_STRING_VALUES.userMessage,
      ...scopeToBody(scope),
    });
  }
}
