import { useEffect, useState } from 'react';
import * as api from '../../bridge/notebook';
import * as writing from '../../bridge/writing';
import { normalizeError } from '../../bridge/application';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { OutlineButton } from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import { ParagraphEditor } from './ParagraphEditor';

export function DocumentEditor({
  draft,
  workspace,
  onChange,
  pending,
  onPending,
  onUndo,
  onRedo,
}: {
  draft: api.DocumentDraft;
  workspace: WorkspaceController;
  onChange: (draft: api.DocumentDraft) => void;
  pending: boolean;
  onPending: (value: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const sessionId = workspace.active?.sessionId ?? '';
  const revision = workspace.active?.summary.revision;
  const [selected, setSelected] = useState(draft.paragraphs[0]?.id ?? '');
  const [scripts, setScripts] = useState<writing.WritingSystem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [text, setText] = useState<{
    key: string;
    result: writing.Transliteration;
  } | null>(null);
  const textKey = JSON.stringify([draft, revision]);
  const currentText = text?.key === textKey ? text.result : null;
  useEffect(() => {
    let current = true;
    void writing
      .listScripts(sessionId)
      .then((items) =>
        Promise.all(items.map((s) => writing.loadScript(sessionId, s.id))),
      )
      .then(
        (next) => {
          if (current) {
            setScripts(next);
            setError(null);
          }
        },
        (reason: unknown) => {
          if (current) setError(normalizeError(reason).message);
        },
      );
    return () => {
      current = false;
    };
  }, [sessionId, revision, attempt]);
  const active =
    draft.paragraphs.find((p) => p.id === selected) ?? draft.paragraphs[0];
  const index = draft.paragraphs.findIndex((p) => p.id === active?.id);
  const choose = (id: string) => {
    if (pending)
      workspace.setError(
        'Insert or clear pending input before switching paragraphs.',
      );
    else setSelected(id);
  };
  const reorder = (direction: number) => {
    const next = [...draft.paragraphs];
    const item = next[index];
    if (item && index + direction >= 0 && index + direction < next.length) {
      next.splice(index, 1);
      next.splice(index + direction, 0, item);
      onChange({ ...draft, paragraphs: next });
    }
  };
  return (
    <>
      <section className="entry-section">
        <h3>Paragraphs</h3>
        <div className="paragraph-list" aria-label="Document paragraphs">
          {draft.paragraphs.map((p, i) => (
            <button
              type="button"
              key={p.id}
              disabled={workspace.busy}
              aria-current={active?.id === p.id ? 'true' : undefined}
              onClick={() => choose(p.id)}
            >
              Paragraph {i + 1}
              <small>
                {p.units.length} units · {p.links.length} links
              </small>
            </button>
          ))}
        </div>
        <div className="project-action-row">
          <OutlineButton
            disabled={
              workspace.busy || pending || draft.paragraphs.length >= 128
            }
            onClick={() =>
              void workspace.run(
                () => writing.newIdentity(sessionId),
                (id) => {
                  onChange({
                    ...draft,
                    paragraphs: [...draft.paragraphs, api.blankParagraph(id)],
                  });
                  setSelected(id);
                },
              )
            }
          >
            Add paragraph
          </OutlineButton>
          <OutlineButton
            disabled={workspace.busy || pending || index <= 0}
            onClick={() => reorder(-1)}
          >
            Move paragraph up
          </OutlineButton>
          <OutlineButton
            disabled={
              workspace.busy || pending || index >= draft.paragraphs.length - 1
            }
            onClick={() => reorder(1)}
          >
            Move paragraph down
          </OutlineButton>
          <OutlineButton
            disabled={workspace.busy || pending || draft.paragraphs.length <= 1}
            onClick={() => setRemoving(true)}
          >
            Remove paragraph
          </OutlineButton>
        </div>
      </section>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <OutlineButton
            disabled={workspace.busy}
            onClick={() => setAttempt((n) => n + 1)}
          >
            Reload writing systems
          </OutlineButton>
        </div>
      )}
      {!scripts ? (
        <p role="status">Loading writing systems…</p>
      ) : (
        active && (
          <ParagraphEditor
            key={active.id}
            paragraph={active}
            scripts={scripts}
            workspace={workspace}
            onChange={(p) =>
              onChange({
                ...draft,
                paragraphs: draft.paragraphs.map((old) =>
                  old.id === p.id ? p : old,
                ),
              })
            }
            onPending={onPending}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        )
      )}
      <section className="entry-section">
        <h3>Document transliteration</h3>
        <OutlineButton
          disabled={workspace.busy || pending}
          onClick={() =>
            void workspace.run(
              () =>
                api.documentText(sessionId, {
                  kind: 'document',
                  content: draft,
                }),
              (result) => setText({ key: textKey, result }),
            )
          }
        >
          Refresh transliteration
        </OutlineButton>
        {currentText ? (
          <>
            <label className="editor-field">
              Complete transliteration
              <textarea
                readOnly
                value={currentText.text}
                onFocus={(e) => e.target.select()}
              />
            </label>
            {currentText.issues.map((issue, i) => (
              <p className="inline-error" key={i}>
                {issue}
              </p>
            ))}
          </>
        ) : (
          <p className="field-description">
            Refresh after edits to view all paragraphs. Missing mappings
            suppress incomplete output.
          </p>
        )}
      </section>
      {removing && active && (
        <ConfirmDialog
          title="Remove this paragraph?"
          busy={workspace.busy}
          onCancel={() => setRemoving(false)}
        >
          <p>
            Remove paragraph {index + 1}, its text and its lexical annotations
            from this draft? Undo can restore them while this editor remains
            open.
          </p>
          <div className="dialog-actions">
            <OutlineButton onClick={() => setRemoving(false)}>
              Keep paragraph
            </OutlineButton>
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => {
                onChange({
                  ...draft,
                  paragraphs: draft.paragraphs.filter(
                    (p) => p.id !== active.id,
                  ),
                });
                setSelected(
                  draft.paragraphs.find((p) => p.id !== active.id)?.id ?? '',
                );
                setRemoving(false);
              }}
            >
              Remove paragraph
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
