import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDormOnline, requestJoin, signOutAndWipe, useOnline } from '../lib/online';
import { useAppState } from '../lib/store';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Form';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/Layout';
import { toast } from '../ui/toast';

export function Join() {
  const online = useOnline();
  const state = useAppState();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [dormName, setDormName] = useState(state.settings.dormName || 'Ryan Hall');
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  const [showDean, setShowDean] = useState(false);

  const join = async () => {
    if (code.trim().length < 6) return toast('The code is 6 characters.', 'error');
    setBusy('join');
    const res = await requestJoin(code);
    setBusy(null);
    if (!res.ok) toast(res.error, 'error');
  };
  const create = async () => {
    setBusy('create');
    const res = await createDormOnline(dormName);
    setBusy(null);
    if (!res.ok) return toast(res.error, 'error');
    toast(state.setupComplete ? 'Sync is on. Your data is now encrypted online.' : 'Dorm created. Now set it up.');
    navigate(state.setupComplete ? '/' : '/setup', { replace: true });
  };

  return (
    <div className="signin" style={{ justifyContent: 'flex-start' }}>
      <div className="row" style={{ color: 'var(--duty)' }}>
        <Icon name="dorm" size={28} />
        <div>
          <div className="eyebrow">Signed in as {online.displayName}</div>
          <h1 style={{ fontSize: 26 }}>Join your dorm</h1>
        </div>
      </div>
      <Card pad>
        <div className="stack">
          <p>Ask a dean for the 6-character join code. Once you enter it, they activate you from their phone.</p>
          <TextInput label="Join code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABC234" className="input mono" autoCapitalize="characters" autoComplete="off" style={{ letterSpacing: '0.2em', fontSize: 22 }} />
          <Button size="lg" onClick={join} disabled={busy !== null || !online.deviceId}>{busy === 'join' ? 'Sending…' : !online.deviceId ? 'Getting this phone ready…' : 'Ask to join'}</Button>
        </div>
      </Card>
      {!showDean ? (
        <Button variant="ghost" size="sm" onClick={() => setShowDean(true)}>I am a dean setting up the dorm</Button>
      ) : (
        <Card pad>
          <div className="stack">
            <div className="eyebrow">Deans only</div>
            <p className="small">{state.setupComplete ? 'This device already has a dorm set up. Turning on sync uploads it, encrypted, and makes you the first key holder.' : 'Create the dorm online, then set up floors and rooms.'}</p>
            <TextInput label="Dorm name" value={dormName} onChange={(e) => setDormName(e.target.value)} />
            <Button size="lg" variant="outline" onClick={create} disabled={busy !== null || !online.deviceId}>{busy === 'create' ? 'Creating…' : !online.deviceId ? 'Getting this phone ready…' : state.setupComplete ? 'Turn on sync for this dorm' : 'Create the dorm'}</Button>
          </div>
        </Card>
      )}
      <Button variant="ghost" size="sm" icon="logout" onClick={() => { void signOutAndWipe().then(() => navigate('/', { replace: true })); }}>Sign out</Button>
    </div>
  );
}
