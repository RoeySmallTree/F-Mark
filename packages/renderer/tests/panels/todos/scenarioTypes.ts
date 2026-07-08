export type TodoScenario = readonly [
  name: string,
  run: () => void | Promise<void>,
];
