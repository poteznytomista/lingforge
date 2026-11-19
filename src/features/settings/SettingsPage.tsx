import { BookOpen, Keyboard, Monitor, RotateCcw } from 'lucide-react';
import type { ApplicationState } from '../../app/useApplicationInfo';
import {
  OutlineButton,
  SectionHeader,
  WorkspaceCard,
} from '../../components/primitives';

export type TextSize = 'standard' | 'comfortable' | 'large';
export type MotionPreference = 'system' | 'reduced';

export interface Preferences {
  textSize: TextSize;
  motion: MotionPreference;
}

export function SettingsPage({
  preferences,
  onChange,
  application,
  persistent,
  busy,
}: {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
  application: ApplicationState;
  persistent: boolean;
  busy: boolean;
}) {
  return (
    <div className="settings-page">
      <SectionHeader
        eyebrow="MAKE ROOM FOR YOUR WORK"
        title="Preferences"
        description={
          persistent
            ? 'Small adjustments for a comfortable workspace. Preferences are saved on this computer.'
            : 'Preview preferences apply to this session only.'
        }
      />
      <WorkspaceCard>
        <div className="card-section-title">
          <Monitor size={18} aria-hidden="true" />
          <h2>Appearance</h2>
        </div>
        <fieldset className="preference-row" disabled={busy}>
          <legend>Interface text size</legend>
          <p id="size-help">Scale the interface to suit your display.</p>
          <div className="segmented-options" aria-describedby="size-help">
            {(['standard', 'comfortable', 'large'] as const).map((size) => (
              <label key={size}>
                <input
                  type="radio"
                  name="text-size"
                  value={size}
                  checked={preferences.textSize === size}
                  onChange={() => onChange({ ...preferences, textSize: size })}
                />
                <span>
                  {size === 'standard'
                    ? 'Standard'
                    : size === 'comfortable'
                      ? 'Comfortable'
                      : 'Large'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="preference-row" disabled={busy}>
          <legend>Motion</legend>
          <p id="motion-help">
            Keep transitions subtle, or remove them entirely.
          </p>
          <div className="segmented-options" aria-describedby="motion-help">
            <label>
              <input
                type="radio"
                name="motion"
                checked={preferences.motion === 'system'}
                onChange={() => onChange({ ...preferences, motion: 'system' })}
              />
              <span>Follow system</span>
            </label>
            <label>
              <input
                type="radio"
                name="motion"
                checked={preferences.motion === 'reduced'}
                onChange={() => onChange({ ...preferences, motion: 'reduced' })}
              />
              <span>Reduce motion</span>
            </label>
          </div>
        </fieldset>
        <div className="settings-card-footer">
          <OutlineButton
            disabled={busy}
            icon={RotateCcw}
            onClick={() => onChange({ textSize: 'standard', motion: 'system' })}
          >
            Reset appearance
          </OutlineButton>
          <span>
            {persistent
              ? 'Stored separately from language projects.'
              : 'Open the desktop app to save preferences.'}
          </span>
        </div>
      </WorkspaceCard>
      <WorkspaceCard>
        <div className="card-section-title">
          <Keyboard size={18} aria-hidden="true" />
          <h2>Keyboard shortcuts</h2>
        </div>
        <dl className="shortcut-list">
          <div>
            <dt>Save the active editor or project metadata</dt>
            <dd>
              <kbd>Ctrl</kbd> + <kbd>S</kbd>
            </dd>
          </div>
          <div>
            <dt>Show or hide sidebar</dt>
            <dd>
              <kbd>Ctrl</kbd> + <kbd>B</kbd>
            </dd>
          </div>
          <div>
            <dt>Open preferences</dt>
            <dd>
              <kbd>Ctrl</kbd> + <kbd>,</kbd>
            </dd>
          </div>
          <div>
            <dt>Move between controls</dt>
            <dd>
              <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd>
            </dd>
          </div>
        </dl>
      </WorkspaceCard>
      <WorkspaceCard>
        <div className="card-section-title">
          <BookOpen size={18} aria-hidden="true" />
          <h2>Working with your projects</h2>
        </div>
        <details className="help-details">
          <summary>Save and move a language</summary>
          <p>
            Edits stay in memory until you save. Save the active editor before
            switching projects or closing LingForge. Forced shutdown can lose
            unsaved work.
          </p>
          <p>
            From the overview, use Export archive to create a portable
            .lingforge file of saved content. On the other computer, use Import
            archive and choose a parent folder for a new copy. An archive
            includes linked language data and managed assets; it excludes
            preferences and backup history.
          </p>
          <p>
            Keep a separate archive before upgrading LingForge. Do not copy an
            open project’s database file or use a shared folder for simultaneous
            editing.
          </p>
        </details>
        <details className="help-details">
          <summary>Recover saved work</summary>
          <p>
            From Backups &amp; recovery on the overview, choose Recover copy.
            Recovery opens a new project and leaves the original intact. If a
            project cannot open, use Import archive with a .lingforge file from
            its backups folder.
          </p>
          <p>
            The newest 10 automatic snapshots are kept; manual and migration
            snapshots are retained. A backup made before a save contains the
            previous saved state. Recovery does not restore unsaved drafts or
            session undo history.
          </p>
        </details>
        <details className="help-details">
          <summary>Current capabilities and updates</summary>
          <p>
            This is an experimental development build. Native Linux and Windows
            validation is pending. Writing systems, documents, grammar, glyph
            editing, fonts and linguistic automation remain experimental.
          </p>
          <p>
            Resources browsing, PDF export and full bidirectional or
            complex-script document layout remain planned. A generated font or
            text export does not replace a complete project archive.
          </p>
          <p>
            The workspace uses local project data and bundled interface fonts.
            Updates are manual; there is no automatic updater or account
            requirement. Before replacing a build, save, export an archive and
            close LingForge.
          </p>
        </details>
      </WorkspaceCard>
      <div className="about-line">
        <span>LINGFORGE</span>
        <p>
          {application.status === 'ready'
            ? `Version ${application.info.version} · ${application.info.runtime === 'desktop' ? 'Desktop application' : 'Browser preview'}`
            : 'Application information unavailable'}
          <br />
          Experimental development build · Linux &amp; Windows
        </p>
      </div>
    </div>
  );
}
