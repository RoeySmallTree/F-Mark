import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { ArbitraryGroupCard } from "../ArbitraryGroupCard";
import { ToolboxAccordionProvider } from "../toolboxAccordion";
import type { ArbitraryGroup } from "../../feed/projectFeed";
import { DEFAULT_NOW, makeGroup } from "./fixtures";

type GroupCardOptions = {
  allEvents?: AnyEventRecord[];
  group?: ArbitraryGroup;
  groupId?: string;
  groupPatch?: Partial<ArbitraryGroup>;
  now?: Date;
  participants?: Record<string, Participant>;
};

export function groupCard(options: GroupCardOptions = {}): ReactElement {
  const { allEvents, group, groupId, groupPatch, now, participants } = options;

  return (
    <ArbitraryGroupCard
      allEvents={allEvents}
      group={group ?? makeGroup(groupPatch)}
      groupId={groupId}
      now={now ?? DEFAULT_NOW}
      participants={participants}
    />
  );
}

export function renderGroup(options: GroupCardOptions = {}): RenderResult {
  return render(groupCard(options));
}

export function accordion(children: ReactNode): ReactElement {
  return <ToolboxAccordionProvider>{children}</ToolboxAccordionProvider>;
}

export function renderAccordion(children: ReactNode): RenderResult {
  return render(accordion(children));
}
