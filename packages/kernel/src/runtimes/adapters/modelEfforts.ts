import type { EffortDescriptor, ModelDescriptor } from "@f-mark/shared";

function uniqueEfforts(
  models: Array<Pick<ModelDescriptor, "efforts">>,
): EffortDescriptor[] {
  const seen = new Set<string>();
  const out: EffortDescriptor[] = [];

  for (const model of models) {
    for (const effort of model.efforts ?? []) {
      if (!seen.has(effort.id)) {
        seen.add(effort.id);
        out.push(effort);
      }
    }
  }

  return out;
}

export function effortsForModel(
  models: ModelDescriptor[],
  modelId?: string,
): EffortDescriptor[] {
  if (modelId) {
    const model = models.find((candidate) => candidate.id === modelId);
    return model?.efforts ?? [];
  }

  return uniqueEfforts(models);
}
