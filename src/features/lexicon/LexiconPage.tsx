import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Plus, Upload } from 'lucide-react';
import * as api from '../../bridge/lexicon';
import { normalizeError } from '../../bridge/application';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  EditorField,
  EmptyStateCard,
  OutlineButton,
  SectionHeader,
} from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import { EntryEditor } from './EntryEditor';
import { TransferDialog } from './TransferDialog';
import type { EditorGuard } from '../projects/editorGuard';

export function LexiconPage({
  workspace,
  onHome,
  onGuard,
  requestTransition,
  initialEntryId,
}: {
  workspace: WorkspaceController;
  onHome: () => void;
  onGuard: (guard: EditorGuard | null) => void;
  requestTransition: (action: () => Promise<unknown>) => void;
  initialEntryId?: string | null;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const revision = workspace.active?.summary.revision;
  const { run, apply, setNotice, setError } = workspace;
  const [query, setQuery] = useState(api.defaultQuery);
  const [page, setPage] = useState<api.LexiconPage | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [details, setDetails] = useState<api.LexemeDetails | null>(null);
  const [draft, setDraft] = useState<api.LexemeDraft | null>(null);
  const [transfer, setTransfer] = useState<'import' | 'export' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const selectionGeneration = useRef(0);
  const dirty =
    draft !== null &&
    (details === null ||
      JSON.stringify(draft) !== JSON.stringify(details.entry.data));

  useEffect(() => {
    if (!sessionId || !initialEntryId) return;
    let current = true;
    const generation = ++selectionGeneration.current;
    void api.loadLexeme(sessionId, initialEntryId).then(
      (next) => {
        if (current && generation === selectionGeneration.current) {
          setDetails(next);
          setDraft(next.entry.data);
        }
      },
      (reason: unknown) => {
        if (current && generation === selectionGeneration.current)
          setError(normalizeError(reason).message);
      },
    );
    return () => {
      current = false;
    };
  }, [sessionId, initialEntryId, setError]);

  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void api.listLexicon(sessionId, query).then(
        (next) => {
          if (!current) return;
          if (next.total > 0 && query.offset >= next.total) {
            setQuery((previous) => ({
              ...previous,
              offset:
                Math.floor((next.total - 1) / previous.limit) * previous.limit,
            }));
            return;
          }
          if (next.total === 0 && query.offset !== 0) {
            setQuery((previous) => ({ ...previous, offset: 0 }));
            return;
          }
          setPage(next);
          setListError(null);
        },
        (reason: unknown) => {
          if (current) {
            setPage(null);
            setListError(normalizeError(reason).message);
          }
        },
      );
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [sessionId, revision, query, attempt]);

  const save = useCallback(async () => {
    if (!draft || !sessionId || !formRef.current) return false;
    if (!formRef.current.checkValidity()) {
      setError(
        'Complete the required entry fields. Choose Keep editing to return to the editor.',
      );
      if (!document.querySelector('dialog[open]'))
        formRef.current.reportValidity();
      return false;
    }
    return run(
      () => api.saveLexeme(sessionId, details?.entry ?? null, draft),
      (saved) => {
        apply(saved.workspace);
        setDetails(saved.details);
        setDraft(saved.details.entry.data);
        setNotice('Entry saved.');
      },
    );
  }, [draft, sessionId, details, run, apply, setNotice, setError]);
  const discard = useCallback(() => {
    setDraft(details?.entry.data ?? null);
  }, [details]);
  useEffect(() => {
    onGuard({ dirty, save, discard });
  }, [onGuard, dirty, save, discard]);
  useEffect(() => () => onGuard(null), [onGuard]);

  const select = (id: string) =>
    requestTransition(() => {
      selectionGeneration.current += 1;
      return run(
        () => api.loadLexeme(sessionId, id),
        (next) => {
          setDetails(next);
          setDraft(next.entry.data);
        },
      );
    });
  const changeQuery = (change: Partial<api.LexiconQuery>) => {
    setPage(null);
    setListError(null);
    setQuery({ ...query, ...change, offset: change.offset ?? 0 });
  };
  const openTransfer = (mode: 'import' | 'export') =>
    requestTransition(async () => {
      selectionGeneration.current += 1;
      workspace.clearMessages();
      setTransfer(mode);
    });

  return (
    <div className="lexicon-page">
      <SectionHeader
        eyebrow="WORDS AND THEIR CONNECTIONS"
        title="Lexicon"
        description="Meanings, roots, and the forms your language takes."
      >
        {sessionId && (
          <div className="project-action-row">
            <OutlineButton
              icon={Upload}
              disabled={workspace.busy}
              onClick={() => openTransfer('import')}
            >
              Import
            </OutlineButton>
            <OutlineButton
              icon={Download}
              disabled={workspace.busy}
              onClick={() => openTransfer('export')}
            >
              Export
            </OutlineButton>
            <OutlineButton
              icon={Plus}
              tone="accent"
              disabled={workspace.busy}
              onClick={() =>
                requestTransition(async () => {
                  selectionGeneration.current += 1;
                  workspace.clearMessages();
                  setDetails(null);
                  setDraft(api.blankEntry());
                })
              }
            >
              New entry
            </OutlineButton>
          </div>
        )}
      </SectionHeader>
      {!sessionId ? (
        <EmptyStateCard icon={BookOpen} title="Open a language project">
          <p>
            Your dictionary belongs to a project. Create or open one from the
            overview.
          </p>
          <OutlineButton onClick={onHome}>Back to overview</OutlineButton>
        </EmptyStateCard>
      ) : (
        <>
          <section className="lexicon-toolbar" aria-label="Lexicon filters">
            <EditorField
              label="Search lexicon"
              value={query.text}
              maxLength={256}
              placeholder="Headwords, definitions, pronunciation, notes…"
              onChange={(event) => changeQuery({ text: event.target.value })}
            />
            <div className="lexicon-filters">
              <label className="editor-field">
                Kind
                <select
                  value={query.kind ?? ''}
                  onChange={(event) =>
                    changeQuery({
                      kind: (event.target.value ||
                        null) as api.EntryKind | null,
                    })
                  }
                >
                  <option value="">All entries</option>
                  <option value="lexeme">Lexical entries</option>
                  <option value="root">Roots</option>
                </select>
              </label>
              <EditorField
                label="Category filter"
                value={query.partOfSpeech}
                list="lexicon-categories"
                maxLength={120}
                placeholder="Any category"
                onChange={(event) =>
                  changeQuery({ partOfSpeech: event.target.value })
                }
              />
              <datalist id="lexicon-categories">
                {page?.categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <label className="editor-field">
                Sort
                <select
                  value={`${query.sort}:${query.descending}`}
                  onChange={(event) => {
                    const [sort, descending] = event.target.value.split(':');
                    changeQuery({
                      sort: sort as api.LexiconQuery['sort'],
                      descending: descending === 'true',
                    });
                  }}
                >
                  <option value="lemma:false">Headword · ascending</option>
                  <option value="lemma:true">Headword · descending</option>
                  <option value="updated:true">Recently updated</option>
                  <option value="updated:false">Oldest update</option>
                </select>
              </label>
              <label className="lexicon-checkbox">
                <input
                  type="checkbox"
                  checked={query.ignoreMarks}
                  onChange={(event) =>
                    changeQuery({ ignoreMarks: event.target.checked })
                  }
                />
                Ignore combining marks
              </label>
            </div>
            <p className="field-description">
              Search ignores case and matches canonically equivalent Unicode.
              Accents remain distinct unless “Ignore combining marks” is
              selected. Category filtering matches the exact label.
            </p>
          </section>
          <div className="lexicon-columns">
            <section
              className="workspace-card lexicon-list"
              aria-label="Lexicon entries"
            >
              <div className="lexicon-list-heading">
                <h2>Entries</h2>
                <span className="mono-label" role="status">
                  {page
                    ? `${page.total.toLocaleString()} MATCHES`
                    : listError
                      ? 'UNAVAILABLE'
                      : 'LOADING…'}
                </span>
              </div>
              {listError && (
                <div className="inline-error" role="alert">
                  <p>{listError}</p>
                  <OutlineButton
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    Retry list
                  </OutlineButton>
                </div>
              )}
              {page && page.items.length === 0 && (
                <p className="lexicon-empty">
                  {query.text || query.partOfSpeech || query.kind
                    ? 'No entries match these filters. Try a broader search.'
                    : 'Your lexicon is empty. Add an entry or import a dictionary to begin.'}
                </p>
              )}
              <ul>
                {page?.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={
                        details?.entry.id === item.id ? 'true' : undefined
                      }
                      disabled={workspace.busy}
                      onClick={() => select(item.id)}
                    >
                      <span className="lexicon-row-title">
                        <strong className="language-text">{item.lemma}</strong>
                        <small>
                          {item.kind === 'root'
                            ? 'ROOT'
                            : item.partOfSpeech || 'ENTRY'}
                        </small>
                      </span>
                      {item.pronunciation && (
                        <span className="lexicon-pronunciation language-text">
                          {item.pronunciation}
                        </span>
                      )}
                      <span className="lexicon-definition">
                        {item.definition}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="lexicon-pagination">
                <OutlineButton
                  disabled={!page || query.offset === 0}
                  onClick={() =>
                    changeQuery({
                      offset: Math.max(0, query.offset - query.limit),
                    })
                  }
                >
                  Previous
                </OutlineButton>
                <span>
                  {page
                    ? `${page.total ? page.offset + 1 : 0}–${Math.min(page.offset + page.limit, page.total)} / ${page.total}`
                    : '…'}
                </span>
                <OutlineButton
                  disabled={!page || query.offset + query.limit >= page.total}
                  onClick={() =>
                    changeQuery({ offset: query.offset + query.limit })
                  }
                >
                  Next
                </OutlineButton>
              </div>
            </section>
            {draft ? (
              <EntryEditor
                draft={draft}
                details={details}
                sessionId={sessionId}
                projectRevision={revision}
                busy={workspace.busy}
                dirty={dirty}
                formRef={formRef}
                onChange={setDraft}
                onSave={() => void save()}
                onDiscard={() =>
                  requestTransition(async () => {
                    setDetails(null);
                    setDraft(null);
                  })
                }
                onDelete={() => setDeleting(true)}
                onSelect={select}
              />
            ) : (
              <section className="workspace-card lexicon-detail-empty">
                <BookOpen size={30} aria-hidden="true" />
                <h2>A place for every meaning</h2>
                <p>
                  Select an entry to inspect its senses and connections, or
                  create a new one.
                </p>
                <p className="field-description">
                  Use Tab to move between controls, Enter to select an entry,
                  and Ctrl+S to save your draft.
                </p>
              </section>
            )}
          </div>
        </>
      )}
      {transfer && (
        <TransferDialog
          mode={transfer}
          sessionId={sessionId}
          workspace={workspace}
          onClose={() => setTransfer(null)}
          onImported={() => {
            setDetails(null);
            setDraft(null);
            setPage(null);
          }}
        />
      )}
      {deleting && details && (
        <ConfirmDialog
          title="Delete this entry?"
          busy={workspace.busy}
          onCancel={() => setDeleting(false)}
        >
          <p className="field-description">
            Delete “{details.entry.data.lemma}”, its senses, forms, and outgoing
            links? Unsaved edits will be discarded. A backup will be created
            before deletion. Incoming references block deletion.
          </p>
          {workspace.error && (
            <p className="inline-error" role="alert">
              {workspace.error}
            </p>
          )}
          <div className="dialog-actions">
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => setDeleting(false)}
            >
              Keep entry
            </OutlineButton>
            <OutlineButton
              disabled={workspace.busy}
              tone="accent"
              onClick={() =>
                void run(
                  () => api.deleteLexeme(sessionId, details.entry),
                  (next) => {
                    apply(next);
                    setDetails(null);
                    setDraft(null);
                    setDeleting(false);
                    setPage(null);
                    setNotice('Entry deleted.');
                  },
                )
              }
            >
              Delete entry
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
