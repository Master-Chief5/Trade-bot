import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { refreshMembership, signOutAndWipe, syncNow, useOnline } from '../lib/online';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/Layout';
import { toast } from '../ui/toast';

export function Waiting({ reason }: { reason: 'pending' | 'device' | 'syncing' | 'revoked' }) {
  const online = useOnline();
  const navigate = useNavigate();
  useEffect(() => {
    const t = setInterval(() => void refreshMembership().then(() => syncNow()), 15_000);
    return () => clearInterval(t);
  }, []);
  const title = reason === 'pending' ? 'Waiting for a dean' : reason === 'device' ? 'This phone needs approval' : reason === 'revoked' ? 'You were removed from this dorm' : 'Almost there';
  const body =
    reason === 'pending'
      ? `You asked to join ${online.dorm?.name ?? 'the dorm'}. A dean will activate you from their phone. This screen updates by itself.`
      : reason === 'device'
        ? 'You are a member, but this phone does not hold the dorm key yet. A dean approves new phones under Settings → Online sync.'
        : reason === 'revoked'
          ? 'A dean removed your access. If that is a mistake, ask them to add you again with the join code.'
          : 'You are approved. The dorm data is downloading and a dean may still need to add you to the staff list.';
  return (
    <div className="signin">
      <div className="row" style={{ color: 'var(--duty)' }}>
        <Icon name="lock" size={30} />
        <div>
          <div className="eyebrow">{online.displayName}</div>
          <h1 style={{ fontSize: 26 }}>{title}</h1>
        </div>
      </div>
      <p className="muted">{body}</p>
      <Card pad>
        <div className="stack-sm">
          <div className="eyebrow">This phone's key fingerprint</div>
          <div className="mono" style={{ fontSize: 22 }}>{online.deviceFingerprint || '…'}</div>
          <p className="muted small">A dean can compare this with what they see before approving.</p>
        </div>
      </Card>
      <div className="row">
        <Button variant="outline" icon="sync" onClick={() => { void refreshMembership().then(() => syncNow()).then(() => toast('Checked')); }}>Check again</Button>
        <Button variant="ghost" icon="logout" onClick={() => { void signOutAndWipe().then(() => navigate('/', { replace: true })); }}>Sign out</Button>
      </div>
    </div>
  );
}
