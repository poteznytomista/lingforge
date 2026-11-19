import { useEffect, useId, useState } from 'react';
import type { FontDraft, FontPreview } from '../../bridge/fonts';
import type { WritingSystem } from '../../bridge/writing';
import { EditorField, OutlineButton } from '../../components/primitives';
import { Outline } from '../writing/Glyph';

function PlatformRun({
  preview,
  direction,
}: {
  preview: FontPreview;
  direction: FontDraft['direction'];
}) {
  const family = `LingForgePreview${useId().replace(/[^a-z0-9]/gi, '')}`;
  const [loaded, setLoaded] = useState<{
    preview: FontPreview;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    let current = true;
    let face: FontFace | null = null;
    const load = async () => {
      if (typeof FontFace !== 'function' || !document.fonts)
        throw new Error('Font loading is unavailable.');
      face = new FontFace(family, new Uint8Array(preview.bytes).buffer);
      const created = face;
      await created.load();
      if (current) {
        document.fonts.add(created);
        setLoaded({ preview, error: false });
      }
    };
    void load().catch(() => {
      if (current) setLoaded({ preview, error: true });
    });
    return () => {
      current = false;
      if (face) document.fonts?.delete(face);
    };
  }, [family, preview]);
  if (loaded?.preview !== preview)
    return <p role="status">Loading generated font into this webview…</p>;
  if (loaded.error)
    return (
      <p role="alert">
        This webview rejected the generated font. The reference shaping result
        below remains available; platform rendering has not succeeded.
      </p>
    );
  return (
    <label className="editor-field">
      <span>
        Native font sample (read only; select to inspect or copy encoded text)
      </span>
      <textarea
        readOnly
        rows={3}
        className="font-platform-run"
        dir={direction}
        lang="und"
        style={{ fontFamily: `"${family}"` }}
        value={preview.text}
      />
      <span className="field-description">
        This is an explicitly directed single run. Copying its Unicode/PUA text
        does not preserve LingForge IDs and needs the matching font elsewhere.
      </span>
    </label>
  );
}

export function FontSample({
  draft,
  script,
  preview,
  disabled,
  onChange,
}: {
  draft: FontDraft;
  script: WritingSystem;
  preview: FontPreview | null;
  disabled: boolean;
  onChange: (data: FontDraft) => void;
}) {
  const [anchor, setAnchor] = useState(0);
  const [head, setHead] = useState(0);
  const [past, setPast] = useState<string[][]>([]);
  const [future, setFuture] = useState<string[][]>([]);
  const from = Math.min(anchor, head, draft.sample.length);
  const to = Math.min(Math.max(anchor, head), draft.sample.length);
  const encoded = draft.glyphs.filter((g) => g.codepoint !== null);
  const replace = (insert: string[]) => {
    if (disabled) return;
    const sample = [
      ...draft.sample.slice(0, from),
      ...insert,
      ...draft.sample.slice(to),
    ];
    if (sample.length > 256 || (from === to && !insert.length)) return;
    setPast([...past, draft.sample].slice(-50));
    setFuture([]);
    setAnchor(from + insert.length);
    setHead(from + insert.length);
    onChange({ ...draft, sample });
  };
  return (
    <section className="font-sample" aria-label="Font shaping sample">
      <h2>Shaping sample</h2>
      <p className="field-description">
        Edit stable characters in logical order. Selection uses source
        boundaries even when several characters form one glyph. Native visual
        caret behavior is a separate, unverified experiment.
      </p>
      <div className="font-palette">
        {encoded.map((g) => {
          const c = script.data.characters.find((c) => c.id === g.characterId);
          const v = c?.glyphs.find((v) => v.id === g.variantId);
          return c && v ? (
            <button
              type="button"
              key={g.variantId}
              disabled={draft.sample.length - (to - from) >= 256}
              onClick={() => replace([c.id])}
              title={`Insert ${c.name}`}
              aria-label={`Insert ${c.name}`}
            >
              <Outline outline={v.outline} />
              <span>{c.name}</span>
            </button>
          ) : null;
        })}
      </div>
      <div className="font-metrics">
        <EditorField
          label="Selection start"
          type="number"
          min={0}
          max={draft.sample.length}
          step={1}
          value={from}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isInteger(v) && v >= 0 && v <= draft.sample.length) {
              setAnchor(v);
              setHead(Math.max(v, to));
            }
          }}
        />
        <EditorField
          label="Selection end"
          type="number"
          min={from}
          max={draft.sample.length}
          step={1}
          value={to}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isInteger(v) && v >= from && v <= draft.sample.length) {
              setAnchor(from);
              setHead(v);
            }
          }}
        />
        <label className="editor-field">
          <span>Single-run direction</span>
          <select
            value={draft.direction}
            onChange={(e) =>
              onChange({
                ...draft,
                direction: e.target.value === 'rtl' ? 'rtl' : 'ltr',
              })
            }
          >
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left (experimental)</option>
          </select>
        </label>
      </div>
      <div
        className="font-source-run"
        role="group"
        aria-label="Logical source characters"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const n = Math.max(
              0,
              Math.min(
                draft.sample.length,
                head + (e.key === 'ArrowLeft' ? -1 : 1),
              ),
            );
            setHead(n);
            if (!e.shiftKey) setAnchor(n);
          }
          if (e.key === 'Delete' && from !== to) {
            e.preventDefault();
            replace([]);
          }
        }}
      >
        {draft.sample.length ? (
          draft.sample.map((id, i) => (
            <button
              type="button"
              key={i}
              aria-pressed={i >= from && i < to}
              onClick={(e) => {
                if (e.shiftKey) setHead(i + 1);
                else {
                  setAnchor(i);
                  setHead(i + 1);
                }
              }}
            >
              {i + 1}:{' '}
              {script.data.characters.find((c) => c.id === id)?.name ??
                'Missing character'}
            </button>
          ))
        ) : (
          <p>No sample characters yet. Insert from the palette.</p>
        )}
      </div>
      <div className="dialog-actions">
        <OutlineButton disabled={from === to} onClick={() => replace([])}>
          Delete selected characters
        </OutlineButton>
        <OutlineButton
          disabled={!past.length}
          onClick={() => {
            const sample = past.at(-1);
            if (sample) {
              setPast(past.slice(0, -1));
              setFuture([...future, draft.sample].slice(-50));
              setAnchor(0);
              setHead(0);
              onChange({ ...draft, sample });
            }
          }}
        >
          Undo sample
        </OutlineButton>
        <OutlineButton
          disabled={!future.length}
          onClick={() => {
            const sample = future.at(-1);
            if (sample) {
              setFuture(future.slice(0, -1));
              setPast([...past, draft.sample].slice(-50));
              setAnchor(0);
              setHead(0);
              onChange({ ...draft, sample });
            }
          }}
        >
          Redo sample
        </OutlineButton>
      </div>
      {preview && (
        <section className="font-preview" aria-label="Generated font preview">
          <h3>Current preview</h3>
          <PlatformRun preview={preview} direction={draft.direction} />
          {preview.warnings.map((w) => (
            <p className="field-description" key={w}>
              {w}
            </p>
          ))}
          <p className="technical-badge">
            REFERENCE SHAPER · {preview.glyphs.length} GLYPHS ·{' '}
            {preview.bytes.length} BYTES
          </p>
          <div className="font-table-scroll">
            <table>
              <caption>
                Shaped glyphs in visual output order. Select a row’s source
                range to inspect the original characters. Offsets and advances
                are font units.
              </caption>
              <thead>
                <tr>
                  <th>Glyph</th>
                  <th>Source range</th>
                  <th>Advance x/y</th>
                  <th>Offset x/y</th>
                </tr>
              </thead>
              <tbody>
                {preview.glyphs.map((g, i) => (
                  <tr key={i}>
                    <td>
                      {g.glyphId} ·{' '}
                      {script.data.characters
                        .flatMap((c) => c.glyphs)
                        .find((v) => v.id === g.variantId)?.name ?? '.notdef'}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          setAnchor(g.start);
                          setHead(g.end);
                        }}
                      >
                        {g.start}–{g.end}
                      </button>
                    </td>
                    <td>
                      {g.xAdvance} / {g.yAdvance}
                    </td>
                    <td>
                      {g.xOffset} / {g.yOffset}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
