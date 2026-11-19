import { useState } from 'react';
import { OutlineButton } from '../../components/primitives';

export function GlyphNumbers({
  labels,
  values,
  disabled,
  onPending,
  onApply,
}: {
  labels: string[];
  values: number[];
  disabled: boolean;
  onPending: (value: boolean) => void;
  onApply: (values: number[]) => void;
}) {
  const [fields, setFields] = useState(() => values.map(String));
  const parsed = fields.map((f) => (f.trim() ? Number(f) : NaN));
  const valid = parsed.every(Number.isFinite);
  return (
    <div
      className="glyph-number-fields"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          if (valid && !disabled) onApply(parsed);
        }
      }}
    >
      {labels.map((label, i) => (
        <label key={label} className="editor-field">
          {label}
          <input
            type="number"
            step="any"
            value={fields[i] ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const next = fields.map((f, j) => (j === i ? e.target.value : f));
              setFields(next);
              onPending(next.some((f, j) => f !== String(values[j])));
            }}
          />
        </label>
      ))}
      <div className="project-action-row">
        <OutlineButton
          disabled={disabled || !valid}
          onClick={() => onApply(parsed)}
        >
          Apply numeric edit
        </OutlineButton>
        <OutlineButton
          disabled={disabled}
          onClick={() => {
            setFields(values.map(String));
            onPending(false);
          }}
        >
          Reset fields
        </OutlineButton>
      </div>
    </div>
  );
}
