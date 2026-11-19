import { useState } from 'react';
import type { FontDraft, FontGlyph } from '../../bridge/fonts';
import type { WritingSystem } from '../../bridge/writing';
import { EditorField, OutlineButton } from '../../components/primitives';

export interface VariantChoice {
  id: string;
  characterId: string;
  label: string;
}
function variantChoices(script: WritingSystem): VariantChoice[] {
  return script.data.characters.flatMap((c) =>
    c.glyphs.map((g) => ({
      id: g.id,
      characterId: c.id,
      label: `${c.name} / ${g.name}`,
    })),
  );
}
function scalarValue(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const hex = /^(?:U\+|0x)([0-9a-f]+)$/i.exec(text);
  const value = hex
    ? Number.parseInt(hex[1] ?? '', 16)
    : /^\d+$/.test(text)
      ? Number(text)
      : -1;
  // -1 is an invalid local draft marker, never sent over the checked bridge.
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 0x10ffff &&
    !(value >= 0xd800 && value <= 0xdfff)
    ? value
    : -1;
}
export function VariantSelect({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: VariantChoice[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose variant
        </option>
        {choices.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Sequence({
  label,
  value,
  choices,
  max,
  onChange,
}: {
  label: string;
  value: string[];
  choices: VariantChoice[];
  max: number;
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="font-sequence">
      <p>{label}</p>
      {value.map((id, i) => (
        <div key={i}>
          <VariantSelect
            label={`${label} ${i + 1}`}
            value={id}
            choices={choices}
            onChange={(id) => onChange(value.map((v, n) => (i === n ? id : v)))}
          />
          <OutlineButton
            onClick={() => onChange(value.filter((_, n) => i !== n))}
          >
            Remove {i + 1}
          </OutlineButton>
        </div>
      ))}
      <OutlineButton
        disabled={value.length >= max || !choices[0]}
        onClick={() => {
          if (choices[0]) onChange([...value, choices[0].id]);
        }}
      >
        Add {label.toLowerCase()}
      </OutlineButton>
    </div>
  );
}
export function FontFields({
  draft,
  script,
  onChange,
}: {
  draft: FontDraft;
  script: WritingSystem;
  onChange: (data: FontDraft) => void;
}) {
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState('');
  const [scalarText, setScalarText] = useState<Record<string, string>>({});
  const choices = variantChoices(script);
  const available = choices.filter(
    (v) => !draft.glyphs.some((g) => g.variantId === v.id),
  );
  const nonmarks = choices.filter((v) =>
    draft.glyphs.some((g) => g.variantId === v.id && !g.mark),
  );
  const patch = (i: number, value: Partial<FontGlyph>) =>
    onChange({
      ...draft,
      glyphs: draft.glyphs.map((g, n) => (n === i ? { ...g, ...value } : g)),
    });
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(draft.glyphs.length / 16) - 1),
  );
  return (
    <>
      <EditorField
        label="Font family"
        required
        maxLength={63}
        value={draft.family}
        onChange={(e) => onChange({ ...draft, family: e.target.value })}
      />
      <details open>
        <summary>Shared metrics</summary>
        <p className="field-description">
          All variants use one source coordinate system. Font x = source x × em
          ratio; font y = (source baseline − source y) × em ratio. SVG viewBoxes
          do not rescale glyphs.
        </p>
        <div className="font-metrics">
          {(
            [
              ['unitsPerEm', 'Font units per em', 16, 16384],
              ['ascender', 'Ascender', 1, 32767],
              ['descender', 'Descender', -32768, 0],
              ['lineGap', 'Line gap', 0, 32767],
              ['sourceEm', 'Source units per em', 16, 16384],
              ['sourceBaseline', 'Source baseline (y down)', -32768, 32767],
            ] as const
          ).map(([key, label, min, max]) => (
            <EditorField
              key={key}
              label={label}
              type="number"
              required
              min={min}
              max={max}
              step={1}
              value={
                Number.isFinite(draft.metrics[key]) ? draft.metrics[key] : ''
              }
              onChange={(e) =>
                onChange({
                  ...draft,
                  metrics: { ...draft.metrics, [key]: e.target.valueAsNumber },
                })
              }
            />
          ))}
        </div>
      </details>
      <details open>
        <summary>Glyphs, mappings and anchors ({draft.glyphs.length})</summary>
        <p className="field-description">
          PUA assignments belong to this project. One encoded variant per
          character; leave alternate variants unencoded. Enter decimal or U+
          hexadecimal values, such as 57344 or U+E000. Marks need zero advance.
          One anchor class supports mark-to-base positioning; stacking and
          ligature attachment remain research.
        </p>
        {draft.glyphs
          .slice(currentPage * 16, currentPage * 16 + 16)
          .map((g, offset) => {
            const i = currentPage * 16 + offset;
            return (
              <section
                className="font-glyph-row"
                key={g.variantId}
                aria-label={`Font glyph ${i + 1}`}
              >
                <h3>
                  {choices.find((c) => c.id === g.variantId)?.label ??
                    'Missing variant'}
                </h3>
                <div className="font-metrics">
                  <EditorField
                    label={`Unicode scalar ${i + 1}`}
                    maxLength={12}
                    spellCheck={false}
                    aria-invalid={g.codepoint === -1 ? true : undefined}
                    value={
                      scalarText[g.variantId] ??
                      (g.codepoint === null
                        ? ''
                        : `U+${g.codepoint.toString(16).toUpperCase()}`)
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      setScalarText((text) => ({
                        ...text,
                        [g.variantId]: raw,
                      }));
                      patch(i, { codepoint: scalarValue(raw) });
                    }}
                  />
                  <span className="technical-badge">
                    {g.codepoint === null
                      ? 'UNENCODED'
                      : Number.isSafeInteger(g.codepoint) && g.codepoint >= 0
                        ? `U+${g.codepoint.toString(16).toUpperCase().padStart(4, '0')}`
                        : 'INVALID'}
                  </span>
                  <EditorField
                    label={`Advance ${i + 1}`}
                    type="number"
                    required
                    min={0}
                    max={32767}
                    step={1}
                    disabled={g.mark}
                    value={Number.isFinite(g.advance) ? g.advance : ''}
                    onChange={(e) =>
                      patch(i, { advance: e.target.valueAsNumber })
                    }
                  />
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={g.mark}
                      onChange={(e) =>
                        patch(i, {
                          mark: e.target.checked,
                          advance: e.target.checked ? 0 : 1000,
                          anchor: e.target.checked
                            ? (g.anchor ?? [0, 0])
                            : g.anchor,
                        })
                      }
                    />
                    Combining mark
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      disabled={g.mark}
                      checked={g.anchor !== null}
                      onChange={(e) =>
                        patch(i, { anchor: e.target.checked ? [0, 0] : null })
                      }
                    />
                    {g.mark ? 'Mark origin' : 'Base attachment'}
                  </label>
                  {g.anchor &&
                    ([0, 1] as const).map((axis) => (
                      <EditorField
                        key={axis}
                        label={`Anchor ${axis ? 'y (up)' : 'x'} ${i + 1}`}
                        type="number"
                        required
                        min={-32768}
                        max={32767}
                        step={1}
                        value={
                          Number.isFinite(g.anchor?.[axis])
                            ? g.anchor?.[axis]
                            : ''
                        }
                        onChange={(e) => {
                          const a: [number, number] = g.anchor
                            ? [...g.anchor]
                            : [0, 0];
                          a[axis] = e.target.valueAsNumber;
                          patch(i, { anchor: a });
                        }}
                      />
                    ))}
                </div>
                <OutlineButton
                  onClick={() => {
                    setScalarText((text) => {
                      const next = { ...text };
                      delete next[g.variantId];
                      return next;
                    });
                    onChange({
                      ...draft,
                      glyphs: draft.glyphs.filter((_, n) => i !== n),
                    });
                  }}
                >
                  Remove font glyph {i + 1}
                </OutlineButton>
                <p className="field-description">
                  Removing this row retains the source variant. Update any
                  affected rules and sample characters before saving.
                </p>
              </section>
            );
          })}
        <div className="dialog-actions">
          <OutlineButton
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous glyphs
          </OutlineButton>
          <span>
            Page {currentPage + 1} of{' '}
            {Math.max(1, Math.ceil(draft.glyphs.length / 16))}
          </span>
          <OutlineButton
            disabled={(currentPage + 1) * 16 >= draft.glyphs.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next glyphs
          </OutlineButton>
        </div>
        <div className="font-add-row">
          <VariantSelect
            label="Add saved variant"
            choices={available}
            value={adding}
            onChange={setAdding}
          />
          <OutlineButton
            disabled={
              !available.some((g) => g.id === adding) ||
              draft.glyphs.length >= 512
            }
            onClick={() => {
              const v = available.find((g) => g.id === adding);
              if (v) {
                onChange({
                  ...draft,
                  glyphs: [
                    ...draft.glyphs,
                    {
                      characterId: v.characterId,
                      variantId: v.id,
                      codepoint: null,
                      advance: 1000,
                      mark: false,
                      anchor: null,
                    },
                  ],
                });
                setAdding('');
                setPage(Math.floor(draft.glyphs.length / 16));
              }
            }}
          >
            Add unencoded variant
          </OutlineButton>
        </div>
      </details>
      <details>
        <summary>Contextual forms ({draft.contexts.length})</summary>
        <p className="field-description">
          Ordered, exact neighbor rules. Each rule replaces one variant, keeping
          its source character. Later rules may see earlier replacements.
          Neighbors are glyph variants in logical order.
        </p>
        {draft.contexts.map((r, i) => (
          <section className="font-rule" key={i}>
            <h3>Context {i + 1}</h3>
            <Sequence
              label="Before"
              value={r.before}
              choices={nonmarks}
              max={4}
              onChange={(before) =>
                onChange({
                  ...draft,
                  contexts: draft.contexts.map((v, n) =>
                    n === i ? { ...r, before } : v,
                  ),
                })
              }
            />
            <VariantSelect
              label="Input variant"
              value={r.input}
              choices={nonmarks}
              onChange={(input) =>
                onChange({
                  ...draft,
                  contexts: draft.contexts.map((v, n) =>
                    n === i ? { ...r, input } : v,
                  ),
                })
              }
            />
            <Sequence
              label="After"
              value={r.after}
              choices={nonmarks}
              max={4}
              onChange={(after) =>
                onChange({
                  ...draft,
                  contexts: draft.contexts.map((v, n) =>
                    n === i ? { ...r, after } : v,
                  ),
                })
              }
            />
            <VariantSelect
              label="Replacement variant"
              value={r.output}
              choices={nonmarks}
              onChange={(output) =>
                onChange({
                  ...draft,
                  contexts: draft.contexts.map((v, n) =>
                    n === i ? { ...r, output } : v,
                  ),
                })
              }
            />
            <div className="dialog-actions">
              <OutlineButton
                disabled={i === 0}
                onClick={() => {
                  const contexts = [...draft.contexts];
                  const previous = contexts[i - 1];
                  if (previous) {
                    contexts[i - 1] = r;
                    contexts[i] = previous;
                    onChange({ ...draft, contexts });
                  }
                }}
              >
                Move context earlier
              </OutlineButton>
              <OutlineButton
                onClick={() =>
                  onChange({
                    ...draft,
                    contexts: draft.contexts.filter((_, n) => n !== i),
                  })
                }
              >
                Remove context {i + 1}
              </OutlineButton>
            </div>
          </section>
        ))}
        <OutlineButton
          disabled={nonmarks.length < 2 || draft.contexts.length >= 128}
          onClick={() => {
            const a = nonmarks[0];
            const b = nonmarks[1];
            if (a && b)
              onChange({
                ...draft,
                contexts: [
                  ...draft.contexts,
                  { before: [a.id], input: a.id, after: [], output: b.id },
                ],
              });
          }}
        >
          Add contextual rule
        </OutlineButton>
      </details>
      <details>
        <summary>Ligatures ({draft.ligatures.length})</summary>
        <p className="field-description">
          Two to eight input variants form one output glyph. The source sample
          retains every character. Longer matches take priority. Each output is
          reserved for one rule and cannot have a base anchor.
        </p>
        {draft.ligatures.map((r, i) => (
          <section className="font-rule" key={i}>
            <h3>Ligature {i + 1}</h3>
            <Sequence
              label="Component"
              value={r.input}
              choices={nonmarks}
              max={8}
              onChange={(input) =>
                onChange({
                  ...draft,
                  ligatures: draft.ligatures.map((v, n) =>
                    n === i ? { ...r, input } : v,
                  ),
                })
              }
            />
            <VariantSelect
              label="Ligature output"
              value={r.output}
              choices={nonmarks}
              onChange={(output) =>
                onChange({
                  ...draft,
                  ligatures: draft.ligatures.map((v, n) =>
                    n === i ? { ...r, output } : v,
                  ),
                })
              }
            />
            <OutlineButton
              onClick={() =>
                onChange({
                  ...draft,
                  ligatures: draft.ligatures.filter((_, n) => n !== i),
                })
              }
            >
              Remove ligature {i + 1}
            </OutlineButton>
          </section>
        ))}
        <OutlineButton
          disabled={nonmarks.length < 2 || draft.ligatures.length >= 128}
          onClick={() => {
            const a = nonmarks[0];
            const b = nonmarks[1];
            if (a && b)
              onChange({
                ...draft,
                ligatures: [
                  ...draft.ligatures,
                  { input: [a.id, a.id], output: b.id },
                ],
              });
          }}
        >
          Add ligature rule
        </OutlineButton>
      </details>
      <details>
        <summary>Font rights and embedding metadata</summary>
        <EditorField
          label="Copyright notice"
          maxLength={2048}
          value={draft.copyright}
          onChange={(e) => onChange({ ...draft, copyright: e.target.value })}
        />
        <label className="editor-field">
          <span>License text</span>
          <textarea
            rows={4}
            maxLength={8192}
            value={draft.license}
            onChange={(e) => onChange({ ...draft, license: e.target.value })}
          />
        </label>
        <label className="editor-field">
          <span>Embedding permission</span>
          <select
            value={draft.embedding}
            onChange={(e) =>
              onChange({
                ...draft,
                embedding: e.target.value as FontDraft['embedding'],
              })
            }
          >
            <option value="restricted">Restricted (default)</option>
            <option value="preview_print">Preview and print</option>
            <option value="editable">Editable embedding</option>
            <option value="installable">Installable embedding</option>
          </select>
        </label>
        <p className="field-description">
          These values are written into the font. Choose permissions that match
          the outline rights and license; the application does not grant rights
          to imported artwork.
        </p>
      </details>
    </>
  );
}
