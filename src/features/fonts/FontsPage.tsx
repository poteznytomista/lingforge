import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Save, Trash2, Type } from 'lucide-react';
import * as api from '../../bridge/fonts';
import { listScripts, type ScriptSummary } from '../../bridge/writing';
import { normalizeError } from '../../bridge/application';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import {
  EmptyStateCard,
  OutlineButton,
  SectionHeader,
} from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import type { EditorGuard } from '../projects/editorGuard';
import { FontFields } from './FontFields';
import { FontSample } from './FontSample';

export function FontsPage({
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
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([sessionId, revision, attempt]);
  const [list, setList] = useState<{
    key: string;
    items?: ScriptSummary[];
    error?: string;
  } | null>(null);
  const currentList = list?.key === key ? list : null;
  const [loaded, setLoaded] = useState<api.FontWorkspace | null>(null);
  const [draft, setDraft] = useState<api.FontDraft | null>(null);
  const [preview, setPreview] = useState<api.FontPreview | null>(null);
  const [rights, setRights] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const dirty =
    draft !== null &&
    JSON.stringify(draft) !== JSON.stringify(loaded?.profile?.data);
  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    void listScripts(sessionId).then(
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
  const valid = useCallback(() => {
    // Validate the entire draft too: paged-out rows are absent from native form validation.
    if (!draft || !api.isFontDraft(draft) || !form.current?.checkValidity()) {
      setError(
        'Complete the font fields, Unicode mappings and rule operands before continuing. Check other glyph pages for invalid values.',
      );
      return false;
    }
    return true;
  }, [draft, setError]);
  const save = useCallback(async () => {
    if (!loaded || !draft || !valid()) return false;
    return run(
      () => api.saveFont(sessionId, loaded.script, loaded.profile, draft),
      (next) => {
        apply(next.workspace);
        setLoaded({
          ...loaded,
          profile: next.profile,
          initial: next.profile.data,
        });
        setDraft(next.profile.data);
        setNotice('Font profile and shaping sample saved.');
      },
    );
  }, [loaded, draft, valid, run, sessionId, apply, setNotice]);
  const discard = useCallback(() => {
    if (loaded?.profile) setDraft(loaded.profile.data);
    else {
      setDraft(null);
      setLoaded(null);
    }
    setPreview(null);
    setRights(false);
    setEpoch((n) => n + 1);
  }, [loaded]);
  useEffect(() => {
    onGuard({ dirty, save, discard });
  }, [onGuard, dirty, save, discard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  const change = (data: api.FontDraft) => {
    setDraft(data);
    setPreview(null);
    setRights(false);
  };
  const select = (scriptId: string) =>
    requestTransition(() =>
      run(
        () => api.loadFont(sessionId, scriptId),
        (next) => {
          setLoaded(next);
          setDraft(next.initial);
          setPreview(null);
          setRights(false);
          setEpoch((n) => n + 1);
        },
      ),
    );
  return (
    <div className="fonts-page">
      <SectionHeader
        eyebrow="TYPE AND SHAPING LAB"
        title="Fonts & shaping"
        description="Build experimental fonts from saved glyphs and inspect how characters become positioned glyphs."
      />
      <p className="experiment-notice">
        <span className="technical-badge">EXPERIMENTAL · PART 08</span> Native
        font rendering, selection and external compatibility are unverified.
        Documents retain the earlier SVG editor. Bidirectional paragraphs,
        advanced script shaping and PDF export remain research.
      </p>
      {!sessionId ? (
        <EmptyStateCard icon={Type} title="Open a language project">
          <p>Font profiles use the saved writing systems in a project.</p>
          <OutlineButton onClick={onHome}>Back to overview</OutlineButton>
        </EmptyStateCard>
      ) : (
        <>
          <section
            className="workspace-card script-list"
            aria-label="Font writing systems"
          >
            <h2>Choose a saved writing system</h2>
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
                {currentList.items.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={workspace.busy}
                      aria-current={
                        loaded?.script.id === s.id ? 'true' : undefined
                      }
                      onClick={() => select(s.id)}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Create a writing system and save its glyph variants first.</p>
            )}
          </section>
          {loaded && draft && (
            <section className="workspace-card font-editor">
              <div className="lexicon-editor-heading">
                <h2>{loaded.script.data.name}</h2>
                <span className="technical-badge">
                  {dirty ? 'UNSAVED PROFILE' : 'SAVED PROFILE'}
                </span>
              </div>
              <p className="field-description">
                Opening a new profile proposes one PUA mapping per character
                with a saved glyph. Review the assignments and metrics, then
                save explicitly. Preview and export use the current profile
                draft with saved outlines; neither saves the project.
              </p>
              <form
                ref={form}
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <fieldset disabled={workspace.busy} className="project-fields">
                  <FontFields
                    key={`fields-${epoch}`}
                    draft={draft}
                    script={loaded.script}
                    onChange={change}
                  />
                  <FontSample
                    key={`sample-${epoch}`}
                    draft={draft}
                    script={loaded.script}
                    disabled={workspace.busy}
                    preview={preview}
                    onChange={change}
                  />
                  <div className="dialog-actions">
                    <OutlineButton
                      disabled={!draft.glyphs.length}
                      onClick={() => {
                        if (valid()) {
                          setPreview(null);
                          void run(
                            () =>
                              api.previewFont(sessionId, loaded.script, draft),
                            setPreview,
                          );
                        }
                      }}
                    >
                      Build current preview
                    </OutlineButton>
                  </div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={rights}
                      onChange={(e) => setRights(e.target.checked)}
                    />
                    I have permission to distribute these outlines under the
                    entered license and embedding settings.
                  </label>
                  <div className="entry-save-bar">
                    <OutlineButton
                      type="submit"
                      icon={Save}
                      tone="accent"
                      disabled={!dirty}
                    >
                      Save font profile
                    </OutlineButton>
                    <OutlineButton
                      icon={Download}
                      disabled={
                        !rights ||
                        !draft.copyright.trim() ||
                        !draft.license.trim()
                      }
                      onClick={() => {
                        if (valid())
                          void run(
                            () =>
                              api.exportFont(
                                sessionId,
                                loaded.script,
                                draft,
                                rights,
                              ),
                            (path) => {
                              if (path)
                                setNotice(
                                  `Current draft font exported to ${path}`,
                                );
                            },
                          );
                      }}
                    >
                      Export current TTF
                    </OutlineButton>
                    <OutlineButton
                      onClick={() =>
                        requestTransition(async () => {
                          setDraft(null);
                          setLoaded(null);
                          setPreview(null);
                          setRights(false);
                        })
                      }
                    >
                      Close profile
                    </OutlineButton>
                    {loaded.profile && (
                      <OutlineButton
                        icon={Trash2}
                        onClick={() => setDeleting(true)}
                      >
                        Delete font profile
                      </OutlineButton>
                    )}
                  </div>
                </fieldset>
              </form>
            </section>
          )}
        </>
      )}
      {deleting && loaded?.profile && (
        <ConfirmDialog
          title="Delete this font profile?"
          busy={workspace.busy}
          onCancel={() => setDeleting(false)}
        >
          <p>
            Delete this profile’s metrics, export mappings, rules and sample?
            Unsaved profile edits will also be discarded. Source characters,
            glyphs and documents remain; a snapshot is created first.
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
              Keep profile
            </OutlineButton>
            <OutlineButton
              tone="accent"
              disabled={workspace.busy}
              onClick={() => {
                const profile = loaded.profile;
                if (profile)
                  void run(
                    () => api.deleteFont(sessionId, profile),
                    (next) => {
                      apply(next);
                      setLoaded(null);
                      setDraft(null);
                      setPreview(null);
                      setRights(false);
                      setDeleting(false);
                      setNotice('Font profile deleted.');
                    },
                  );
              }}
            >
              Delete profile
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
