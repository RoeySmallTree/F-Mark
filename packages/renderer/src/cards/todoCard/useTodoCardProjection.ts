import { useMemo } from "react";
import type {
  AnyEventRecord,
  Participant,
  TodoPayload,
} from "@f-mark/shared";
import {
  buildTodoTreeFromEvents,
  flattenTree,
  latestTodoFilenames,
  type FlattenedTodo,
} from "../../panels/todoPanelUtils.js";
import { whoOf, type WhoInfo } from "../format.js";
import type { TodoItemNode } from "../TodoItem.js";
import { findTodoNode, nodeFromPayload } from "./todoNodes.js";

const NO_LOOSE_STRING_VALUES = {
  done: "done",
  wip: "wip",
  removed: "removed",
} as const;

interface TodoCardProjectionInput {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents?: AnyEventRecord[];
}

export interface TodoCardProjection {
  payload: TodoPayload;
  who: WhoInfo;
  done: boolean;
  wip: boolean;
  removed: boolean;
  node: TodoItemNode;
  depth: number;
  flat: FlattenedTodo[];
  flatById: Map<string, FlattenedTodo>;
  latestById: Map<string, string>;
}

export function useTodoCardProjection({
  event,
  participants,
  allEvents,
}: TodoCardProjectionInput): TodoCardProjection | null {
  const payload = event.payload as TodoPayload;
  const who = whoOf(event.participant_id, participants);
  const todoEvents = useMemo(() => {
    const source = allEvents ?? [event];
    return source.some((item) => item.filename === event.filename)
      ? source
      : [...source, event];
  }, [allEvents, event]);

  const todoTree = useMemo(
    () => buildTodoTreeFromEvents(todoEvents),
    [todoEvents],
  );
  const flat = useMemo(() => flattenTree(todoTree), [todoTree]);
  const flatById = useMemo(
    () => new Map(flat.map((item) => [item.id, item])),
    [flat],
  );
  const latestById = useMemo(
    () => latestTodoFilenames(todoEvents),
    [todoEvents],
  );
  const treeNode = findTodoNode(todoTree, payload.id);
  if (allEvents !== undefined && treeNode === undefined) return null;

  return {
    payload,
    who,
    done: payload.status === NO_LOOSE_STRING_VALUES.done,
    wip: payload.status === NO_LOOSE_STRING_VALUES.wip,
    removed: payload.status === NO_LOOSE_STRING_VALUES.removed,
    node: treeNode ?? nodeFromPayload(payload),
    depth: flatById.get(payload.id)?.depth ?? 0,
    flat,
    flatById,
    latestById,
  };
}
