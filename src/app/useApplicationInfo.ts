import { useCallback, useEffect, useState } from 'react';
import {
  getApplicationInfo,
  normalizeError,
  type AppError,
  type ApplicationInfo,
} from '../bridge/application';

export type ApplicationState =
  | { status: 'loading' }
  | { status: 'ready'; info: ApplicationInfo }
  | { status: 'error'; error: AppError };

export function useApplicationInfo() {
  const [state, setState] = useState<ApplicationState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    // A broken IPC connection must not leave the status bar pending forever.
    const timeout = window.setTimeout(() => {
      if (active) {
        active = false;
        setState({
          status: 'error',
          error: {
            code: 'unavailable',
            message: 'The desktop took too long to respond. Please try again.',
          },
        });
      }
    }, 8000);

    void getApplicationInfo()
      .then(
        (info) => {
          if (active) setState({ status: 'ready', info });
        },
        (error: unknown) => {
          if (active)
            setState({ status: 'error', error: normalizeError(error) });
        },
      )
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  return { state, retry };
}
