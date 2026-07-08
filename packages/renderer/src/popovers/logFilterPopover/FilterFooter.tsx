interface FilterFooterProps {
  onApply(): void;
  onReset(): void;
}

export function FilterFooter({
  onApply,
  onReset,
}: FilterFooterProps): JSX.Element {
  return (
    <div className="pop-foot">
      <button type="button" className="btn-ghost" onClick={onReset}>
        Reset
      </button>
      <button type="button" className="btn-solid" onClick={onApply}>
        Apply
      </button>
    </div>
  );
}
