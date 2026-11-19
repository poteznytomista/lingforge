import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { pageLabel, type PageId } from '../app/navigation';
import { IconButton } from './primitives';

export function ApplicationHeader({
  page,
  collapsed,
  onToggleSidebar,
  onNavigate,
}: {
  page: PageId;
  collapsed: boolean;
  onToggleSidebar: () => void;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <header className="application-header">
      <div className="header-identity">
        <IconButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-controls="workspace-sidebar"
          aria-expanded={!collapsed}
          onClick={onToggleSidebar}
        />
        <button
          className="brand"
          onClick={() => onNavigate('home')}
          aria-label="LingForge home"
        >
          <svg
            className="brand-mark"
            width="30"
            height="30"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M11 7v18h13M11 16h10M17 7h7"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <span>LINGFORGE</span>
        </button>
        <span className="brand-descriptor">// language construction</span>
      </div>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        {page === 'home' ? (
          <span aria-current="page">home</span>
        ) : (
          <>
            <button onClick={() => onNavigate('home')}>home</button>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{pageLabel(page).toLowerCase()}</span>
          </>
        )}
      </nav>
    </header>
  );
}
