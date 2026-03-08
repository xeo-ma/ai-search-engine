interface SafeModeToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function SafeModeToggle({ checked, onChange }: SafeModeToggleProps) {
  return (
    <label className="row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>Safe mode</span>
    </label>
  );
}
