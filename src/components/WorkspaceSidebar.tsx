import { ChevronRight, Layers3 } from 'lucide-react';
import { navigation, settingsNavigation, type PageId } from '../app/navigation';

export function WorkspaceSidebar({
  page,
  collapsed,
  onNavigate,
  projectName,
}: {
  page: PageId;
  collapsed: boolean;
  onNavigate: (page: PageId) => void;
  projectName?: string;
}) {
  const SettingsIcon = settingsNavigation.icon;
  return (
    <aside
      id="workspace-sidebar"
      className="workspace-sidebar"
      aria-label="Workspace sidebar"
    >
      <div className="workspace-identity">
        <div className="workspace-symbol" aria-hidden="true">
          <Layers3 size={20} />
        </div>
        <div className="sidebar-copy">
          <p>{projectName ?? 'Your workspace'}</p>
          <span>{projectName ? 'LANGUAGE PROJECT' : 'No language open'}</span>
        </div>
      </div>
      <nav aria-label="Workspace" className="workspace-navigation">
        <p className="sidebar-heading sidebar-copy">WORKSPACE</p>
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`sidebar-item ${page === id ? 'active' : ''}`}
            aria-current={page === id ? 'page' : undefined}
            aria-label={label}
            title={collapsed ? label : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="sidebar-copy">{label}</span>
            {page === id && (
              <ChevronRight
                className="nav-chevron sidebar-copy"
                size={13}
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="workspace-note sidebar-copy">
          <span className="small-square" aria-hidden="true" />
          <div>
            <p>A place for your languages.</p>
            <span>Built for work that is your own.</span>
          </div>
        </div>
        <button
          className={`sidebar-item ${page === 'settings' ? 'active' : ''}`}
          aria-current={page === 'settings' ? 'page' : undefined}
          aria-label="Preferences"
          title={collapsed ? 'Preferences' : undefined}
          onClick={() => onNavigate('settings')}
        >
          <SettingsIcon size={18} aria-hidden="true" />
          <span className="sidebar-copy">Preferences</span>
          <kbd className="sidebar-copy">Ctrl ,</kbd>
        </button>
      </div>
    </aside>
  );
}
