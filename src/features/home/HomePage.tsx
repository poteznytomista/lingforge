import {
  ArrowRight,
  ArrowUpRight,
  FolderOpen,
  Plus,
  Import,
  X,
} from 'lucide-react';
import { modules, type PageId } from '../../app/navigation';
import {
  EmptyStateCard,
  IconButton,
  OutlineButton,
} from '../../components/primitives';
import type { WorkspaceController } from '../projects/useWorkspace';
import { ProjectPanel } from '../projects/ProjectPanel';

export function HomePage({
  onNavigate,
  workspace,
  onCreate,
  onOpen,
  onImport,
  onClose,
  onDuplicate,
  onRestore,
}: {
  onNavigate: (page: PageId) => void;
  workspace: WorkspaceController;
  onCreate: () => void;
  onOpen: (token?: string) => void;
  onImport: () => void;
  onClose: () => void;
  onDuplicate: () => void;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="home-page">
      <header className="home-intro">
        <p className="overline">
          <span className="accent-tick" aria-hidden="true" /> YOUR LANGUAGE.
          YOUR RULES.
        </p>
        <h1 tabIndex={-1} data-page-heading>
          Give your world a <span>voice.</span>
        </h1>
        <p>
          A considered space for the sounds, words, and symbols
          <br className="wide-only" /> that make a language your own.
        </p>
      </header>

      <section className="projects-section" aria-labelledby="projects-heading">
        <div className="content-section-heading">
          <h2 id="projects-heading">Your languages</h2>
          <span className="mono-label">PROJECT LIBRARY</span>
        </div>
        <div className="project-action-row library-actions">
          <OutlineButton
            icon={Plus}
            tone="accent"
            disabled={!workspace.available || workspace.busy}
            onClick={onCreate}
          >
            New language
          </OutlineButton>
          <OutlineButton
            icon={FolderOpen}
            disabled={!workspace.available || workspace.busy}
            onClick={() => onOpen()}
          >
            Open project
          </OutlineButton>
          <OutlineButton
            icon={Import}
            disabled={!workspace.available || workspace.busy}
            onClick={onImport}
          >
            Import archive
          </OutlineButton>
        </div>
        {!workspace.available && (
          <p className="field-description">
            {!workspace.loaded
              ? 'Loading project workspace…'
              : workspace.error
                ? 'Project storage is unavailable. Retry the workspace connection.'
                : 'Project storage is available in the desktop application.'}
          </p>
        )}
        {workspace.active ? (
          <ProjectPanel
            workspace={workspace}
            onClose={onClose}
            onDuplicate={onDuplicate}
            onRestore={onRestore}
          />
        ) : (
          <EmptyStateCard
            icon={FolderOpen}
            title="A blank page. An entire world ahead."
          >
            <p>
              Create a language project or open an existing folder.
              <br />
              Your saved work stays on your computer.
            </p>
          </EmptyStateCard>
        )}
        {workspace.recent.length > 0 && (
          <div className="recent-projects">
            <h3>Recently opened</h3>
            <ul>
              {workspace.recent.map((project) => (
                <li key={project.token}>
                  <button
                    className="recent-project-button"
                    disabled={workspace.busy || !project.available}
                    onClick={() => onOpen(project.token)}
                  >
                    <FolderOpen size={18} aria-hidden="true" />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.location}</small>
                      {!project.available && (
                        <small>
                          Folder unavailable — locate it using Open project.
                        </small>
                      )}
                    </span>
                  </button>
                  <IconButton
                    icon={X}
                    label={`Forget ${project.name}`}
                    disabled={workspace.busy}
                    onClick={() => void workspace.forget(project.token)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="explore-section" aria-labelledby="explore-heading">
        <div className="content-section-heading">
          <h2 id="explore-heading">Explore the workspace</h2>
          <span className="mono-label">LANGUAGE TOOLS</span>
        </div>
        <div className="module-grid">
          {(['phonology', 'lexicon', 'scripts'] as const).map((id) => {
            const module = modules.find((item) => item.id === id)!;
            const Icon = module.icon;
            return (
              <button
                key={id}
                className="module-card"
                onClick={() => onNavigate(id)}
              >
                <span className="module-card-top">
                  <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                  <ArrowUpRight
                    className="module-card-arrow"
                    size={16}
                    aria-hidden="true"
                  />
                </span>
                <span className="module-card-title">{module.label}</span>
                <span className="module-card-description">
                  {id === 'phonology'
                    ? 'Shape the sounds that set your language apart.'
                    : id === 'lexicon'
                      ? 'Find the meaning in every word and connection.'
                      : 'Give your words a form entirely their own.'}
                </span>
                <span className="module-card-footer">
                  <span>
                    {id === 'lexicon'
                      ? 'OPEN LEXICON'
                      : id === 'phonology'
                        ? 'OPEN PHONOLOGY'
                        : 'ALPHABET EXPERIMENT'}
                  </span>
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <div className="home-footnote">
        <span aria-hidden="true">//</span>
        <p>Every language starts somewhere. This is your workspace.</p>
      </div>
    </div>
  );
}
