import type { TmuxCommandClient } from "./commands.js";

export class TmuxUserOptions {
  constructor(private readonly commands: TmuxCommandClient) {}

  async setProject(sessionName: string, projectRoot: string): Promise<void> {
    await this.commands.setOption(sessionName, "@fmark-project", projectRoot);
  }

  async getProject(sessionName: string): Promise<string | null> {
    return this.commands.showOption(sessionName, "@fmark-project");
  }

  async setParticipant(
    sessionName: string,
    participantId: string,
  ): Promise<void> {
    await this.commands.setOption(sessionName, "@fmark-participant", participantId);
  }

  async get(sessionName: string, name: `@${string}`): Promise<string | null> {
    return this.commands.showOption(sessionName, name);
  }
}
