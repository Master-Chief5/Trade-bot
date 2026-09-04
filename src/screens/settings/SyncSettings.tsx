import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { approveRequest, declineRequest, grantDevice, listMembers, listPending, onlineAvailable, regenerateJoinCode, revokeMember, signOutAndWipe, syncNow, useOnline, type MemberDevice, type PendingRequest } from '../../lib/online';
import { useAppState } from '../../lib/store';
import { sortedFloors } from '../../lib/checks';
import { formatDateTime } from '../../lib/dates';
import { roleLabel } from '../../lib/permissions';
import type { Role, StaffUser } from '../../lib/types';
import { Button } from '../../ui/Button';
import { SelectInput, Toggle } from '../../ui/Form';
import { Banner, Card, Empty, ListRow, PageHeader, SectionLabel } from '../../ui/Layout';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';

export function SyncSettings({ user }: { user: StaffUser }) {
  const online = useOnline();
  const state = useAppState();
  const navigate = useNavigate();
  const isDean = user.role === 'dean';
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [members, setMembers] = useState<MemberDevice[]>([]);
  const [approving, setApproving] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const dormId = online.dorm?.id;
  const keyVersion = online.dorm?.keyVersion;
  const reload = useCallback(async () => {
    if (!isDean || !dormId) return;
    const [p, m] = await Promise.all([listPending(), listMembers()]);
    setPending(p);
    setMembers(m);
    setLoading(false);
  }, [isDean, dormId]);

  // Poll as well as listen: websockets may be blocked, and a dean must not miss a request.
  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 8_000);
    return () => clearInterval(t);
  }, [reload, online.pendingRequests, keyVersion]);

  if (!onlineAvailable) {
    return (
      <>
        <PageHeader back="/settings" backLabel="Settings" title="Online sync" />
        <Banner kind="warn">This build has no online service configured, so the app works on this device only.</Banner>
      </>
    );
  }

  if (!online.session) {
    return (
      <>
        <PageHeader back="/settings" backLabel="Settings" title="Online sync" subtitle="Share the dorm between phones without the server ever reading it." />
        <Card pad>
          <div className="stack">
            <p>Right now everything lives on this device. Turning sync on uploads it encrypted, so RAs' phones and the deans' computer all see the same thing.</p>
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Every record is encrypted on the device before it is sent.</li>
              <li>The server holds accounts, phone keys and ciphertext. Nothing readable.</li>
              <li>A dean approves each RA and each phone. Removing someone changes the key.</li>
            </ul>
            <Button size="lg" onClick={() => navigate('/account?mode=signup')}>Create the dean's account</Button>
            <Button variant="ghost" onClick={() => navigate('/account')}>I already have an account</Button>
          </div>
        </Card>
      </>
    );
  }

  const sync = online.sync;
  const status = sync.error ? sync.error : sync.pendingCount ? `${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting to upload` : sync.lastSyncAt ? `Synced ${formatDateTime(sync.lastSyncAt)}` : 'Not synced yet';

  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Online sync" subtitle={online.dorm ? `${online.dorm.name} · ${online.displayName}` : online.displayName} />
      <Card>
        <ListRow icon={sync.error ? 'alert' : 'sync'} title={status} subtitle={online.hasKey ? 'This device holds the dorm key.' : 'This device is waiting for the dorm key.'} trail={<Button variant="ghost" size="sm" disabled={sync.busy} onClick={() => void syncNow().then(reload).then(() => toast('Synced'))}>Sync now</Button>} />
      </Card>

      {isDean && online.dorm && (
        <>
          <SectionLabel>Join code</SectionLabel>
          <Card pad>
            <div className="stack-sm">
              <div className="mono" style={{ fontSize: 34, letterSpacing: '0.2em' }}>{online.dorm.joinCode}</div>
              <p className="muted small">Give this to an RA after they create an account. They enter it, then you approve them below. Make a new code once everyone is in.</p>
              <Button variant="outline" size="sm" onClick={() => void regenerateJoinCode().then((r) => toast(r.ok ? 'New code' : r.error, r.ok ? 'ok' : 'error'))}>New code</Button>
            </div>
          </Card>

          <SectionLabel>Waiting to be activated{pending.length ? ` (${pending.length})` : ''}</SectionLabel>
          <Card>
            {pending.length === 0 ? (
              <Empty>{loading ? 'Checking…' : 'Nobody is waiting.'}</Empty>
            ) : (
              pending.map((p) => (
                <ListRow key={p.userId} title={p.name} subtitle={`${p.devices.map((d) => `${d.name} · ${d.fingerprint}`).join(' · ') || 'No phone registered yet'} · asked ${formatDateTime(p.requestedAt)}`} trail={<span className="row" style={{ gap: 6 }}><Button variant="ghost" size="sm" onClick={() => void declineRequest(p.userId).then(reload)}>Decline</Button><Button size="sm" onClick={() => setApproving(p)}>Approve</Button></span>} />
              ))
            )}
          </Card>

          <SectionLabel>Members and their phones</SectionLabel>
          <Card>
            {members.length === 0 && <Empty>{loading ? 'Checking…' : 'Just you so far.'}</Empty>}
            {members.map((m) => (
              <div key={m.userId} className="listrow" style={{ alignItems: 'flex-start' }}>
                <span className="body">
                  <span className="primary-text">{m.name} <span className="muted small">· {roleLabel(m.role)}</span></span>
                  {m.devices.length === 0 && <span className="secondary-text">No phone registered</span>}
                  {m.devices.map((d) => (
                    <span key={d.id} className="secondary-text row" style={{ gap: 8 }}>
                      <span className="mono">{d.fingerprint}</span> {d.name} · {d.hasKey ? 'has the key' : 'needs the key'}
                      {!d.hasKey && <Button variant="ghost" size="sm" onClick={() => void grantDevice(d.id).then((r) => { toast(r.ok ? 'Key sent' : r.error, r.ok ? 'ok' : 'error'); void reload(); })}>Approve phone</Button>}
                    </span>
                  ))}
                </span>
                {m.userId !== online.session?.user.id && (
                  <span className="trail">
                    <Button variant="danger" size="sm" onClick={() => { if (window.confirm(`Remove ${m.name}? Their phones lose access and the dorm key is changed.`)) void revokeMember(m.userId, user).then((r) => { toast(r.ok ? 'Removed and key rotated' : r.error, r.ok ? 'ok' : 'error'); void reload(); }); }}>Remove</Button>
                  </span>
                )}
              </div>
            ))}
          </Card>
          <p className="muted small">Approving sends the dorm key to that phone, sealed so only it can open it. Compare the fingerprint with the one on their screen if you want to be sure it is their phone.</p>
        </>
      )}

      {!isDean && (
        <p className="muted small">Your phone holds the dorm key. If you get a new phone, sign in on it and a dean approves it from here.</p>
      )}

      <Button variant="danger" icon="logout" onClick={() => { if (window.confirm('Sign out and remove the dorm data from this device?')) void signOutAndWipe().then(() => navigate('/', { replace: true })); }}>Sign out of this device</Button>

      <Sheet open={!!approving} title={approving ? `Activate ${approving.name}` : ''} onClose={() => setApproving(null)}>
        {approving && (
          <ApproveForm
            request={approving}
            floors={sortedFloors(state).map((f) => ({ id: f.id, name: f.name }))}
            headRAEnabled={state.settings.headRAEnabled}
            onDone={async (role, floorIds) => {
              const res = await approveRequest(approving.userId, role, floorIds, user);
              toast(res.ok ? `${approving.name} is in` : res.error, res.ok ? 'ok' : 'error');
              setApproving(null);
              void reload();
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function ApproveForm({ request, floors, headRAEnabled, onDone }: { request: PendingRequest; floors: { id: string; name: string }[]; headRAEnabled: boolean; onDone: (role: Role, floorIds: string[]) => Promise<void> }) {
  const [role, setRole] = useState<Role>('ra');
  const [floorIds, setFloorIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      {request.devices.length === 0 && <Banner kind="warn">They have not opened the app on a phone yet. You can approve now; their phone gets the key when it appears under Members.</Banner>}
      <SelectInput label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
        <option value="ra">RA</option>
        {headRAEnabled && <option value="headra">Head RA</option>}
        <option value="dean">Dean</option>
      </SelectInput>
      {role !== 'dean' && (
        <div className="field">
          <span className="label">Floors</span>
          <Card>
            {floors.map((f) => (
              <Toggle key={f.id} label={f.name} checked={floorIds.includes(f.id)} onChange={(v) => setFloorIds((ids) => (v ? [...ids, f.id] : ids.filter((x) => x !== f.id)))} />
            ))}
          </Card>
        </div>
      )}
      <Button size="lg" disabled={busy} onClick={() => { setBusy(true); void onDone(role, role === 'dean' ? [] : floorIds).finally(() => setBusy(false)); }}>{busy ? 'Activating…' : 'Activate'}</Button>
    </div>
  );
}
