import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../lib/store';
import { signIn } from '../lib/session';
import { roleLabel } from '../lib/permissions';
import type { StaffUser } from '../lib/types';
import { Icon } from '../ui/Icon';

export function PinPad({ length, onComplete, error }: { length: number; onComplete: (pin: string) => void; error: boolean }) {
  const [pin, setPin] = useState('');
  const press = (d: string) => {
    if (pin.length >= length) return;
    const next = pin + d;
    setPin(next);
    if (next.length === length) {
      onComplete(next);
      setTimeout(() => setPin(''), 250);
    }
  };
  return (
    <div className="stack">
      <div className={`pin-dots ${error ? 'shake' : ''}`} aria-label={`${pin.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} aria-label={d}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')} aria-label="0">
          0
        </button>
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete">
          <Icon name="back" size={26} />
        </button>
      </div>
    </div>
  );
}

export function SignIn() {
  const state = useAppState();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [error, setError] = useState(false);
  const groups = useMemo(() => {
    const active = state.staff.filter((s) => s.active);
    const byRole = (r: StaffUser['role']) => active.filter((s) => s.role === r).sort((a, b) => a.name.localeCompare(b.name));
    return [
      { label: 'Deans', people: byRole('dean') },
      { label: 'Head RA', people: byRole('headra') },
      { label: 'RAs', people: byRole('ra') },
    ].filter((g) => g.people.length);
  }, [state.staff]);

  const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  if (selected) {
    return (
      <div className="signin">
        <button type="button" className="back" onClick={() => { setSelected(null); setError(false); }}>
          <Icon name="back" size={20} />
          <span>Someone else</span>
        </button>
        <div className="row">
          <div className="avatar">{initials(selected.name)}</div>
          <div>
            <h1 style={{ fontSize: 24 }}>{selected.name}</h1>
            <div className="muted small">{roleLabel(selected.role)} · enter your PIN</div>
          </div>
        </div>
        <PinPad
          key={selected.id}
          length={selected.pin.length}
          error={error}
          onComplete={(pin) => {
            if (pin === selected.pin) {
              signIn(selected.id);
              navigate('/', { replace: true });
            } else {
              setError(true);
              setTimeout(() => setError(false), 400);
            }
          }}
        />
        {error && <div className="form-error" role="alert">That PIN is not right.</div>}
        <p className="muted small">Forgot your PIN? A dean can set a new one under Staff.</p>
      </div>
    );
  }

  return (
    <div className="signin">
      <div className="row" style={{ color: 'var(--duty)' }}>
        <Icon name="dorm" size={30} />
        <div>
          <h1 style={{ fontSize: 28 }}>{state.settings.dormName}</h1>
          <div className="muted small">Room check · {state.settings.yearLabel}</div>
        </div>
      </div>
      <p className="muted">Who are you?</p>
      {groups.length === 0 && <p className="form-error">No one can sign in yet. A dean needs to add staff.</p>}
      {groups.map((g) => (
        <div key={g.label} className="stack-sm">
          <div className="eyebrow">{g.label}</div>
          <div className="people">
            {g.people.map((p) => (
              <button key={p.id} type="button" className="person" onClick={() => setSelected(p)}>
                <div className="avatar">{initials(p.name)}</div>
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div className="muted small">{roleLabel(p.role)}</div>
                </div>
                <Icon name="chevron" size={20} className="faint" />
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="muted small">Sign-in is per phone. Anyone holding this phone can pick a name, so keep your PIN to yourself.</p>
    </div>
  );
}
