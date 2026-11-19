import { useEffect, useState } from 'react';
import {
  defaultQuery,
  listLexicon,
  loadLexeme,
  type EntryKind,
  type LexiconPage,
} from '../../bridge/lexicon';
import { normalizeError } from '../../bridge/application';
import { EditorField, OutlineButton } from '../../components/primitives';

export function ReferencePicker({
  label,
  sessionId,
  value,
  exclude,
  kind,
  disabled,
  onChange,
}: {
  label: string;
  sessionId: string;
  value: string | null;
  exclude?: string;
  kind?: EntryKind;
  disabled: boolean;
  onChange: (id: string | null) => void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<LexiconPage | null>(null);
  const [selected, setSelected] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!value) return;
    let current = true;
    void loadLexeme(sessionId, value).then(
      (details) => {
        if (current)
          setSelected({ id: value, label: details.entry.data.lemma });
      },
      () => {
        if (current) setSelected({ id: value, label: 'Unavailable entry' });
      },
    );
    return () => {
      current = false;
    };
  }, [value, sessionId]);
  useEffect(() => {
    if (!expanded) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void listLexicon(sessionId, {
        ...defaultQuery,
        text,
        kind: kind ?? null,
        limit: 20,
      }).then(
        (next) => {
          if (current) {
            setResult(next);
            setError(null);
          }
        },
        (reason: unknown) => {
          if (current) {
            setResult(null);
            setError(normalizeError(reason).message);
          }
        },
      );
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [sessionId, text, kind, expanded]);
  return (
    <div className="reference-picker">
      <p className="field-label">{label}</p>
      <div className="project-action-row">
        <span className="language-text">
          {value
            ? selected?.id === value
              ? selected.label
              : 'Loading entry…'
            : 'No entry selected'}
        </span>
        <OutlineButton
          disabled={disabled}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide search' : `Choose ${label.toLowerCase()}`}
        </OutlineButton>
        {value && (
          <OutlineButton
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setSelected(null);
            }}
          >
            Clear
          </OutlineButton>
        )}
      </div>
      {expanded && (
        <div className="reference-results">
          <EditorField
            label={`Search ${label.toLowerCase()}`}
            value={text}
            maxLength={256}
            disabled={disabled}
            onChange={(event) => {
              setText(event.target.value);
              setResult(null);
            }}
          />
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <ul>
            {result?.items
              .filter((item) => item.id !== exclude)
              .map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(item.id);
                      setSelected({ id: item.id, label: item.lemma });
                      setExpanded(false);
                    }}
                  >
                    <span className="language-text">{item.lemma}</span>
                    <small>
                      {item.kind} · {item.partOfSpeech || 'Uncategorized'} ·{' '}
                      {item.definition}
                    </small>
                  </button>
                </li>
              ))}
          </ul>
          <p className="field-description">
            {result
              ? result.total > 20
                ? 'Showing up to 20 results. Refine the search to find another entry.'
                : result.items.filter((item) => item.id !== exclude).length
                  ? 'Choose an entry to link its stable identity.'
                  : 'No matching entries.'
              : error
                ? 'Change the search to retry.'
                : 'Searching…'}
          </p>
        </div>
      )}
    </div>
  );
}
