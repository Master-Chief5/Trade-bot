import type { StatusType } from '../lib/types';

export function StatusPill({ status, small, onClick, ariaLabel }: { status: StatusType | undefined; small?: boolean; onClick?: () => void; ariaLabel?: string }) {
  const style = { '--c': status?.color ?? '#888' } as React.CSSProperties;
  const cls = `pill ${small ? 'sm' : ''}`;
  const inner = (
    <>
      <span className="code">{status?.code ?? '?'}</span>
      <span>{status?.name ?? 'Unknown'}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick} aria-label={ariaLabel}>
        {inner}
      </button>
    );
  }
  return (
    <span className={cls} style={style}>
      {inner}
    </span>
  );
}

export function Counts({ present, absent, excused, codes }: { present: number; absent: number; excused: number; codes?: { code: string; count: number; countsAs: string }[] }) {
  if (codes) {
    const shown = codes.filter((c) => c.count > 0);
    if (!shown.length) return <span className="counts muted">—</span>;
    return (
      <span className="counts">
        {shown.map((c, i) => (
          <span key={c.code}>
            {i > 0 && <span className="muted"> · </span>}
            <span className={c.countsAs}>
              {c.count} {c.code}
            </span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="counts">
      <span className="present">{present} P</span>
      <span className="muted"> · </span>
      <span className="absent">{absent} A</span>
      <span className="muted"> · </span>
      <span className="excused">{excused} away</span>
    </span>
  );
}
