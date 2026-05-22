export function LeftRail(): JSX.Element {
  return (
    <nav className="flex w-12 flex-col items-center gap-3 border-r border-neutral-200 py-3 text-neutral-500">
      <button className="rounded p-1 hover:bg-neutral-100">📁</button>
      <button className="rounded p-1 hover:bg-neutral-100">📋</button>
      <button className="rounded p-1 hover:bg-neutral-100">💬</button>
      <button className="rounded p-1 hover:bg-neutral-100">✓</button>
    </nav>
  );
}
