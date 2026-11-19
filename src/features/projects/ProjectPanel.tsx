import { Archive, Copy, FolderClosed, Plus, Save, Undo2 } from 'lucide-react';
import {
  EditorField,
  OutlineButton,
  TechnicalBadge,
  WorkspaceCard,
} from '../../components/primitives';
import type { WorkspaceController } from './useWorkspace';

export function ProjectPanel({
  workspace,
  onClose,
  onDuplicate,
  onRestore,
}: {
  workspace: WorkspaceController;
  onClose: () => void;
  onDuplicate: () => void;
  onRestore: (id: string) => void;
}) {
  const { active, draft, setDraft, busy, dirty } = workspace;
  if (!active) return null;
  const timestamp = (time: number) => new Date(time).toLocaleString();
  return (
    <section aria-labelledby="active-project-heading" className="project-panel">
      <div className="content-section-heading">
        <h2 id="active-project-heading">{active.summary.metadata.name}</h2>
        <TechnicalBadge>{dirty ? 'UNSAVED CHANGES' : 'SAVED'}</TechnicalBadge>
      </div>
      <WorkspaceCard>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void workspace.save();
          }}
        >
          <fieldset disabled={busy} className="project-fields">
            <EditorField
              label="Project name"
              value={draft.name}
              required
              maxLength={120}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
            <EditorField
              label="Language name"
              value={draft.languageName}
              maxLength={120}
              onChange={(event) =>
                setDraft({ ...draft, languageName: event.target.value })
              }
            />
            <div className="editor-field">
              <label htmlFor="project-description">Description</label>
              <textarea
                id="project-description"
                value={draft.description}
                rows={5}
                maxLength={10000}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </div>
          </fieldset>
          <div className="project-action-row">
            <OutlineButton
              type="submit"
              icon={Save}
              tone="accent"
              disabled={busy || !dirty || !draft.name.trim()}
            >
              Save project
            </OutlineButton>
            <span className="field-description">
              {busy
                ? 'Working…'
                : dirty
                  ? 'Changes are kept in memory until you save.'
                  : `Last saved ${timestamp(active.summary.updatedAt)}`}
            </span>
          </div>
        </form>
        <dl className="project-details">
          <div>
            <dt>Location</dt>
            <dd>{active.location}</dd>
          </div>
          <div>
            <dt>Project ID</dt>
            <dd>{active.summary.id}</dd>
          </div>
        </dl>
        <div className="project-action-row project-tools">
          <OutlineButton
            icon={Archive}
            disabled={busy || dirty}
            onClick={() => void workspace.exportArchive()}
          >
            Export archive
          </OutlineButton>
          <OutlineButton
            icon={Copy}
            disabled={busy || dirty}
            onClick={onDuplicate}
          >
            Duplicate
          </OutlineButton>
          <OutlineButton icon={FolderClosed} disabled={busy} onClick={onClose}>
            Close project
          </OutlineButton>
        </div>
        {dirty && (
          <p className="field-description">
            Save your changes to include them in an export, duplicate, or
            backup.
          </p>
        )}
      </WorkspaceCard>
      <WorkspaceCard className="backups-panel">
        <div className="content-section-heading">
          <h2>Backups & recovery</h2>
          <OutlineButton
            icon={Plus}
            disabled={busy || dirty}
            onClick={() => void workspace.backup()}
          >
            Create backup
          </OutlineButton>
        </div>
        <p className="field-description">
          A backup is created before each save. The latest 10 automatic backups
          are kept. Manual and migration backups are retained.
        </p>
        {active.backups.length === 0 ? (
          <p className="backup-empty">
            No backups yet. Your first change will create one automatically.
          </p>
        ) : (
          <ul className="backup-list">
            {active.backups.map((backup) => (
              <li key={backup.id}>
                <div>
                  <span>{timestamp(backup.createdAt)}</span>
                  <small>
                    {backup.kind === 'auto'
                      ? 'Before save'
                      : backup.kind === 'migration'
                        ? 'Before migration'
                        : 'Manual backup'}{' '}
                    · {Math.max(1, Math.ceil(backup.bytes / 1024))} KiB
                  </small>
                </div>
                <OutlineButton
                  icon={Undo2}
                  disabled={busy}
                  onClick={() => onRestore(backup.id)}
                >
                  Recover copy
                </OutlineButton>
              </li>
            ))}
          </ul>
        )}
        <p className="field-description">
          Recovery opens a new project copy and leaves this project intact.
        </p>
      </WorkspaceCard>
    </section>
  );
}
