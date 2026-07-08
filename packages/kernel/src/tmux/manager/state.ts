export class TmuxProjectState {
  constructor(private projectRoot: string) {}

  resolveProjectRoot(rootOverride?: string): string {
    return rootOverride ?? this.projectRoot;
  }

  rebind(input: { projectRoot: string }): void {
    this.projectRoot = input.projectRoot;
  }

  currentProjectRoot(): string {
    return this.projectRoot;
  }
}
