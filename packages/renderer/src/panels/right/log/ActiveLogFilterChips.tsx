import type { JSX } from "react";
import { X } from "lucide-react";
import type { Participant } from "@f-mark/shared";
import { chipLabelForRange, LogFilterController } from "./logFilterController.js";

const NO_LOOSE_STRING_VALUES = {
  all: "all",
} as const;

interface ActiveLogFilterChipsProps {
  controller: LogFilterController;
  participants: Record<string, Participant>;
}

export function ActiveLogFilterChips({
  controller,
  participants,
}: ActiveLogFilterChipsProps): JSX.Element {
  const { filter } = controller;

  return (
    <div
      className="active-chips"
      data-testid="active-chips"
      aria-label="Active filters"
    >
      {filter.kinds.map((kind) => (
        <button
          type="button"
          key={`k-${kind}`}
          className="pop-chip on"
          onClick={() => controller.removeKind(kind)}
        >
          {kind}
          <X size={9} aria-hidden="true" />
        </button>
      ))}
      {filter.participants.map((id) => {
        const participant = participants[id];
        return (
          <button
            type="button"
            key={`p-${id}`}
            className="pop-chip on"
            onClick={() => controller.removeParticipant(id)}
          >
            {participant?.name ?? id}
            <X size={9} aria-hidden="true" />
          </button>
        );
      })}
      {filter.range !== NO_LOOSE_STRING_VALUES.all ? (
        <button
          type="button"
          className="pop-chip on"
          onClick={controller.clearRange}
        >
          {chipLabelForRange(filter)}
          <X size={9} aria-hidden="true" />
        </button>
      ) : null}
      {filter.namedOnly ? (
        <button
          type="button"
          className="pop-chip on"
          onClick={controller.clearNamedOnly}
        >
          named only
          <X size={9} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className="active-chips-clear"
        onClick={controller.clearAll}
        aria-label="Clear all filters"
      >
        clear all
      </button>
    </div>
  );
}
