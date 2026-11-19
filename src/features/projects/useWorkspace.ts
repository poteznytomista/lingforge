import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../bridge/projects';
import { normalizeError } from '../../bridge/application';
import type { Preferences } from '../settings/SettingsPage';

export const emptyMetadata: api.ProjectMetadata = {
  name: '',
  languageName: '',
  description: '',
};
const defaultPreferences: Preferences = {
  textSize: 'standard',
  motion: 'system',
};

export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<api.WorkspaceSnapshot | null>(null);
  const [draft, setDraft] = useState<api.ProjectMetadata>(emptyMetadata);
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const [attempt, setAttempt] = useState(0);

  const apply = useCallback(
    (next: api.WorkspaceSnapshot, replaceDraft = true) => {
      setSnapshot(next);
      if (replaceDraft)
        setDraft(next.active?.summary.metadata ?? emptyMetadata);
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void api.loadWorkspace().then(
      (next) => {
        if (!active) return;
        if (next) {
          apply(next);
          setPreferences(next.preferences);
        }
        setLoaded(true);
      },
      (reason: unknown) => {
        if (active) {
          setError(normalizeError(reason).message);
          setLoaded(true);
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [apply, attempt]);

  const run = useCallback(
    async <T>(
      action: () => Promise<T>,
      success: (result: T) => void,
    ): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const result = await action();
        if (mounted.current) success(result);
        return true;
      } catch (reason) {
        if (mounted.current) setError(normalizeError(reason).message);
        return false;
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [],
  );

  const active = snapshot?.active ?? null;
  const dirty =
    active !== null &&
    (draft.name !== active.summary.metadata.name ||
      draft.languageName !== active.summary.metadata.languageName ||
      draft.description !== active.summary.metadata.description);
  const available = loaded && snapshot !== null;
  const save = useCallback(async () => {
    if (!active) return false;
    return run(
      () => api.saveProject(active.sessionId, active.summary.revision, draft),
      (next) => {
        apply(next);
        setNotice('Project saved.');
      },
    );
  }, [active, draft, run, apply]);

  const switchProject = useCallback(
    async (action: () => Promise<api.WorkspaceSnapshot | null>) => {
      let changed = false;
      await run(action, (next) => {
        if (next) {
          apply(next);
          changed = true;
        }
      });
      return changed;
    },
    [run, apply],
  );

  return {
    active,
    draft,
    setDraft,
    preferences,
    loaded,
    busy,
    busyRef,
    error,
    notice,
    available,
    dirty,
    run,
    apply,
    setNotice,
    setError,
    recent: snapshot?.recent ?? [],
    warnings: snapshot?.warnings ?? [],
    clearMessages: () => {
      setError(null);
      setNotice(null);
    },
    retry: () => {
      setLoaded(false);
      setError(null);
      setAttempt((value) => value + 1);
    },
    discard: () => setDraft(active?.summary.metadata ?? emptyMetadata),
    save,
    create: (metadata: api.ProjectMetadata) =>
      switchProject(() => api.createProject(metadata)),
    open: (token: string | null = null) =>
      switchProject(() => api.openProject(token)),
    importArchive: () => switchProject(api.importProject),
    close: () =>
      active
        ? switchProject(() => api.closeProject(active.sessionId))
        : Promise.resolve(false),
    duplicate: () =>
      active
        ? switchProject(() => api.duplicateProject(active.sessionId))
        : Promise.resolve(false),
    restore: (id: string) =>
      active
        ? switchProject(() => api.restoreProject(active.sessionId, id))
        : Promise.resolve(false),
    backup: () =>
      active
        ? run(
            () => api.backupProject(active.sessionId),
            (next) => {
              apply(next, false);
              setNotice('Backup created from the saved project.');
            },
          )
        : Promise.resolve(false),
    exportArchive: () =>
      active
        ? run(
            () => api.exportProject(active.sessionId),
            (path) => {
              if (path) setNotice(`Saved project exported to ${path}`);
            },
          )
        : Promise.resolve(false),
    forget: (token: string) =>
      run(
        () => api.forgetProject(token),
        (next) => apply(next, false),
      ),
    changePreferences: (next: Preferences) => {
      if (!available) {
        setPreferences(next);
        return;
      }
      void run(
        () => api.persistPreferences(next),
        () => {
          setPreferences(next);
          setNotice('Preferences saved.');
        },
      );
    },
  };
}

export type WorkspaceController = ReturnType<typeof useWorkspace>;
