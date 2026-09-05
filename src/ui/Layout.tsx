import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

export function PageHeader({ eyebrow, title, subtitle, back, backLabel, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; back?: string | true; backLabel?: string; actions?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      {back &&
        (back === true ? (
          <button type="button" className="back" onClick={() => navigate(-1)}>
            <Icon name="back" size={20} />
            <span>{backLabel ?? 'Back'}</span>
          </button>
        ) : (
          <Link to={back} className="back">
            <Icon name="back" size={20} />
            <span>{backLabel ?? 'Back'}</span>
          </Link>
        ))}
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <div className="title-row">
        <h1>{title}</h1>
        {actions}
      </div>
      {subtitle && <div className="subtitle">{subtitle}</div>}
    </header>
  );
}

export function Card({ children, pad, className = '' }: { children: ReactNode; pad?: boolean; className?: string }) {
  return <div className={`card ${pad ? 'pad' : ''} ${className}`}>{children}</div>;
}

export function ListRow({ icon, lead, title, subtitle, trail, to, onClick, chevron, className = '' }: { icon?: IconName; lead?: ReactNode; title: ReactNode; subtitle?: ReactNode; trail?: ReactNode; to?: string; onClick?: () => void; chevron?: boolean; className?: string }) {
  const body = (
    <>
      {(icon || lead) && <span className="lead">{lead ?? (icon && <Icon name={icon} />)}</span>}
      <span className="body">
        <span className="primary-text">{title}</span>
        {subtitle && <span className="secondary-text">{subtitle}</span>}
      </span>
      {(trail || chevron) && (
        <span className="trail">
          {trail}
          {chevron && <Icon name="chevron" size={20} />}
        </span>
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={`listrow clickable ${className}`}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={`listrow clickable ${className}`} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={`listrow ${className}`}>{body}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="eyebrow section-label">{children}</div>;
}

export function Empty({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <div className="empty">
      {icon && <Icon name={icon} size={28} />}
      <div>{children}</div>
    </div>
  );
}

export function Banner({ kind = 'info', icon, children }: { kind?: 'info' | 'warn' | 'danger'; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      <span className="banner-icon">
        <Icon name={icon ?? (kind === 'info' ? 'info' : 'alert')} size={20} />
      </span>
      <div className="grow">{children}</div>
    </div>
  );
}

export function Stat({ value, label, color }: { value: ReactNode; label: string; color?: string }) {
  return (
    <div className="stat">
      <span className="value" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="label">{label}</span>
    </div>
  );
}

export interface TabDef {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

export function TabBar({ tabs, brandName, brandSub }: { tabs: TabDef[]; brandName: string; brandSub: string }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="brand">
        <Icon name="dorm" size={26} />
        <div>
          <div className="brand-name">{brandName}</div>
          <div className="brand-sub">{brandSub}</div>
        </div>
      </div>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
