import { useEffect, useState } from 'react';
import { loadInventory, type Inventory } from '../../bridge/phonology';
import { normalizeError } from '../../bridge/application';

export function useInventory(
  sessionId: string,
  revision: number | undefined,
  search = '',
) {
  const [result, setResult] = useState<{
    key: string;
    data: Inventory | null;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([sessionId, revision, search, attempt]);
  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void loadInventory(sessionId, search).then(
        (data) => {
          if (current) setResult({ key, data, error: null });
        },
        (reason: unknown) => {
          if (current)
            setResult({
              key,
              data: null,
              error: normalizeError(reason).message,
            });
        },
      );
    }, 180);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [sessionId, search, key]);
  return {
    data: result?.key === key ? result.data : null,
    error: result?.key === key ? result.error : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
