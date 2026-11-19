import { useCallback, useEffect, useRef, useState } from 'react';
import { PenTool, Plus, Save, Trash2 } from 'lucide-react';
import * as api from '../../bridge/writing';
import { normalizeError } from '../../bridge/application';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  EmptyStateCard,
  OutlineButton,
  SectionHeader,
} from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import type { EditorGuard } from '../projects/editorGuard';
import { ScriptFields } from './ScriptFields';
import { TextExperiment } from './TextExperiment';

export function WritingPage({
  workspace,
  onHome,
  onGuard,
  requestTransition,
}: {
  workspace: WorkspaceController;
  onHome: () => void;
  onGuard: (guard: EditorGuard | null) => void;
  requestTransition: (action: () => Promise<unknown>) => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const revision = workspace.active?.summary.revision;
  const { run, apply, setNotice, setError } = workspace;
  const [list, setList] = useState<{
    key: string;
    items?: api.ScriptSummary[];
    error?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<api.WritingSystem | null>(null);
  const [draft, setDraft] = useState<api.ScriptDraft | null>(null);
  const [pendingInput, setPendingInput] = useState(false);
  const [glyphEditing, setGlyphEditing] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const key = JSON.stringify([sessionId, revision, attempt]);
  const currentList = list?.key === key ? list : null;
  const dirty =
    glyphEditing ||
    pendingInput ||
    (draft !== null && JSON.stringify(draft) !== JSON.stringify(saved?.data));
  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    void api.listScripts(sessionId).then(
      (items) => {
        if (current) setList({ key, items });
      },
      (error: unknown) => {
        if (current) setList({ key, error: normalizeError(error).message });
      },
    );
    return () => {
      current = false;
    };
  }, [sessionId, key]);
  const save = useCallback(async () => {
    if (!draft || !formRef.current || !sessionId) return false;
    if (glyphEditing) {
      setError(
        'Apply or close the glyph editor before saving the writing system.',
      );
      return false;
    }
    if (pendingInput) {
      setError(
        'Insert or clear the pending input before saving. Choose Keep editing if the save dialog is open.',
      );
      return false;
    }
    if (!formRef.current.checkValidity()) {
      setError('Complete the required writing-system fields before saving.');
      if (!document.querySelector('dialog[open]'))
        formRef.current.reportValidity();
      return false;
    }
    return run(
      () => api.saveScript(sessionId, saved, draft),
      (next) => {
        apply(next.workspace);
        setSaved(next.script);
        setDraft(next.script.data);
        setNotice('Writing system and sample text saved.');
      },
    );
  }, [
    draft,
    saved,
    pendingInput,
    glyphEditing,
    sessionId,
    setError,
    run,
    apply,
    setNotice,
  ]);
  const discard = useCallback(() => {
    setDraft(saved?.data ?? null);
    setPendingInput(false);
    setGlyphEditing(false);
    setEpoch((n) => n + 1);
  }, [saved]);
  useEffect(() => {
    onGuard({ dirty, save, discard });
  }, [onGuard, dirty, save, discard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  const select = (id: string) =>
    requestTransition(() =>
      run(
        () => api.loadScript(sessionId, id),
        (script) => {
          setSaved(script);
          setDraft(script.data);
          setPendingInput(false);
          setGlyphEditing(false);
          setEpoch((n) => n + 1);
        },
      ),
    );
  return (
    <div className="writing-page">
      <SectionHeader
        eyebrow="MAKE LANGUAGE VISIBLE"
        title="Writing systems"
        description="Define characters independently of their shapes and try your alphabet."
      >
        {sessionId && (
          <OutlineButton
            icon={Plus}
            tone="accent"
            disabled={workspace.busy}
            onClick={() =>
              requestTransition(async () => {
                workspace.clearMessages();
                setSaved(null);
                setDraft(api.blankScript());
                setPendingInput(false);
                setGlyphEditing(false);
                setEpoch((n) => n + 1);
              })
            }
          >
            New writing system
          </OutlineButton>
        )}
      </SectionHeader>
      <p className="experiment-notice">
        <span className="technical-badge">EXPERIMENTAL · PARTS 05 / 07</span>{' '}
        Alphabet input, glyph editing and native clipboard/IME behavior await
        Linux and Windows verification. Document editing is also experimental.
        Fonts &amp; shaping provides a separate experimental lab; complex-script
        document editing remains planned.
      </p>
      {!sessionId ? (
        <EmptyStateCard icon={PenTool} title="Open a language project">
          <p>Writing systems and their sample text belong to a project.</p>
          <OutlineButton onClick={onHome}>Back to overview</OutlineButton>
        </EmptyStateCard>
      ) : (
        <>
          <section
            className="workspace-card script-list"
            aria-label="Writing systems in this project"
          >
            <h2>Your writing systems</h2>
            {currentList?.error ? (
              <div role="alert">
                <p>{currentList.error}</p>
                <OutlineButton onClick={() => setAttempt((n) => n + 1)}>
                  Retry writing systems
                </OutlineButton>
              </div>
            ) : !currentList?.items ? (
              <p role="status">Loading writing systems…</p>
            ) : currentList.items.length ? (
              <ul>
                {currentList.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={workspace.busy}
                      aria-current={saved?.id === item.id ? 'true' : undefined}
                      onClick={() => select(item.id)}
                    >
                      {item.name}
                      <small>{item.characterCount} characters</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-description">
                No writing systems yet. Create one and add your first character.
              </p>
            )}
          </section>
          {draft && (
            <section
              className="workspace-card script-editor"
              aria-label="Writing-system editor"
            >
              <div className="lexicon-editor-heading">
                <h2>{saved?.data.name || 'New writing system'}</h2>
                <span className="technical-badge">
                  {dirty ? 'UNSAVED' : 'SAVED'}
                </span>
              </div>
              {saved && <p className="entry-id">ID {saved.id}</p>}
              <form
                ref={formRef}
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <fieldset className="project-fields" disabled={workspace.busy}>
                  <ScriptFields
                    key={epoch}
                    draft={draft}
                    onChange={setDraft}
                    workspace={workspace}
                    onGlyphEditing={setGlyphEditing}
                  />
                  <TextExperiment
                    key={epoch}
                    draft={draft}
                    scriptId={saved?.id ?? null}
                    workspace={workspace}
                    onPending={setPendingInput}
                    onChange={(sample) =>
                      setDraft((value) =>
                        value ? { ...value, sample } : value,
                      )
                    }
                  />
                </fieldset>
                <div className="entry-save-bar">
                  <OutlineButton
                    type="submit"
                    icon={Save}
                    tone="accent"
                    disabled={workspace.busy || !dirty}
                  >
                    Save writing system
                  </OutlineButton>
                  <OutlineButton
                    disabled={workspace.busy || !dirty}
                    onClick={() =>
                      requestTransition(async () => {
                        setDraft(null);
                        setSaved(null);
                        setPendingInput(false);
                        setGlyphEditing(false);
                      })
                    }
                  >
                    Discard edits
                  </OutlineButton>
                  {saved && (
                    <OutlineButton
                      icon={Trash2}
                      disabled={workspace.busy}
                      onClick={() => setDeleting(true)}
                    >
                      Delete writing system
                    </OutlineButton>
                  )}
                </div>
              </form>
            </section>
          )}
        </>
      )}
      {deleting && saved && (
        <ConfirmDialog
          title="Delete this writing system?"
          busy={workspace.busy}
          onCancel={() => setDeleting(false)}
        >
          <p className="field-description">
            Delete “{saved.data.name}”, all its characters, glyph variants,
            input mappings, and sample text? Unsaved edits and pending input
            will be discarded. A backup is created before deletion. Linked
            phonemes are retained. Documents assigned to this script block
            deletion; remove or convert those paragraphs first.
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
              Keep writing system
            </OutlineButton>
            <OutlineButton
              disabled={workspace.busy}
              tone="accent"
              onClick={() =>
                void run(
                  () => api.deleteScript(sessionId, saved),
                  (next) => {
                    apply(next);
                    setSaved(null);
                    setDraft(null);
                    setPendingInput(false);
                    setGlyphEditing(false);
                    setDeleting(false);
                    setNotice('Writing system deleted.');
                  },
                )
              }
            >
              Delete writing system
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
