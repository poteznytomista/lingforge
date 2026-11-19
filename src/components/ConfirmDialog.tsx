import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './primitives';
import { X } from 'lucide-react';

export function ConfirmDialog({
  title,
  children,
  onCancel,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirmation-dialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="dialog-heading">
        <h2 id={headingId}>{title}</h2>
        <IconButton
          icon={X}
          label="Cancel"
          onClick={onCancel}
          disabled={busy}
        />
      </div>
      {children}
    </dialog>
  );
}
