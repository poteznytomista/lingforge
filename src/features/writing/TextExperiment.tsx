import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import * as api from '../../bridge/writing';
import { normalizeError } from '../../bridge/application';
import { OutlineButton } from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import { CharacterGlyph, UnitGlyph } from './Glyph';

interface Selection {
  anchor: number;
  head: number;
}
interface HistoryItem {
  units: api.TextUnit[];
  selection: Selection;
}
export function TextExperiment({
  draft,
  scriptId,
  workspace,
  onChange,
  onPending,
}: {
  draft: api.ScriptDraft;
  scriptId: string | null;
  workspace: WorkspaceController;
  onChange: (units: api.TextUnit[]) => void;
  onPending: (pending: boolean) => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const projectId = workspace.active?.summary.id ?? '';
  const [input, setInput] = useState('');
  const [literal, setLiteral] = useState(false);
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const [selection, setSelection] = useState<Selection>({ anchor: 0, head: 0 });
  const [past, setPast] = useState<HistoryItem[]>([]);
  const [future, setFuture] = useState<HistoryItem[]>([]);
  const canvas = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    key: string;
    preview?: api.InputPreview;
    conversion?: api.Transliteration;
    error?: string;
  } | null>(null);
  const key = JSON.stringify([draft, input, literal, composing]);
  const current = result?.key === key ? result : null;
  const start = Math.min(selection.anchor, selection.head, draft.sample.length);
  const end = Math.min(
    Math.max(selection.anchor, selection.head),
    draft.sample.length,
  );
  useEffect(() => {
    canvas.current
      ?.querySelector<HTMLElement>('[data-caret="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [selection.head, draft.sample.length]);
  useEffect(() => {
    onPending(input.length > 0 || composing);
  }, [input, composing, onPending]);
  useEffect(() => {
    if (composing || !sessionId || !draft.name.trim()) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all([
        api.previewInput(sessionId, draft, input, false, literal),
        api.transliterate(sessionId, draft, draft.sample),
      ]).then(
        ([preview, conversion]) => {
          if (active) setResult({ key, preview, conversion });
        },
        (error: unknown) => {
          if (active) setResult({ key, error: normalizeError(error).message });
        },
      );
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft, input, literal, composing, sessionId, key]);

  const apply = (units: api.TextUnit[], next: Selection) => {
    if (units.length > 4096) {
      workspace.setError('The experimental text is limited to 4,096 units.');
      return false;
    }
    setPast((items) => [
      ...items.slice(-49),
      { units: draft.sample, selection },
    ]);
    setFuture([]);
    onChange(units);
    setSelection(next);
    return true;
  };
  const insert = (units: api.TextUnit[]) => {
    const caret = start + units.length;
    return apply(
      [...draft.sample.slice(0, start), ...units, ...draft.sample.slice(end)],
      { anchor: caret, head: caret },
    );
  };
  const remove = (backwards: boolean) => {
    const from = start === end && backwards ? Math.max(0, start - 1) : start;
    const to =
      start === end && !backwards
        ? Math.min(draft.sample.length, end + 1)
        : end;
    if (from !== to)
      apply([...draft.sample.slice(0, from), ...draft.sample.slice(to)], {
        anchor: from,
        head: from,
      });
  };
  const restore = (redo: boolean) => {
    const stack = redo ? future : past;
    const item = stack.at(-1);
    if (!item) return;
    if (
      item.units.some(
        (unit) =>
          unit.kind === 'symbol' &&
          !draft.characters.some((c) => c.id === unit.characterId),
      )
    ) {
      workspace.setError(
        'This history step uses a removed character. Restore that character before using this step.',
      );
      return;
    }
    const opposite = { units: draft.sample, selection };
    if (redo) {
      setFuture(stack.slice(0, -1));
      setPast((items) => [...items.slice(-49), opposite]);
    } else {
      setPast(stack.slice(0, -1));
      setFuture((items) => [...items.slice(-49), opposite]);
    }
    onChange(item.units);
    setSelection(item.selection);
  };
  const commit = () => {
    if (!input || workspace.busyRef.current || composingRef.current) return;
    void workspace.run(
      async () => {
        const preview = await api.previewInput(
          sessionId,
          draft,
          input,
          true,
          literal,
        );
        if (preview.pending || preview.issues.length)
          throw {
            code: 'invalid_input',
            message:
              preview.issues.join(' ') || 'Finish the pending input first.',
          };
        return preview.units;
      },
      (units) => {
        if (insert(units)) setInput('');
      },
    );
  };
  const move = (position: number, extend: boolean) =>
    setSelection({
      anchor: extend ? selection.anchor : position,
      head: position,
    });
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
        setSelection({ anchor: 0, head: draft.sample.length });
      }
      if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y') {
        event.preventDefault();
        restore(event.shiftKey || event.key.toLowerCase() === 'y');
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const left = event.key === 'ArrowLeft';
      const position =
        !event.shiftKey && start !== end
          ? left
            ? start
            : end
          : Math.max(
              0,
              Math.min(draft.sample.length, selection.head + (left ? -1 : 1)),
            );
      move(position, event.shiftKey);
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      move(event.key === 'Home' ? 0 : draft.sample.length, event.shiftKey);
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      remove(event.key === 'Backspace');
    }
  };
  const copy = (event: ClipboardEvent, cut: boolean) => {
    if (workspace.busyRef.current || start === end) return;
    event.preventDefault();
    if (!scriptId) {
      workspace.setError(
        'Save the writing system before copying structured text.',
      );
      return;
    }
    try {
      event.clipboardData.setData(
        'text/plain',
        api.encodeClipboard(
          projectId,
          scriptId,
          draft.sample.slice(start, end),
        ),
      );
      if (cut) remove(false);
    } catch {
      workspace.setError(
        'The clipboard could not be written. The selected text was retained.',
      );
    }
  };
  const paste = (event: ClipboardEvent) => {
    event.preventDefault();
    if (workspace.busyRef.current || !scriptId) return;
    const value = event.clipboardData.getData('text/plain');
    void workspace.run(
      async () => {
        const units = api.decodeClipboard(value, projectId, scriptId);
        await api.transliterate(sessionId, draft, units); // Rust validates IDs and complete grapheme units.
        return units;
      },
      (units) => {
        insert(units);
      },
    );
  };
  return (
    <section
      className="entry-section text-experiment"
      aria-label="Alphabet text experiment"
    >
      <h3>Alphabet text experiment</h3>
      <p className="field-description">
        Type into the input field, then insert the resolved sequence at the
        caret. Input remains editable until insertion. This prototype supports
        logical left-to-right order only.
      </p>
      <div className="symbol-palette" aria-label="Insert a character">
        {draft.characters.map((character) => (
          <button
            type="button"
            key={character.id}
            disabled={workspace.busy}
            aria-label={`Insert ${character.name || 'unnamed character'}`}
            onClick={() => {
              insert([{ kind: 'symbol', characterId: character.id }]);
              canvas.current?.focus();
            }}
          >
            <CharacterGlyph character={character} />
            <small>{character.name || 'Unnamed'}</small>
          </button>
        ))}
      </div>
      <div
        ref={canvas}
        className="symbol-canvas"
        role="group"
        aria-label="Structured text"
        tabIndex={0}
        dir="ltr"
        onKeyDown={keys}
        onCopy={(event) => copy(event, false)}
        onCut={(event) => copy(event, true)}
        onPaste={paste}
      >
        {draft.sample.map((unit, index) => (
          <button
            type="button"
            tabIndex={-1}
            key={index}
            disabled={workspace.busy}
            className="text-unit"
            data-newline={unit.kind === 'text' && /^[\r\n]+$/.test(unit.text)}
            data-selected={index >= start && index < end}
            data-caret={selection.head === index}
            aria-label={`Position ${index + 1}: ${unit.kind === 'text' ? (/^[\r\n]+$/.test(unit.text) ? 'Line break' : unit.text) : (draft.characters.find((c) => c.id === unit.characterId)?.name ?? 'missing character')}`}
            onClick={(event) => {
              move(index, event.shiftKey);
              canvas.current?.focus();
            }}
          >
            <UnitGlyph unit={unit} characters={draft.characters} />
          </button>
        ))}
        <button
          type="button"
          tabIndex={-1}
          disabled={workspace.busy}
          className="text-end"
          data-caret={selection.head === draft.sample.length}
          aria-label="Move caret to end"
          onClick={(event) => {
            move(draft.sample.length, event.shiftKey);
            canvas.current?.focus();
          }}
        >
          {draft.sample.length
            ? '│'
            : 'Empty text · insert a character or mapped input'}
        </button>
      </div>
      <p role="status" className="field-description">
        Caret {selection.head} of {draft.sample.length} · {end - start}{' '}
        selected. Arrow keys move; Shift extends; Home/End jump;
        Backspace/Delete remove units. Ctrl+A selects all. Ctrl+C/X/V uses
        LingForge structured text within this saved writing system.
      </p>
      <div className="project-action-row">
        <OutlineButton
          disabled={workspace.busy || !past.length}
          onClick={() => restore(false)}
        >
          Undo text edit
        </OutlineButton>
        <OutlineButton
          disabled={workspace.busy || !future.length}
          onClick={() => restore(true)}
        >
          Redo text edit
        </OutlineButton>
        <OutlineButton
          disabled={workspace.busy || start === end}
          onClick={() => remove(false)}
        >
          Delete selection
        </OutlineButton>
      </div>
      <label className="editor-field">
        Input
        <textarea
          value={input}
          maxLength={4096}
          disabled={workspace.busy}
          onChange={(event) => setInput(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
            setComposing(true);
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            setComposing(false);
            setInput(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              !composingRef.current
            ) {
              event.preventDefault();
              commit();
            }
          }}
        />
      </label>
      <label className="lexicon-checkbox">
        <input
          type="checkbox"
          checked={literal}
          disabled={workspace.busy || composing}
          onChange={(event) => setLiteral(event.target.checked)}
        />
        Insert literal Unicode text
      </label>
      <p className="field-description">
        Mappings use exact, case-sensitive longest matches. A prefix such as “t”
        waits if “th” is possible; Insert commits the shorter exact match.
        Spaces delimit input and are retained. Equal inputs with different
        outputs require a choice. IME composition finishes before conversion.
        Shift+Enter adds a newline.
      </p>
      <div className="input-feedback" role="status">
        {composing ? (
          'Composition in progress…'
        ) : current?.error ? (
          current.error
        ) : current?.preview ? (
          <>
            <span>{current.preview.units.length} resolved units</span>
            {current.preview.pending && (
              <span>Pending: {current.preview.pending}</span>
            )}
            {current.preview.issues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
          </>
        ) : (
          'Complete the writing-system fields to preview input.'
        )}
      </div>
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
      <label className="editor-field">
        Transliteration
        <textarea
          readOnly
          value={current?.conversion?.text ?? ''}
          onFocus={(event) => event.target.select()}
        />
      </label>
      {current?.conversion?.issues.map((issue) => (
        <p className="inline-error" key={issue}>
          {issue}
        </p>
      ))}
      <p className="field-description">
        Copy transliteration from this field for other apps. It loses character
        identity and may not map back uniquely. Structured copy preserves IDs.
        Text undo keeps the last 50 edits in this editor session; saved text
        survives reopening, undo history does not.
      </p>
    </section>
  );
}
