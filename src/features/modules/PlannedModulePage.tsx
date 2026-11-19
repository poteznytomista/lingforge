import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import type { ModuleDefinition } from '../../app/navigation';
import {
  OutlineButton,
  SectionHeader,
  TechnicalBadge,
  WorkspaceCard,
} from '../../components/primitives';

export function PlannedModulePage({
  module,
  onHome,
}: {
  module: ModuleDefinition;
  onHome: () => void;
}) {
  const Icon = module.icon;
  return (
    <div className="module-page">
      <SectionHeader
        eyebrow={module.eyebrow}
        title={module.label}
        description={module.description}
      >
        <TechnicalBadge>
          PLANNED · PART {module.part.toString().padStart(2, '0')}
        </TechnicalBadge>
      </SectionHeader>
      <WorkspaceCard className="module-preview">
        <div className="module-preview-icon">
          <Icon size={38} strokeWidth={1.2} aria-hidden="true" />
        </div>
        <p className="overline">ROOM TO BUILD</p>
        <h2>This workspace is taking shape.</h2>
        <p className="module-notice">
          {module.label} tools are planned for part {module.part}.<br />
          Editing is not available in this foundation release.
        </p>
        <ul className="capability-list" aria-label="Planned capabilities">
          {module.capabilities.map((capability) => (
            <li key={capability}>
              <ArrowUpRight size={14} aria-hidden="true" />
              {capability}
            </li>
          ))}
        </ul>
        <OutlineButton icon={ArrowLeft} onClick={onHome}>
          Back to overview
        </OutlineButton>
      </WorkspaceCard>
    </div>
  );
}
