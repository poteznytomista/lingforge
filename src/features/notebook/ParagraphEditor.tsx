import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import * as api from '../../bridge/notebook';
import * as writing from '../../bridge/writing';
import { OutlineButton } from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import { ReferencePicker } from '../lexicon/ReferencePicker';
import { CharacterGlyph, UnitGlyph } from '../writing/Glyph';

export function ParagraphEditor({
  paragraph,
  scripts,
  workspace,
  onChange,
  onPending,
  onUndo,
  onRedo,
}: {
  paragraph: api.Paragraph;
  scripts: writing.WritingSystem[];
  workspace: WorkspaceController;
  onChange: (p: api.Paragraph) => void;
  onPending: (pending: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const [selection, setSelection] = useState({ anchor: 0, head: 0 });
  const [input, setInput] = useState('');
  const [literal, setLiteral] = useState(true);
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [overrides, setOverrides] = useState<api.CharacterMapping[]>([]);
  const [conversion, setConversion] = useState<{
    key: string;
    result: api.Conversion;
  } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const start = Math.min(
    selection.anchor,
    selection.head,
    paragraph.units.length,
  );
  const end = Math.min(
    Math.max(selection.anchor, selection.head),
    paragraph.units.length,
  );
  const script = scripts.find((s) => s.id === paragraph.scriptId);
  const target = scripts.find((s) => s.id === targetId);
  const data: writing.ScriptDraft = script?.data ?? {
    ...writing.blankScript(),
    name: 'Literal Unicode',
  };
  const conversionKey = JSON.stringify([
    paragraph,
    targetId,
    overrides,
    scripts,
  ]);
  const preview = conversion?.key === conversionKey ? conversion.result : null;
  const pending = input.length > 0 || composing;
  const affected = paragraph.links.filter(
    (l) =>
      (start < l.end && end > l.start) ||
      (start === end && start > l.start && start < l.end),
  ).length;
  useEffect(() => {
    onPending(pending);
  }, [onPending, pending]);
  useEffect(() => {
    canvas.current
      ?.querySelector<HTMLElement>('[data-caret="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selection.head]);
  const apply = (p: api.Paragraph, caret: number) => {
    const removed = paragraph.links.length - p.links.length;
    onChange(p);
    setSelection({ anchor: caret, head: caret });
    if (removed > 0)
      workspace.setNotice(
        `${removed} intersected lexical link(s) removed. Undo restores both text and links.`,
      );
  };
  const insert = (units: writing.TextUnit[], from = start, to = end) =>
    workspace.run(
      () => api.editParagraph(sessionId, paragraph, from, to, units),
      (p) => apply(p, from + units.length),
    );
  const commit = () => {
    if (!input || composingRef.current) return;
    void workspace.run(
      async () => {
        const result = await writing.previewInput(
          sessionId,
          data,
          input,
          true,
          literal || !script,
        );
        if (result.pending || result.issues.length)
          throw {
            code: 'invalid_input',
            message: result.issues.join(' ') || 'Complete the pending input.',
          };
        return {
          paragraph: await api.editParagraph(
            sessionId,
            paragraph,
            start,
            end,
            result.units,
          ),
          caret: start + result.units.length,
        };
      },
      (result) => {
        apply(result.paragraph, result.caret);
        setInput('');
      },
    );
  };
  const move = (head: number, extend: boolean) =>
    setSelection({ anchor: extend ? selection.anchor : head, head });
  const remove = (backwards: boolean) => {
    const from = start === end && backwards ? Math.max(0, start - 1) : start;
    const to =
      start === end && !backwards
        ? Math.min(paragraph.units.length, end + 1)
        : end;
    if (from !== to) void insert([], from, to);
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      workspace.busyRef.current ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.metaKey
    )
      return;
    if (event.ctrlKey) {
      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelection({ anchor: 0, head: paragraph.units.length });
      }
      if (['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (!pending) {
          if (event.shiftKey || event.key.toLowerCase() === 'y') onRedo();
          else onUndo();
        }
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const left = event.key === 'ArrowLeft';
      move(
        !event.shiftKey && start !== end
          ? left
            ? start
            : end
          : Math.max(
              0,
              Math.min(
                paragraph.units.length,
                selection.head + (left ? -1 : 1),
              ),
            ),
        event.shiftKey,
      );
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      move(event.key === 'Home' ? 0 : paragraph.units.length, event.shiftKey);
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      remove(event.key === 'Backspace');
    }
  };
  const copy = (event: ClipboardEvent, cut: boolean) => {
    event.preventDefault();
    if (workspace.busyRef.current || start === end) return;
    try {
      event.clipboardData.setData(
        'text/plain',
        'LINGFORGE-PARAGRAPH/1\n' +
          JSON.stringify({
            projectId: workspace.active?.summary.id,
            scriptId: paragraph.scriptId,
            units: paragraph.units.slice(start, end),
          }),
      );
      if (cut) void insert([]);
    } catch {
      workspace.setError(
        'The clipboard could not be written. Text has been retained.',
      );
    }
  };
  const paste = (event: ClipboardEvent) => {
    event.preventDefault();
    if (workspace.busyRef.current) return;
    const text = event.clipboardData.getData('text/plain');
    void workspace.run(
      async () => {
        const prefix = 'LINGFORGE-PARAGRAPH/1\n';
        if (!text.startsWith(prefix) || text.length > 2 * 1024 * 1024)
          throw {
            code: 'invalid_input',
            message:
              'Paste ordinary text into Input. Structured copies must come from this project and paragraph writing system.',
          };
        let value: unknown;
        try {
          value = JSON.parse(text.slice(prefix.length));
        } catch {
          throw {
            code: 'invalid_input',
            message: 'This structured clipboard copy is invalid.',
          };
        }
        if (
          typeof value !== 'object' ||
          !value ||
          !('projectId' in value) ||
          value.projectId !== workspace.active?.summary.id ||
          !('scriptId' in value) ||
          value.scriptId !== paragraph.scriptId ||
          !('units' in value) ||
          !writing.isUnits(value.units)
        )
          throw {
            code: 'invalid_input',
            message:
              'This structured copy has incompatible identities or invalid units.',
          };
        return {
          paragraph: await api.editParagraph(
            sessionId,
            paragraph,
            start,
            end,
            value.units,
          ),
          caret: start + value.units.length,
        };
      },
      (result) => apply(result.paragraph, result.caret),
    );
  };
  const linkSelection = () => {
    if (!entryId || start === end) return;
    const links = [
      ...paragraph.links.filter((l) => l.end <= start || l.start >= end),
      { start, end, entryId },
    ].sort((a, b) => a.start - b.start);
    if (links.length > 256) {
      workspace.setError('A paragraph can contain at most 256 lexical links.');
      return;
    }
    onChange({ ...paragraph, links });
  };
  return (
    <section className="paragraph-editor" aria-label="Paragraph editor">
      <label className="editor-field">
        Paragraph writing system
        <select
          value={paragraph.scriptId ?? ''}
          disabled={
            workspace.busy ||
            pending ||
            paragraph.units.some((u) => u.kind === 'symbol')
          }
          onChange={(e) => {
            onChange({ ...paragraph, scriptId: e.target.value || null });
            setOverrides([]);
          }}
        >
          <option value="">Literal Unicode</option>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.data.name}
            </option>
          ))}
        </select>
      </label>
      <p className="field-description">
        Once a paragraph contains custom symbols, use conversion to change its
        writing system. Literal text keeps its Unicode spelling.
      </p>
      <div className="symbol-palette" aria-label="Insert document character">
        {data.characters.map((c) => (
          <button
            type="button"
            key={c.id}
            disabled={workspace.busy}
            aria-label={`Insert ${c.name}`}
            onClick={() => void insert([{ kind: 'symbol', characterId: c.id }])}
          >
            <CharacterGlyph character={c} />
            <small>{c.name}</small>
          </button>
        ))}
      </div>
      <div
        ref={canvas}
        className="symbol-canvas"
        role="group"
        aria-label="Paragraph text"
        tabIndex={0}
        dir="ltr"
        onKeyDown={keys}
        onCopy={(e) => copy(e, false)}
        onCut={(e) => copy(e, true)}
        onPaste={paste}
      >
        {paragraph.units.map((u, i) => (
          <button
            type="button"
            tabIndex={-1}
            key={i}
            className="text-unit"
            disabled={workspace.busy}
            data-caret={selection.head === i}
            data-selected={i >= start && i < end}
            data-newline={u.kind === 'text' && /^[\r\n]+$/.test(u.text)}
            data-linked={paragraph.links.some((l) => i >= l.start && i < l.end)}
            aria-label={`Position ${i + 1}: ${u.kind === 'text' ? u.text : (data.characters.find((c) => c.id === u.characterId)?.name ?? 'Unavailable character')}`}
            onClick={(e) => {
              move(i, e.shiftKey);
              canvas.current?.focus();
            }}
          >
            <UnitGlyph unit={u} characters={data.characters} />
          </button>
        ))}
        <button
          type="button"
          tabIndex={-1}
          className="text-end"
          disabled={workspace.busy}
          data-caret={selection.head === paragraph.units.length}
          aria-label="Move paragraph caret to end"
          onClick={(e) => {
            move(paragraph.units.length, e.shiftKey);
            canvas.current?.focus();
          }}
        >
          {paragraph.units.length ? '│' : 'Empty paragraph'}
        </button>
      </div>
      <p role="status" className="field-description">
        Caret {selection.head} of {paragraph.units.length} · range [{start},{' '}
        {end}) · {end - start} selected. Arrows move, Shift selects, Home/End
        jump within this paragraph. Ctrl+A/C/X/V and Ctrl+Z/Y work here.
      </p>
      <p className="field-description">
        Edits remove intersected lexical links and shift links after the edit.
        Insertion at a boundary stays outside the link. Structured clipboard
        preserves text identities within this project and writing system;
        lexical annotations are not copied.
      </p>
      {affected > 0 && (
        <p className="inline-error">
          Replacing this selection will remove {affected} lexical link(s).
          Linking it will replace overlapping links. Undo restores them.
        </p>
      )}
      <OutlineButton
        disabled={workspace.busy || start === end}
        onClick={() => void insert([])}
      >
        Delete selected text
      </OutlineButton>
      <label className="editor-field">
        Input
        <textarea
          value={input}
          maxLength={4096}
          disabled={workspace.busy}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
            setComposing(true);
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            setComposing(false);
            setInput(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              !composingRef.current
            ) {
              e.preventDefault();
              commit();
            }
          }}
        />
      </label>
      {script && (
        <label className="lexicon-checkbox">
          <input
            type="checkbox"
            checked={literal}
            disabled={workspace.busy || composing}
            onChange={(e) => setLiteral(e.target.checked)}
          />
          Insert literal Unicode text (otherwise use saved input mappings)
        </label>
      )}
      <p className="field-description">
        Insert resolves the complete staged input. Missing or ambiguous mappings
        retain it for correction. Shift+Enter adds a line break; composition
        must finish before insertion.
      </p>
      <div className="project-action-row">
        <OutlineButton
          disabled={workspace.busy || !input || composing}
          onClick={commit}
        >
          Insert input
        </OutlineButton>
        <OutlineButton
          disabled={workspace.busy || !input || composing}
          onClick={() => setInput('')}
        >
          Clear pending input
        </OutlineButton>
      </div>
      <section className="entry-section">
        <h3>Dictionary link</h3>
        <ReferencePicker
          label="Selected text entry"
          sessionId={sessionId}
          value={entryId}
          disabled={workspace.busy}
          onChange={setEntryId}
        />
        <OutlineButton
          disabled={workspace.busy || !entryId || start === end}
          onClick={linkSelection}
        >
          Link selection
        </OutlineButton>
        <ul className="notebook-links">
          {paragraph.links.map((l) => (
            <li key={`${l.start}-${l.end}`}>
              <button
                type="button"
                disabled={workspace.busy}
                onClick={() => {
                  setSelection({ anchor: l.start, head: l.end });
                  setEntryId(l.entryId);
                }}
              >
                Inspect linked range [{l.start}, {l.end})
              </button>
              <OutlineButton
                disabled={workspace.busy}
                onClick={() =>
                  onChange({
                    ...paragraph,
                    links: paragraph.links.filter((item) => item !== l),
                  })
                }
              >
                Remove link
              </OutlineButton>
            </li>
          ))}
        </ul>
      </section>
      {script && (
        <section className="entry-section">
          <h3>Convert paragraph orthography</h3>
          <p className="field-description">
            Preview matches each custom character by exact, nonempty
            transliteration. Missing or ambiguous matches block conversion.
            Literal Unicode is preserved. Choose explicit replacements below
            when needed; lexical ranges follow expanded outputs.
          </p>
          <label className="editor-field">
            Target writing system
            <select
              value={targetId}
              disabled={workspace.busy || pending}
              onChange={(e) => {
                setTargetId(e.target.value);
                setOverrides([]);
              }}
            >
              <option value="">Choose target</option>
              {scripts
                .filter((s) => s.id !== script.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.data.name}
                  </option>
                ))}
            </select>
          </label>
          {target &&
            data.characters
              .filter((c) =>
                paragraph.units.some(
                  (u) => u.kind === 'symbol' && u.characterId === c.id,
                ),
              )
              .map((c) => {
                const mapping = overrides.find((m) => m.sourceId === c.id);
                return (
                  <div className="conversion-mapping" key={c.id}>
                    <label className="editor-field">
                      Replacement for {c.name}
                      <select
                        value=""
                        disabled={
                          workspace.busy ||
                          pending ||
                          (mapping?.targetIds.length ?? 0) >= 16
                        }
                        onChange={(e) => {
                          const id = e.target.value;
                          if (id)
                            setOverrides([
                              ...overrides.filter((m) => m.sourceId !== c.id),
                              {
                                sourceId: c.id,
                                targetIds: [...(mapping?.targetIds ?? []), id],
                              },
                            ]);
                        }}
                      >
                        <option value="">Append a target character</option>
                        {target.data.characters.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} · {t.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {mapping
                        ? mapping.targetIds
                            .map(
                              (id) =>
                                target.data.characters.find((t) => t.id === id)
                                  ?.name,
                            )
                            .join(' → ')
                        : 'Automatic exact transliteration match'}
                    </p>
                    {mapping && (
                      <OutlineButton
                        disabled={workspace.busy || pending}
                        onClick={() =>
                          setOverrides(
                            overrides.filter((m) => m.sourceId !== c.id),
                          )
                        }
                      >
                        Reset mapping
                      </OutlineButton>
                    )}
                  </div>
                );
              })}
          <OutlineButton
            disabled={workspace.busy || pending || !targetId}
            onClick={() =>
              void workspace.run(
                () =>
                  api.convertParagraph(
                    sessionId,
                    paragraph,
                    targetId,
                    overrides,
                  ),
                (result) => setConversion({ key: conversionKey, result }),
              )
            }
          >
            Preview conversion
          </OutlineButton>
          {preview && (
            <div role="status">
              {preview.issues.map((issue, i) => (
                <p className="inline-error" key={i}>
                  {issue}
                </p>
              ))}
              {preview.paragraph && (
                <>
                  <div
                    className="conversion-preview"
                    aria-label="Converted paragraph preview"
                  >
                    {preview.paragraph.units.map((u, i) => (
                      <UnitGlyph
                        key={i}
                        unit={u}
                        characters={target?.data.characters ?? []}
                      />
                    ))}
                  </div>
                  <OutlineButton
                    disabled={workspace.busy || pending}
                    onClick={() => {
                      if (preview.paragraph) {
                        onChange(preview.paragraph);
                        setSelection({ anchor: 0, head: 0 });
                        setTargetId('');
                        setOverrides([]);
                      }
                    }}
                  >
                    Apply conversion to draft
                  </OutlineButton>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
