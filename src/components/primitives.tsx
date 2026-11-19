import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  tone?: 'neutral' | 'accent';
}

export function OutlineButton({
  children,
  icon: Icon,
  tone = 'neutral',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`outline-button ${tone === 'accent' ? 'accent-button' : ''} ${className}`}
      {...props}
    >
      {Icon && <Icon size={15} aria-hidden="true" />} {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  className = '',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      {...props}
      aria-label={label}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}

export function TechnicalBadge({ children }: { children: ReactNode }) {
  return <span className="technical-badge">{children}</span>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="section-header">
      <p className="overline">{eyebrow}</p>
      <div className="section-title-row">
        <h1 tabIndex={-1} data-page-heading>
          {title}
        </h1>
        {children}
      </div>
      {description && <p className="section-description">{description}</p>}
    </header>
  );
}

export function WorkspaceCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`workspace-card ${className}`}>{children}</section>
  );
}

export function EmptyStateCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon size={27} strokeWidth={1.4} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function EditorField({
  label,
  description,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = `${fieldId}-description`;
  const describedBy =
    [props['aria-describedby'], description ? descriptionId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="editor-field">
      <label htmlFor={fieldId}>{label}</label>
      <input {...props} id={fieldId} aria-describedby={describedBy} />
      {description && (
        <p id={descriptionId} className="field-description">
          {description}
        </p>
      )}
    </div>
  );
}
