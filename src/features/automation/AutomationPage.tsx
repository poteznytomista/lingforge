import { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, Save, Trash2 } from 'lucide-react';
import * as api from '../../bridge/automation';
import { loadLexeme } from '../../bridge/lexicon';
import { normalizeError } from '../../bridge/application';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  EmptyStateCard,
  OutlineButton,
  SectionHeader,
} from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import type { EditorGuard } from '../projects/editorGuard';
import { ReferencePicker } from '../lexicon/ReferencePicker';
import { ProgramFields } from './ProgramFields';
import { Results } from './Results';

export function AutomationPage({
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
  const projectRevision = workspace.active?.summary.revision;
  const { run, apply, setError, setNotice } = workspace;
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([sessionId, projectRevision, attempt]);
  const [index, setIndex] = useState<{
    key: string;
    data?: api.AutomationIndex;
    error?: string;
  } | null>(null);
  const current = index?.key === key ? index : null;
  const [program, setProgram] = useState<api.Program | null>(null);
  const [draft, setDraft] = useState<api.ProgramDraft | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [entry, setEntry] = useState<string | null>(null);
  const [entries, setEntries] = useState<{ id: string; label: string }[]>([]);
  const [cells, setCells] = useState<string[]>([]);
  const [preview, setPreview] = useState<api.Preview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [batch, setBatch] = useState<api.Batch | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: 'program' | 'batch';
    id: string;
  } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(program?.data);
  const freshPreview =
    preview?.projectRevision === projectRevision ? preview : null;
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    void api.loadIndex(sessionId).then(
      (data) => {
        if (active) setIndex({ key, data });
      },
      (e: unknown) => {
        if (active) setIndex({ key, error: normalizeError(e).message });
      },
    );
    return () => {
      active = false;
    };
  }, [sessionId, key]);
  const clearPreview = () => {
    setPreview(null);
    setSelected([]);
  };
  const change = (data: api.ProgramDraft) => {
    setDraft(data);
    clearPreview();
  };
  const save = useCallback(async () => {
    if (
      !draft ||
      !api.isProgramDraft(draft) ||
      !form.current?.checkValidity()
    ) {
      setError(
        'Complete the program fields, numeric bounds and reference selections before saving.',
      );
      return false;
    }
    return run(
      () => api.saveProgram(sessionId, program, draft),
      (next) => {
        setProgram(next.program);
        setDraft(next.program.data);
        setCells(next.program.data.cells.map((c) => c.id));
        setPreview(null);
        setSelected([]);
        apply(next.workspace);
        setNotice('Rule program saved.');
      },
    );
  }, [draft, program, sessionId, run, apply, setError, setNotice]);
  const discard = useCallback(() => {
    setDraft(program?.data ?? null);
    setPreview(null);
    setSelected([]);
    setEpoch((n) => n + 1);
  }, [program]);
  useEffect(() => {
    onGuard({ dirty, save, discard });
  }, [onGuard, dirty, save, discard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  const choose = (next: api.Program | null) => {
    setProgram(next);
    setDraft(next?.data ?? api.blankProgram());
    setEntry(null);
    setEntries([]);
    setCells(next?.data.cells.map((c) => c.id) ?? []);
    clearPreview();
    setEpoch((n) => n + 1);
  };
  return (
    <div className="automation-page">
      <SectionHeader
        eyebrow="MORPHOLOGY AND SOUND CHANGE"
        title="Rules & analysis"
        description="Build explicit derivations, compare their consequences and preserve how every generated form was made."
      />
      <p className="experiment-notice">
        <span className="technical-badge">EXPERIMENTAL · PART 09</span> Bounded
        Unicode rules and saved generation batches. Native behavior and results
        remain unverified. Generated forms are separate from authored lexicon
        forms; applying a batch preserves your original entries.
      </p>
      {!sessionId ? (
        <EmptyStateCard icon={GitBranch} title="Open a language project">
          <p>Rule programs and generation batches belong to a saved project.</p>
          <OutlineButton onClick={onHome}>Back to overview</OutlineButton>
        </EmptyStateCard>
      ) : (
        <>
          <section
            className="workspace-card automation-list"
            aria-label="Rule programs"
          >
            <h2>Rule programs</h2>
            <OutlineButton
              disabled={
                workspace.busy || (current?.data?.programs.length ?? 0) >= 32
              }
              onClick={() => requestTransition(async () => choose(null))}
            >
              New rule program
            </OutlineButton>
            {current?.error ? (
              <div role="alert">
                <p>{current.error}</p>
                <OutlineButton onClick={() => setAttempt((n) => n + 1)}>
                  Retry programs
                </OutlineButton>
              </div>
            ) : !current?.data ? (
              <p role="status">Loading programs…</p>
            ) : current.data.programs.length ? (
              <ul>
                {current.data.programs.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={workspace.busy}
                      aria-current={program?.id === p.id ? 'true' : undefined}
                      onClick={() =>
                        requestTransition(() =>
                          run(() => api.loadProgram(sessionId, p.id), choose),
                        )
                      }
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No saved rule programs. Create a program, add rules and define
                at least one paradigm cell.
              </p>
            )}
          </section>
          {draft && (
            <section className="workspace-card automation-editor">
              <div className="lexicon-editor-heading">
                <h2>{draft.name || 'New rule program'}</h2>
                <span className="technical-badge">
                  {dirty ? 'UNSAVED PROGRAM' : 'SAVED PROGRAM'}
                </span>
              </div>
              <form
                noValidate
                ref={form}
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <fieldset className="project-fields" disabled={workspace.busy}>
                  <ProgramFields
                    key={epoch}
                    data={draft}
                    sessionId={sessionId}
                    busy={workspace.busy}
                    make={(use) => {
                      void run(() => api.newIdentity(sessionId), use);
                    }}
                    onChange={change}
                  />
                  <div className="entry-save-bar">
                    <OutlineButton
                      type="submit"
                      icon={Save}
                      tone="accent"
                      disabled={!dirty}
                    >
                      Save rule program
                    </OutlineButton>
                    <OutlineButton
                      onClick={() =>
                        requestTransition(async () => {
                          setDraft(null);
                          setProgram(null);
                          clearPreview();
                        })
                      }
                    >
                      Close program
                    </OutlineButton>
                    {program && (
                      <OutlineButton
                        icon={Trash2}
                        onClick={() =>
                          setConfirm({ kind: 'program', id: program.id })
                        }
                      >
                        Delete rule program
                      </OutlineButton>
                    )}
                  </div>
                </fieldset>
              </form>
            </section>
          )}
          {program && (
            <section
              className="workspace-card automation-generation"
              aria-label="Generate forms"
            >
              <h2>Preview generated forms</h2>
              <p className="field-description">
                Save program edits first. Choose entries and cells, inspect
                every derivation, then select eligible results to apply. Maximum
                64 entry/cell pairs. Any project change requires a new preview.
              </p>
              <fieldset
                className="project-fields"
                disabled={workspace.busy || dirty}
              >
                <ReferencePicker
                  label="Source entry"
                  sessionId={sessionId}
                  value={entry}
                  disabled={workspace.busy || dirty}
                  onChange={(id) => {
                    setEntry(id);
                  }}
                />
                <OutlineButton
                  disabled={
                    !entry ||
                    entries.some((e) => e.id === entry) ||
                    entries.length >= 64
                  }
                  onClick={() => {
                    if (entry) {
                      clearPreview();
                      void run(
                        () => loadLexeme(sessionId, entry),
                        (details) => {
                          setEntries([
                            ...entries,
                            {
                              id: details.entry.id,
                              label: details.entry.data.lemma,
                            },
                          ]);
                          setEntry(null);
                        },
                      );
                    }
                  }}
                >
                  Add source entry
                </OutlineButton>
                <ul className="automation-entry-list">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <span>{e.label}</span>
                      <OutlineButton
                        onClick={() => {
                          setEntries(entries.filter((v) => v.id !== e.id));
                          clearPreview();
                        }}
                      >
                        Remove {e.label}
                      </OutlineButton>
                    </li>
                  ))}
                </ul>
                <div className="automation-cells">
                  {program.data.cells.map((c) => (
                    <label key={c.id} className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={cells.includes(c.id)}
                        onChange={(e) => {
                          setCells(
                            e.target.checked
                              ? [...cells, c.id]
                              : cells.filter((id) => id !== c.id),
                          );
                          clearPreview();
                        }}
                      />
                      {c.name} · {c.kind}
                    </label>
                  ))}
                </div>
                <p className="field-description">
                  {entries.length * cells.length} candidate results selected.
                </p>
                <OutlineButton
                  disabled={
                    !entries.length ||
                    !cells.length ||
                    entries.length * cells.length > 64
                  }
                  onClick={() => {
                    clearPreview();
                    void run(
                      () =>
                        api.previewGeneration(
                          sessionId,
                          program,
                          entries.map((e) => e.id),
                          cells,
                        ),
                      setPreview,
                    );
                  }}
                >
                  Preview generation
                </OutlineButton>
                {freshPreview && (
                  <>
                    <Results
                      rows={freshPreview.rows}
                      program={program.data}
                      selected={selected}
                      disabled={workspace.busy}
                      onSelect={setSelected}
                    />
                    <OutlineButton
                      tone="accent"
                      disabled={!selected.length}
                      onClick={() => {
                        void run(
                          () =>
                            api.applyGeneration(
                              sessionId,
                              freshPreview.token,
                              selected,
                            ),
                          (next) => {
                            apply(next);
                            clearPreview();
                            setNotice(
                              'Selected generated forms saved in a new batch. Authored forms are unchanged.',
                            );
                          },
                        );
                      }}
                    >
                      Apply selected results ({selected.length})
                    </OutlineButton>
                  </>
                )}
              </fieldset>
            </section>
          )}
          <section
            className="workspace-card automation-list"
            aria-label="Generated batches"
          >
            <h2>Saved generation batches</h2>
            <p className="field-description">
              Batches retain the source inputs and program revision used at
              creation. Later edits do not update them automatically. Reverting
              removes only that batch’s generated results.
            </p>
            {current?.data ? (
              current.data.batches.length ? (
                <ul>
                  {current.data.batches.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        disabled={workspace.busy}
                        onClick={() => {
                          void run(
                            () => api.loadBatch(sessionId, b.id),
                            setBatch,
                          );
                        }}
                      >
                        {b.name} · {b.count} results ·{' '}
                        {new Date(b.createdAt).toLocaleString()}
                      </button>
                      <OutlineButton
                        disabled={workspace.busy}
                        onClick={() => setConfirm({ kind: 'batch', id: b.id })}
                      >
                        Revert batch
                      </OutlineButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No generated batches.</p>
              )
            ) : (
              <p>
                {current?.error
                  ? 'Batch list unavailable until the programs reload.'
                  : 'Loading batches…'}
              </p>
            )}
          </section>
          {batch && (
            <section
              className="workspace-card automation-generation"
              aria-label="Saved batch provenance"
            >
              <h2>{batch.data.program.data.name} · saved provenance</h2>
              <p className="field-description">
                Program revision {batch.data.program.revision}. These are frozen
                results, not a fresh evaluation of current entries.
              </p>
              <Results
                rows={batch.data.rows}
                program={batch.data.program.data}
              />
              <OutlineButton
                disabled={workspace.busy}
                onClick={() => setBatch(null)}
              >
                Close batch details
              </OutlineButton>
            </section>
          )}
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === 'batch'
              ? 'Revert this generated batch?'
              : 'Delete this rule program?'
          }
          busy={workspace.busy}
          onCancel={() => setConfirm(null)}
        >
          <p className="field-description">
            {confirm.kind === 'batch'
              ? 'This removes the batch’s generated results and releases its entry references. Authored entries and forms remain unchanged. A backup is created first; recovery creates a new project copy.'
              : 'This deletes the saved program and discards its current draft. Programs with generated batches cannot be deleted until those batches are reverted.'}
          </p>
          {workspace.error && <p role="alert">{workspace.error}</p>}
          <div className="dialog-actions">
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </OutlineButton>
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => {
                const target = confirm;
                if (target.kind === 'batch')
                  void run(
                    () => api.revertBatch(sessionId, target.id),
                    (next) => {
                      apply(next);
                      if (batch?.id === target.id) setBatch(null);
                      clearPreview();
                      setConfirm(null);
                      setNotice(
                        'Generated batch reverted. Authored forms are unchanged.',
                      );
                    },
                  );
                else if (program?.id === target.id)
                  void run(
                    () => api.deleteProgram(sessionId, program),
                    (next) => {
                      apply(next);
                      setProgram(null);
                      setDraft(null);
                      clearPreview();
                      setConfirm(null);
                      setNotice('Rule program deleted.');
                    },
                  );
              }}
            >
              {confirm.kind === 'batch'
                ? 'Revert generated batch'
                : 'Delete program'}
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
