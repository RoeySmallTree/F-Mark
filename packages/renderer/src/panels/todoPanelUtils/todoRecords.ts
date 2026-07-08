import type {
  AnyEventRecord,
  TodoPayload,
  TodoTreeNode,
} from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  todo: "todo",
  open: "open",
  wip: "wip",
  done: "done",
} as const;

export function sortedTodoEvents(events: AnyEventRecord[]): AnyEventRecord[] {
  return events.filter((event) => event.kind === NO_LOOSE_STRING_VALUES.todo).sort(compareEvents);
}

export function supersededTodoFilenames(
  events: AnyEventRecord[],
): Set<string> {
  const superseded = new Set<string>();
  for (const event of events) {
    const supersedes = (event.payload as TodoPayload).supersedes;
    if (typeof supersedes === "string" && supersedes.length > 0) {
      superseded.add(supersedes);
    }
  }
  return superseded;
}

export function isVisibleTodo(payload: TodoPayload): boolean {
  return (
    payload.status === NO_LOOSE_STRING_VALUES.open ||
    payload.status === NO_LOOSE_STRING_VALUES.wip ||
    payload.status === NO_LOOSE_STRING_VALUES.done
  );
}

export function todoNodeFromPayload(payload: TodoPayload): TodoTreeNode {
  const node: TodoTreeNode = {
    id: payload.id,
    title: payload.title,
    status: payload.status as TodoTreeNode["status"],
    children: [],
  };
  if (payload.body !== undefined) node.body = payload.body;
  if (payload.assigned_to !== undefined) node.assigned_to = payload.assigned_to;
  if (payload.parent_id !== undefined) node.parent_id = payload.parent_id;
  return node;
}

function compareEvents(a: AnyEventRecord, b: AnyEventRecord): number {
  return (
    a.timestamp.localeCompare(b.timestamp) ||
    a.filename.localeCompare(b.filename)
  );
}
