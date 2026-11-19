import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, Save, Trash2 } from 'lucide-react';
import * as api from '../../bridge/notebook';
import { newIdentity } from '../../bridge/writing';
import { normalizeError } from '../../bridge/application';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  EditorField,
  EmptyStateCard,
  OutlineButton,
  SectionHeader,
} from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import type { EditorGuard } from '../projects/editorGuard';
import { DocumentEditor } from './DocumentEditor';
import { GrammarEditor } from './GrammarEditor';

// History includes text, stable paragraph identities and lexical annotations.
// It is session-local and bounded by both step count and serialized size.
function boundedHistory(items: api.NotebookDraft[]): api.NotebookDraft[] {
  let size = 0;
  const result: api.NotebookDraft[] = [];
  for (const item of items.slice(-30).reverse()) {
    size += JSON.stringify(item).length * 2;
    if (size > 16 * 1024 * 1024) break;
    result.unshift(item);
  }
  return result;
}
export function NotebookPage({
  kind,
  workspace,
  onHome,
  onGuard,
  requestTransition,
}: {
  kind: api.RecordKind;
  workspace: WorkspaceController;
  onHome: () => void;
  onGuard: (guard: EditorGuard | null) => void;
  requestTransition: (action: () => Promise<unknown>) => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const revision = workspace.active?.summary.revision;
  const { run, apply, setError, setNotice } = workspace;
  const [list, setList] = useState<{
    key: string;
    items?: api.RecordSummary[];
    error?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [id, setId] = useState('');
  const [saved, setSaved] = useState<api.NotebookRecord | null>(null);
  const [draft, setDraft] = useState<api.NotebookDraft | null>(null);
  const [past, setPast] = useState<api.NotebookDraft[]>([]);
  const [future, setFuture] = useState<api.NotebookDraft[]>([]);
  const [pendingInput, setPendingInput] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<
    'structured' | 'plain' | 'transliteration'
  >('structured');
  const [search, setSearch] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const label = kind === 'document' ? 'document' : 'grammar section';
  const dirty =
    pendingInput ||
    (draft !== null && JSON.stringify(draft) !== JSON.stringify(saved?.data));
  const key = JSON.stringify([sessionId, revision, kind, attempt]);
  const currentList = list?.key === key ? list : null;
  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    void api.listRecords(sessionId, kind).then(
      (items) => {
        if (current) setList({ key, items });
      },
      (reason: unknown) => {
        if (current) setList({ key, error: normalizeError(reason).message });
      },
    );
    return () => {
      current = false;
    };
  }, [sessionId, kind, key]);
  const reset = (
    recordId: string,
    base: api.NotebookRecord | null,
    data: api.NotebookDraft | null,
  ) => {
    setId(recordId);
    setSaved(base);
    setDraft(data);
    setPast([]);
    setFuture([]);
    setPendingInput(false);
    setEpoch((n) => n + 1);
  };
  const change = (next: api.NotebookDraft) => {
    if (!draft || JSON.stringify(next) === JSON.stringify(draft)) return;
    setPast((items) => boundedHistory([...items, draft]));
    setFuture([]);
    setDraft(next);
  };
  const restore = (redo: boolean) => {
    if (workspace.busyRef.current || pendingInput || !draft) return;
    const stack = redo ? future : past;
    const next = stack.at(-1);
    if (!next) return;
    if (redo) {
      setFuture(stack.slice(0, -1));
      setPast((items) => boundedHistory([...items, draft]));
    } else {
      setPast(stack.slice(0, -1));
      setFuture((items) => boundedHistory([...items, draft]));
    }
    setDraft(next);
    setEpoch((n) => n + 1);
  };
  const save = useCallback(async () => {
    if (!draft || !sessionId || !id || !formRef.current) return false;
    if (pendingInput) {
      setError(
        'Insert or clear pending input before saving. Choose Keep editing if the save dialog is open.',
      );
      return false;
    }
    if (!formRef.current.checkValidity()) {
      setError('Complete the required fields before saving.');
      if (!document.querySelector('dialog[open]'))
        formRef.current.reportValidity();
      return false;
    }
    return run(
      () => api.saveRecord(sessionId, id, saved?.revision ?? null, draft),
      (next) => {
        apply(next.workspace);
        setSaved(next.record);
        setDraft(next.record.data);
        setNotice(
          `${kind === 'document' ? 'Document' : 'Grammar section'} saved. Changed saves create a project snapshot before committing.`,
        );
      },
    );
  }, [
    draft,
    sessionId,
    id,
    pendingInput,
    saved,
    kind,
    run,
    apply,
    setError,
    setNotice,
  ]);
  const discard = useCallback(() => {
    setDraft(saved?.data ?? null);
    setPast([]);
    setFuture([]);
    setPendingInput(false);
    setEpoch((n) => n + 1);
  }, [saved]);
  useEffect(() => {
    onGuard({ dirty, save, discard });
  }, [onGuard, dirty, save, discard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  const create = () =>
    requestTransition(() =>
      run(
        async () => {
          const recordId = await newIdentity(sessionId);
          const data: api.NotebookDraft =
            kind === 'document'
              ? {
                  kind,
                  content: {
                    title: '',
                    notes: '',
                    paragraphs: [
                      api.blankParagraph(await newIdentity(sessionId)),
                    ],
                  },
                }
              : { kind, content: api.blankGrammar() };
          return { recordId, data };
        },
        ({ recordId, data }) => reset(recordId, null, data),
      ),
    );
  const importFile = () =>
    requestTransition(() =>
      run(
        async () => {
          const result = await api.chooseImport(sessionId);
          if (result && result.record.data.kind !== kind)
            throw {
              code: 'invalid_input',
              message: `Open ${result.record.data.kind === 'document' ? 'Documents' : 'Grammar'} to review this file.`,
            };
          return result;
        },
        (result) => {
          if (result) {
            reset(result.record.id, result.existing, result.record.data);
            setNotice(
              `Imported content is an unsaved draft. ${result.existing ? 'Saving will replace the current record with this identity after a backup.' : 'Saving will create this record with its original identity.'} Review it before saving.`,
            );
          }
        },
      ),
    );
  const shown = currentList?.items?.filter((item) =>
    item.title
      .normalize('NFC')
      .toLowerCase()
      .includes(search.normalize('NFC').toLowerCase()),
  );
  return (
    <div className="notebook-page">
      <SectionHeader
        eyebrow={
          kind === 'document' ? 'LANGUAGE IN USE' : 'DESCRIBE YOUR LANGUAGE'
        }
        title={kind === 'document' ? 'Documents' : 'Grammar'}
        description={
          kind === 'document'
            ? 'Compose paragraphs, consult lexical entries and review orthography.'
            : 'Document features, examples and the patterns in your language.'
        }
      >
        {sessionId && (
          <div className="project-action-row">
            <OutlineButton disabled={workspace.busy} onClick={importFile}>
              Review structured file
            </OutlineButton>
            <OutlineButton
              icon={Plus}
              tone="accent"
              disabled={workspace.busy}
              onClick={create}
            >
              New {label}
            </OutlineButton>
          </div>
        )}
      </SectionHeader>
      <p className="experiment-notice">
        <span className="technical-badge">EXPERIMENTAL · PART 06</span>{' '}
        Documents and grammar await native validation. Alphabet input retains
        the Part 5 limitations: logical left-to-right units, staged composition,
        and no complex shaping.
      </p>
      {!sessionId ? (
        <EmptyStateCard icon={BookOpen} title="Open a language project">
          <p>Documents and grammar are stored with your language.</p>
          <OutlineButton onClick={onHome}>Back to overview</OutlineButton>
        </EmptyStateCard>
      ) : (
        <>
          <section
            className="workspace-card notebook-list"
            aria-label={`Saved ${label} list`}
          >
            <EditorField
              label={`Find ${kind === 'document' ? 'documents' : 'grammar sections'}`}
              value={search}
              maxLength={160}
              onChange={(e) => setSearch(e.target.value)}
            />
            {currentList?.error ? (
              <div role="alert">
                <p>{currentList.error}</p>
                <OutlineButton onClick={() => setAttempt((n) => n + 1)}>
                  Retry list
                </OutlineButton>
              </div>
            ) : !shown ? (
              <p role="status">Loading…</p>
            ) : shown.length ? (
              <ul>
                {shown.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={workspace.busy}
                      aria-current={id === item.id ? 'true' : undefined}
                      onClick={() =>
                        requestTransition(() =>
                          run(
                            () => api.loadRecord(sessionId, item.id),
                            (record) => reset(record.id, record, record.data),
                          ),
                        )
                      }
                    >
                      {item.title}
                      <small>{item.id.slice(0, 8)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-description">
                {search
                  ? 'No matching titles.'
                  : `No ${kind === 'document' ? 'documents' : 'grammar sections'} yet.`}
              </p>
            )}
          </section>
          {draft && (
            <section
              className="workspace-card notebook-editor"
              aria-label={`${kind === 'document' ? 'Document' : 'Grammar'} editor`}
            >
              <div className="lexicon-editor-heading">
                <h2>{saved?.data.content.title || `New ${label}`}</h2>
                <span className="technical-badge">
                  {dirty ? 'UNSAVED' : 'SAVED'}
                </span>
              </div>
              <p className="entry-id">ID {id}</p>
              <form
                ref={formRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <fieldset disabled={workspace.busy} className="project-fields">
                  <EditorField
                    label="Title"
                    required
                    maxLength={160}
                    value={draft.content.title}
                    onChange={(e) =>
                      change(
                        draft.kind === 'document'
                          ? {
                              ...draft,
                              content: {
                                ...draft.content,
                                title: e.target.value,
                              },
                            }
                          : {
                              ...draft,
                              content: {
                                ...draft.content,
                                title: e.target.value,
                              },
                            },
                      )
                    }
                  />
                  <label className="editor-field">
                    {kind === 'document'
                      ? 'Document notes'
                      : 'Section description'}
                    <textarea
                      maxLength={kind === 'document' ? 20000 : 40000}
                      value={draft.content.notes}
                      onChange={(e) =>
                        change(
                          draft.kind === 'document'
                            ? {
                                ...draft,
                                content: {
                                  ...draft.content,
                                  notes: e.target.value,
                                },
                              }
                            : {
                                ...draft,
                                content: {
                                  ...draft.content,
                                  notes: e.target.value,
                                },
                              },
                        )
                      }
                    />
                  </label>
                  <div className="project-action-row">
                    <OutlineButton
                      disabled={workspace.busy || pendingInput || !past.length}
                      onClick={() => restore(false)}
                    >
                      Undo record edit
                    </OutlineButton>
                    <OutlineButton
                      disabled={
                        workspace.busy || pendingInput || !future.length
                      }
                      onClick={() => restore(true)}
                    >
                      Redo record edit
                    </OutlineButton>
                  </div>
                  <p className="field-description">
                    Undo includes text and links, up to 30 edits within a 16 MiB
                    budget per history direction while this editor is open.
                    History does not survive closing or switching records. Saved
                    snapshots remain available through Recover copy on the
                    overview; unsaved drafts are not crash recovery.
                  </p>
                  {draft.kind === 'document' ? (
                    <DocumentEditor
                      key={epoch}
                      draft={draft.content}
                      workspace={workspace}
                      pending={pendingInput}
                      onPending={setPendingInput}
                      onChange={(content) =>
                        change({ kind: 'document', content })
                      }
                      onUndo={() => restore(false)}
                      onRedo={() => restore(true)}
                    />
                  ) : (
                    <GrammarEditor
                      key={epoch}
                      draft={draft.content}
                      workspace={workspace}
                      onChange={(content) =>
                        change({ kind: 'grammar', content })
                      }
                    />
                  )}
                </fieldset>
                <div className="entry-save-bar">
                  <OutlineButton
                    type="submit"
                    icon={Save}
                    tone="accent"
                    disabled={workspace.busy || !dirty}
                  >
                    Save {label}
                  </OutlineButton>
                  <OutlineButton
                    disabled={workspace.busy || !dirty}
                    onClick={() =>
                      requestTransition(async () => reset('', null, null))
                    }
                  >
                    Close draft
                  </OutlineButton>
                  {saved && (
                    <>
                      <OutlineButton
                        disabled={workspace.busy || dirty}
                        onClick={() => {
                          setFormat('structured');
                          setExporting(true);
                        }}
                      >
                        Export saved {label}
                      </OutlineButton>
                      <OutlineButton
                        icon={Trash2}
                        disabled={workspace.busy}
                        onClick={() => setDeleting(true)}
                      >
                        Delete {label}
                      </OutlineButton>
                    </>
                  )}
                </div>
              </form>
            </section>
          )}
        </>
      )}
      {deleting && saved && (
        <ConfirmDialog
          title={`Delete this ${label}?`}
          busy={workspace.busy}
          onCancel={() => setDeleting(false)}
        >
          <p>
            Delete “{saved.data.content.title}” and all its owned text,
            annotations and descriptions? Unsaved edits will be discarded.
            Referenced dictionary entries, sounds and writing systems remain. A
            project snapshot is required before deletion.
          </p>
          {workspace.error && (
            <p role="alert" className="inline-error">
              {workspace.error}
            </p>
          )}
          <div className="dialog-actions">
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => setDeleting(false)}
            >
              Keep {label}
            </OutlineButton>
            <OutlineButton
              disabled={workspace.busy}
              onClick={() =>
                void run(
                  () => api.deleteRecord(sessionId, saved),
                  (next) => {
                    apply(next);
                    reset('', null, null);
                    setDeleting(false);
                    setNotice(`${label} deleted.`);
                  },
                )
              }
            >
              Delete {label}
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
      {exporting && saved && (
        <ConfirmDialog
          title={`Export saved ${label}`}
          busy={workspace.busy}
          onCancel={() => setExporting(false)}
        >
          <label className="editor-field">
            Export format
            <select
              value={format}
              disabled={workspace.busy}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              <option value="structured">Structured JSON</option>
              {kind === 'document' && (
                <>
                  <option value="plain">Literal plain text</option>
                  <option value="transliteration">Transliteration</option>
                </>
              )}
            </select>
          </label>
          <p className="field-description">
            {format === 'structured'
              ? 'Preserves this complete record and its stable references. Dependencies remain in this project; this file can be reviewed and saved only into the same project identity. Use Export archive on the overview to move the entire language, including scripts, glyphs and linked entries, to another computer.'
              : 'Text exports contain paragraph text only, separated by blank lines. They omit title, notes, lexical links, identities and glyphs. Literal plain text rejects custom symbols. Transliteration rejects missing mappings and cannot guarantee a reversible spelling.'}
          </p>
          {workspace.error && (
            <p role="alert" className="inline-error">
              {workspace.error}
            </p>
          )}
          <div className="dialog-actions">
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => setExporting(false)}
            >
              Cancel
            </OutlineButton>
            <OutlineButton
              disabled={workspace.busy}
              onClick={() =>
                void run(
                  () => api.exportRecord(sessionId, saved, format),
                  (path) => {
                    if (path) {
                      setNotice(`Saved ${label} exported to ${path}`);
                      setExporting(false);
                    }
                  },
                )
              }
            >
              Choose new filename & export
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
