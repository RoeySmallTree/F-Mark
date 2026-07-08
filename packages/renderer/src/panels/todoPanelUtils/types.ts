export interface FlattenedTodo {
  id: string;
  depth: number;
  parentId: string | undefined;
  prevId: string | null;
  nextId: string | null;
  prevSameDepthId: string | null;
  nextSameDepthId: string | null;
}

export interface TodoDropdownOption {
  id: string;
  title: string;
  depth: number;
}
