import { Circle, RotateCw } from 'lucide-react';
import type { ApplicationState } from '../app/useApplicationInfo';

export function StatusBar({
  state,
  onRetry,
  projectStatus = 'No project open',
}: {
  state: ApplicationState;
  onRetry: () => void;
  projectStatus?: string;
}) {
  return (
    <footer className="status-bar">
      <div className="status-content" role="status" aria-live="polite">
        {state.status === 'loading' && <span>Connecting to desktop…</span>}
        {state.status === 'error' && (
          <>
            <span className="status-error">{state.error.message}</span>
            <button className="status-retry" onClick={onRetry}>
              <RotateCw size={12} aria-hidden="true" /> Retry
            </button>
          </>
        )}
        {state.status === 'ready' && (
          <>
            <span>v{state.info.version}</span>
            <span className="status-divider" aria-hidden="true">
              /
            </span>
            <span>
              {state.info.runtime === 'preview'
                ? 'Browser preview'
                : `${state.info.platform === 'windows' ? 'Windows' : state.info.platform === 'linux' ? 'Linux' : state.info.platform} desktop`}
            </span>
            <span className="project-status">
              <Circle size={6} aria-hidden="true" /> {projectStatus}
            </span>
          </>
        )}
      </div>
      <span className="status-motto">LANGUAGE, BY DESIGN.</span>
    </footer>
  );
}
