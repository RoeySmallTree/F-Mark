interface FilterChipProps {
  checked: boolean;
  label: string;
  onToggle(): void;
}

export function FilterChip({
  checked,
  label,
  onToggle,
}: FilterChipProps): JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={["pop-chip", checked ? "on" : ""].join(" ").trim()}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
