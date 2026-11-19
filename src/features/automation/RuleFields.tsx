import type {
  GraphemeClass,
  Operation,
  Piece,
  Rule,
} from '../../bridge/automation';
import { EditorField, OutlineButton } from '../../components/primitives';

export function Choice({
  label,
  value,
  choices,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  choices: { id: string; name: string }[];
  onChange: (id: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled={!optional}>
          {optional ? 'None' : 'Choose…'}
        </option>
        {value && !choices.some((c) => c.id === value) && (
          <option value={value}>
            Missing reference — choose a replacement
          </option>
        )}
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || 'Unnamed definition'}
          </option>
        ))}
      </select>
    </label>
  );
}
export function RuleSequence({
  value,
  choices,
  onChange,
}: {
  value: string[];
  choices: Rule[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="automation-sequence">
      {value.map((id, i) => (
        <div className="automation-row" key={i}>
          <Choice
            label={'Step ' + (i + 1)}
            value={id}
            choices={choices}
            onChange={(id) => onChange(value.map((v, n) => (n === i ? id : v)))}
          />
          <OutlineButton
            disabled={i === 0}
            onClick={() => {
              const next = [...value];
              [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
              onChange(next);
            }}
          >
            Move step {i + 1} earlier
          </OutlineButton>
          <OutlineButton
            onClick={() => onChange(value.filter((_, n) => n !== i))}
          >
            Remove step {i + 1}
          </OutlineButton>
        </div>
      ))}
      <OutlineButton
        disabled={value.length >= 16 || !choices.length}
        onClick={() => {
          if (choices[0]) onChange([...value, choices[0].id]);
        }}
      >
        Add rule step
      </OutlineButton>
    </div>
  );
}
export function RuleFields({
  rule,
  rules,
  classes,
  onChange,
}: {
  rule: Rule;
  rules: Rule[];
  classes: GraphemeClass[];
  onChange: (rule: Rule) => void;
}) {
  const op = rule.operation;
  const change = (operation: Operation) => onChange({ ...rule, operation });
  const selectKind = (kind: string) => {
    switch (kind) {
      case 'affix':
        change({ kind, prefix: '', suffix: '' });
        break;
      case 'infix':
        change({ kind, at: 0, text: '' });
        break;
      case 'template':
        change({ kind, pieces: [{ kind: 'stem' }] });
        break;
      case 'rewrite':
        change({
          kind,
          from: '',
          to: '',
          before: null,
          after: null,
          wordStart: false,
          wordEnd: false,
        });
        break;
      case 'call':
        change({ kind, ruleId: rules.find((r) => r.id !== rule.id)?.id ?? '' });
        break;
    }
  };
  const patchPiece = (i: number, piece: Piece) => {
    if (op.kind === 'template')
      change({ ...op, pieces: op.pieces.map((p, n) => (i === n ? piece : p)) });
  };
  return (
    <div className="automation-fields">
      <EditorField
        label="Rule name"
        required
        maxLength={120}
        value={rule.name}
        onChange={(e) => onChange({ ...rule, name: e.target.value })}
      />
      <label className="editor-field">
        <span>Operation</span>
        <select value={op.kind} onChange={(e) => selectKind(e.target.value)}>
          <option value="affix">Prefix / suffix</option>
          <option value="infix">Infix at a boundary</option>
          <option value="template">Stem template / reduplication</option>
          <option value="rewrite">Ordered sound change</option>
          <option value="call">Call another rule</option>
        </select>
      </label>
      {op.kind === 'affix' && (
        <div className="automation-grid">
          <EditorField
            label="Prefix"
            maxLength={512}
            value={op.prefix}
            onChange={(e) => change({ ...op, prefix: e.target.value })}
          />
          <EditorField
            label="Suffix"
            maxLength={512}
            value={op.suffix}
            onChange={(e) => change({ ...op, suffix: e.target.value })}
          />
        </div>
      )}
      {op.kind === 'infix' && (
        <div className="automation-grid">
          <EditorField
            label="Insertion boundary"
            type="number"
            required
            min={0}
            max={256}
            step={1}
            value={Number.isFinite(op.at) ? op.at : ''}
            onChange={(e) => change({ ...op, at: e.target.valueAsNumber })}
          />
          <EditorField
            label="Inserted text"
            required
            maxLength={512}
            value={op.text}
            onChange={(e) => change({ ...op, text: e.target.value })}
          />
        </div>
      )}
      {op.kind === 'template' && (
        <div>
          <p className="field-description">
            Pieces read the current word before this rule. Repeat Whole stem for
            reduplication, or combine grapheme slices with literals. Boundaries
            start at zero; the end is excluded.
          </p>
          {op.pieces.map((p, i) => (
            <div className="automation-piece" key={i}>
              <label className="editor-field">
                <span>{'Template piece ' + (i + 1)}</span>
                <select
                  value={p.kind}
                  onChange={(e) =>
                    patchPiece(
                      i,
                      e.target.value === 'stem'
                        ? { kind: 'stem' }
                        : e.target.value === 'literal'
                          ? { kind: 'literal', text: '' }
                          : { kind: 'slice', start: 0, end: 1 },
                    )
                  }
                >
                  <option value="stem">Whole stem</option>
                  <option value="literal">Literal text</option>
                  <option value="slice">Stem slice</option>
                </select>
              </label>
              {p.kind === 'literal' && (
                <EditorField
                  label={'Literal ' + (i + 1)}
                  maxLength={512}
                  value={p.text}
                  onChange={(e) =>
                    patchPiece(i, { ...p, text: e.target.value })
                  }
                />
              )}
              {p.kind === 'slice' && (
                <div className="automation-grid">
                  {(['start', 'end'] as const).map((key) => (
                    <EditorField
                      key={key}
                      label={key + ' boundary ' + (i + 1)}
                      type="number"
                      required
                      min={0}
                      max={256}
                      step={1}
                      value={Number.isFinite(p[key]) ? p[key] : ''}
                      onChange={(e) =>
                        patchPiece(i, { ...p, [key]: e.target.valueAsNumber })
                      }
                    />
                  ))}
                </div>
              )}
              <div className="dialog-actions">
                <OutlineButton
                  disabled={i === 0}
                  onClick={() => {
                    const pieces = [...op.pieces];
                    [pieces[i - 1], pieces[i]] = [pieces[i]!, pieces[i - 1]!];
                    change({ ...op, pieces });
                  }}
                >
                  Move piece {i + 1} earlier
                </OutlineButton>
                <OutlineButton
                  onClick={() =>
                    change({
                      ...op,
                      pieces: op.pieces.filter((_, n) => n !== i),
                    })
                  }
                >
                  Remove piece {i + 1}
                </OutlineButton>
              </div>
            </div>
          ))}
          <OutlineButton
            disabled={op.pieces.length >= 16}
            onClick={() =>
              change({ ...op, pieces: [...op.pieces, { kind: 'stem' }] })
            }
          >
            Add template piece
          </OutlineButton>
        </div>
      )}
      {op.kind === 'rewrite' && (
        <>
          <p className="field-description">
            Exact grapheme matching, left to right. A rule does not rematch its
            own output. Leave Replacement blank for deletion. Context classes
            match one adjacent grapheme.
          </p>
          <div className="automation-grid">
            <EditorField
              label="Match text"
              required
              maxLength={512}
              value={op.from}
              onChange={(e) => change({ ...op, from: e.target.value })}
            />
            <EditorField
              label="Replacement"
              maxLength={512}
              value={op.to}
              onChange={(e) => change({ ...op, to: e.target.value })}
            />
            <Choice
              optional
              label="Preceding class"
              value={op.before ?? ''}
              choices={classes}
              onChange={(id) => change({ ...op, before: id || null })}
            />
            <Choice
              optional
              label="Following class"
              value={op.after ?? ''}
              choices={classes}
              onChange={(id) => change({ ...op, after: id || null })}
            />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={op.wordStart}
              onChange={(e) => change({ ...op, wordStart: e.target.checked })}
            />
            Only at word start
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={op.wordEnd}
              onChange={(e) => change({ ...op, wordEnd: e.target.checked })}
            />
            Only at word end
          </label>
        </>
      )}
      {op.kind === 'call' && (
        <Choice
          label="Called rule"
          value={op.ruleId}
          choices={rules.filter((r) => r.id !== rule.id)}
          onChange={(ruleId) => change({ ...op, ruleId })}
        />
      )}
    </div>
  );
}
