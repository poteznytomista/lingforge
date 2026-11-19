import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ApplicationHeader } from '../components/ApplicationHeader';
import { StatusBar } from '../components/StatusBar';
import { WorkspaceSidebar } from '../components/WorkspaceSidebar';
import { HomePage } from '../features/home/HomePage';
import { PlannedModulePage } from '../features/modules/PlannedModulePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { emptyMetadata, useWorkspace } from '../features/projects/useWorkspace';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EditorField, OutlineButton } from '../components/primitives';
import { modules, pageLabel, type PageId } from './navigation';
import { useApplicationInfo } from './useApplicationInfo';
import { LexiconPage } from '../features/lexicon/LexiconPage';
import { NotebookPage } from '../features/notebook/NotebookPage';
import { AutomationPage } from '../features/automation/AutomationPage';
import { FontsPage } from '../features/fonts/FontsPage';
import { WritingPage } from '../features/writing/WritingPage';
import { PhonologyPage } from '../features/phonology/PhonologyPage';
import type { EditorGuard } from '../features/projects/editorGuard';

export function App() {
  const [page, setPage] = useState<PageId>('home');
  const [collapsed, setCollapsed] = useState(
    () => window.matchMedia('(max-width: 850px)').matches,
  );
  const workspace = useWorkspace();
  const { preferences, busyRef } = workspace;
  const [createOpen, setCreateOpen] = useState(false);
  const [newMetadata, setNewMetadata] = useState(emptyMetadata);
  const [pending, setPending] = useState<(() => Promise<unknown>) | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [lexemeTarget, setLexemeTarget] = useState<string | null>(null);
  const editorGuard = useRef<EditorGuard | null>(null);
  const onEditorGuard = useCallback((guard: EditorGuard | null) => {
    editorGuard.current = guard;
    setEditorDirty(guard?.dirty ?? false);
  }, []);
  const dirtyRef = useRef(false);
  const allowClose = useRef(false);
  const transitionRef = useRef<(action: () => Promise<unknown>) => void>(
    () => {},
  );
  const mainRef = useRef<HTMLElement>(null);
  const shouldFocusPage = useRef(false);
  const { state: application, retry } = useApplicationInfo();

  const requestTransition = useCallback(
    (action: () => Promise<unknown>) => {
      if (busyRef.current) return;
      if (workspace.dirty || editorGuard.current?.dirty)
        setPending(() => action);
      else void action();
    },
    [busyRef, workspace.dirty],
  );
  const saveProject = workspace.save;
  const saveChanges = useCallback(
    () =>
      editorGuard.current?.dirty ? editorGuard.current.save() : saveProject(),
    [saveProject],
  );

  useEffect(() => {
    dirtyRef.current = workspace.dirty || editorDirty;
    transitionRef.current = requestTransition;
  });

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowClose.current && (dirtyRef.current || busyRef.current)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      void getCurrentWindow()
        .onCloseRequested((event) => {
          if (allowClose.current) return;
          if (busyRef.current) {
            event.preventDefault();
            setCloseError(
              'Wait for the current operation before closing LingForge.',
            );
            return;
          }
          if (dirtyRef.current) {
            event.preventDefault();
            transitionRef.current(async () => {
              allowClose.current = true;
              try {
                await getCurrentWindow().close();
              } catch {
                allowClose.current = false;
                setCloseError('The window could not close. Try again.');
              }
            });
          }
        })
        .then(
          (stop) => {
            if (disposed) stop();
            else unlisten = stop;
          },
          () => {
            if (!disposed)
              setCloseError(
                'Close protection could not be enabled. Save your work before closing the window.',
              );
          },
        );
    }
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [busyRef]);

  const navigate = useCallback(
    (destination: PageId) => {
      if (destination === page) {
        mainRef.current
          ?.querySelector<HTMLElement>('[data-page-heading]')
          ?.focus();
        mainRef.current?.scrollTo({ top: 0 });
        return;
      }
      requestTransition(async () => {
        shouldFocusPage.current = true;
        setLexemeTarget(null);
        setPage(destination);
      });
    },
    [page, requestTransition],
  );

  useEffect(() => {
    document.title = `${pageLabel(page)} · LingForge`;
    if (shouldFocusPage.current) {
      mainRef.current
        ?.querySelector<HTMLElement>('[data-page-heading]')
        ?.focus();
      mainRef.current?.scrollTo({ top: 0 });
      shouldFocusPage.current = false;
    }
  }, [page]);

  useEffect(() => {
    document.documentElement.dataset.textSize = preferences.textSize;
    document.documentElement.dataset.motion = preferences.motion;
    return () => {
      delete document.documentElement.dataset.textSize;
      delete document.documentElement.dataset.motion;
    };
  }, [preferences]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.repeat ||
        !event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.metaKey
      )
        return;
      if (document.querySelector('dialog[open]')) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if ((workspace.dirty || editorDirty) && !busyRef.current)
          void saveChanges();
        return;
      }
      const target = event.target;
      // Future editors keep their native editing shortcuts.
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))
      )
        return;
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setCollapsed((value) => !value);
      }
      if (event.key === ',') {
        event.preventDefault();
        navigate('settings');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate, saveChanges, workspace.dirty, editorDirty, busyRef]);

  const activeModule = modules.find((module) => module.id === page);

  return (
    <div className="app-shell" data-sidebar-collapsed={collapsed}>
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <ApplicationHeader
        page={page}
        collapsed={collapsed}
        onToggleSidebar={() => setCollapsed((value) => !value)}
        onNavigate={navigate}
      />
      <WorkspaceSidebar
        page={page}
        collapsed={collapsed}
        onNavigate={navigate}
        projectName={workspace.active?.summary.metadata.name}
      />
      <main
        id="main-content"
        ref={mainRef}
        className="main-workspace"
        tabIndex={-1}
      >
        {(workspace.error || closeError) && (
          <div className="workspace-message error-message" role="alert">
            <p>{workspace.error ?? closeError}</p>
            <div>
              {!workspace.available && workspace.error && (
                <OutlineButton
                  disabled={workspace.busy}
                  onClick={workspace.retry}
                >
                  Retry workspace connection
                </OutlineButton>
              )}
              <OutlineButton
                onClick={() => {
                  workspace.clearMessages();
                  setCloseError(null);
                }}
              >
                Dismiss
              </OutlineButton>
            </div>
          </div>
        )}
        {workspace.notice && (
          <div className="workspace-message" role="status">
            {workspace.notice}
          </div>
        )}
        {workspace.warnings.map((warning) => (
          <div key={warning} className="workspace-message" role="status">
            {warning}
          </div>
        ))}
        {page === 'home' && (
          <HomePage
            onNavigate={navigate}
            workspace={workspace}
            onCreate={() =>
              requestTransition(async () => {
                setNewMetadata(emptyMetadata);
                setCreateOpen(true);
              })
            }
            onOpen={(token) => requestTransition(() => workspace.open(token))}
            onImport={() => requestTransition(workspace.importArchive)}
            onClose={() => requestTransition(workspace.close)}
            onDuplicate={() => requestTransition(workspace.duplicate)}
            onRestore={(id) => requestTransition(() => workspace.restore(id))}
          />
        )}
        {page === 'lexicon' && (
          <LexiconPage
            key={workspace.active?.sessionId ?? 'no-project'}
            workspace={workspace}
            initialEntryId={lexemeTarget}
            onHome={() => navigate('home')}
            onGuard={onEditorGuard}
            requestTransition={requestTransition}
          />
        )}
        {page === 'phonology' && (
          <PhonologyPage
            key={workspace.active?.sessionId ?? 'no-project'}
            workspace={workspace}
            onHome={() => navigate('home')}
            onGuard={onEditorGuard}
            requestTransition={requestTransition}
            onOpenLexeme={(id) =>
              requestTransition(async () => {
                shouldFocusPage.current = true;
                setLexemeTarget(id);
                setPage('lexicon');
              })
            }
          />
        )}
        {page === 'scripts' && (
          <WritingPage
            key={workspace.active?.sessionId ?? 'no-project'}
            workspace={workspace}
            onHome={() => navigate('home')}
            onGuard={onEditorGuard}
            requestTransition={requestTransition}
          />
        )}
        {page === 'automation' && (
          <AutomationPage
            key={workspace.active?.sessionId ?? 'no-project'}
            workspace={workspace}
            onHome={() => navigate('home')}
            onGuard={onEditorGuard}
            requestTransition={requestTransition}
          />
        )}
        {page === 'fonts' && (
          <FontsPage
            key={workspace.active?.sessionId ?? 'no-project'}
            workspace={workspace}
            onHome={() => navigate('home')}
            onGuard={onEditorGuard}
            requestTransition={requestTransition}
          />
        )}
        {(page === 'documents' || page === 'grammar') && (
          <NotebookPage
            key={`${workspace.active?.sessionId ?? 'no-project'}-${page}`}
            kind={page === 'documents' ? 'document' : 'grammar'}
            workspace={workspace}
            onHome={() => navigate('home')}
            onGuard={onEditorGuard}
            requestTransition={requestTransition}
          />
        )}
        {activeModule &&
          page !== 'lexicon' &&
          page !== 'phonology' &&
          page !== 'scripts' &&
          page !== 'documents' &&
          page !== 'grammar' &&
          page !== 'fonts' &&
          page !== 'automation' && (
            <PlannedModulePage
              module={activeModule}
              onHome={() => navigate('home')}
            />
          )}
        {page === 'settings' && (
          <SettingsPage
            preferences={preferences}
            onChange={workspace.changePreferences}
            application={application}
            persistent={workspace.available}
            busy={workspace.busy || !workspace.loaded}
          />
        )}
      </main>
      <StatusBar
        state={application}
        onRetry={retry}
        projectStatus={
          workspace.busy
            ? 'Working…'
            : workspace.active
              ? workspace.dirty || editorDirty
                ? 'Unsaved changes'
                : 'Project saved'
              : 'No project open'
        }
      />
      {createOpen && (
        <ConfirmDialog
          title="Create a language project"
          onCancel={() => setCreateOpen(false)}
          busy={workspace.busy}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void workspace.create(newMetadata).then((created) => {
                if (created) setCreateOpen(false);
              });
            }}
          >
            <p className="field-description">
              Choose a name, then select a parent folder. LingForge will create
              a new project folder inside it.
            </p>
            <fieldset disabled={workspace.busy} className="project-fields">
              <EditorField
                label="Project name"
                autoFocus
                required
                maxLength={120}
                value={newMetadata.name}
                onChange={(event) =>
                  setNewMetadata({ ...newMetadata, name: event.target.value })
                }
              />
              <EditorField
                label="Language name"
                maxLength={120}
                value={newMetadata.languageName}
                onChange={(event) =>
                  setNewMetadata({
                    ...newMetadata,
                    languageName: event.target.value,
                  })
                }
              />
            </fieldset>
            {workspace.error && (
              <p role="alert" className="inline-error">
                {workspace.error}
              </p>
            )}
            <div className="dialog-actions">
              <OutlineButton
                disabled={workspace.busy}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </OutlineButton>
              <OutlineButton
                type="submit"
                tone="accent"
                disabled={workspace.busy || !newMetadata.name.trim()}
              >
                Choose folder & create
              </OutlineButton>
            </div>
          </form>
        </ConfirmDialog>
      )}
      {pending && (
        <ConfirmDialog
          title="Save your changes?"
          busy={workspace.busy}
          onCancel={() => setPending(null)}
        >
          <p className="field-description">
            {workspace.active?.summary.metadata.name} has unsaved changes. Save
            them before continuing, or discard the changes made since the last
            save.
          </p>
          {workspace.error && (
            <p role="alert" className="inline-error">
              {workspace.error}
            </p>
          )}
          <div className="dialog-actions">
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => setPending(null)}
            >
              Keep editing
            </OutlineButton>
            <OutlineButton
              disabled={workspace.busy}
              onClick={() => {
                const action = pending;
                editorGuard.current?.discard();
                workspace.discard();
                setPending(null);
                void action();
              }}
            >
              Discard changes
            </OutlineButton>
            <OutlineButton
              disabled={workspace.busy}
              tone="accent"
              onClick={() => {
                const action = pending;
                void saveChanges().then((saved) => {
                  if (saved) {
                    setPending(null);
                    void action();
                  }
                });
              }}
            >
              Save & continue
            </OutlineButton>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
