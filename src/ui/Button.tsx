import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'outline' | 'soft' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: IconName;
  iconOnly?: boolean;
  round?: boolean;
  to?: string;
  children?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', block, icon, iconOnly, round, to, children, className = '', type = 'button', ...rest }: Props) {
  const cls = ['btn', variant, size, block ? 'block' : '', iconOnly ? 'icon-only' : '', round ? 'round' : '', className].filter(Boolean).join(' ');
  const inner = (
    <>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 20} />}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={rest['aria-label']}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} {...rest}>
      {inner}
    </button>
  );
}
