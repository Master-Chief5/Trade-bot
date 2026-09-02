import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { actions, useAppState } from '../../lib/store';
import { sortedFloors } from '../../lib/checks';
import { can } from '../../lib/permissions';
import type { Role, StaffUser } from '../../lib/types';
import { Button } from '../../ui/Button';
import { SelectInput, TextInput, Toggle } from '../../ui/Form';
import { Banner, Card, PageHeader } from '../../ui/Layout';
import { toast } from '../../ui/toast';

export function StaffEdit({ user }: { user: StaffUser }) {
  const { id } = useParams();
  const state = useAppState();
  const navigate = useNavigate();
  const existing = id ? state.staff.find((s) => s.id === id) : undefined;
  const isDean = user.role === 'dean';
  const canAssign = isDean || can(user, 'assignRAs', state.headRAPermissions);
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState<Role>(existing?.role ?? 'ra');
  const [pin, setPin] = useState('');
  const [floorIds, setFloorIds] = useState<string[]>(existing?.floorIds ?? []);
  const [error, setError] = useState('');
  if (id && !existing) return <Navigate to="/settings/staff" replace />;
  if (existing && !isDean && existing.role !== 'ra') return <Navigate to="/settings/staff" replace />;

  const activeDeans = state.staff.filter((s) => s.active && s.role === 'dean').length;
  const isSelf = existing?.id === user.id;
  const lastDean = existing?.role === 'dean' && activeDeans <= 1;

  const save = () => {
    if (!name.trim()) return setError('A name is required.');
    if (!existing && !/^\d{4,6}$/.test(pin)) return setError('Set a PIN of 4 to 6 digits.');
    if (pin && !/^\d{4,6}$/.test(pin)) return setError('A PIN is 4 to 6 digits.');
    if (!isDean && role !== 'ra') return setError('Only a dean can create deans or a head RA.');
    if (existing) {
      actions.updateStaff(existing.id, { name: name.trim(), email: email.trim() || undefined, role: isDean ? role : existing.role, floorIds: canAssign ? floorIds : existing.floorIds, ...(pin ? { pin } : {}) }, user);
      toast('Saved');
      navigate('/settings/staff', { replace: true });
    } else {
      actions.addStaff({ name, email, role, pin, floorIds: canAssign ? floorIds : [] }, user);
      toast(`${name.trim()} can now sign in with their PIN`);
      navigate('/settings/staff', { replace: true });
    }
  };
  const setActive = (active: boolean) => {
    if (!existing) return;
    if (!active && isSelf) return toast('You cannot deactivate yourself.', 'error');
    if (!active && lastDean) return toast('Keep at least one active dean.', 'error');
    actions.updateStaff(existing.id, { active }, user);
    toast(active ? 'Reactivated' : 'Deactivated');
  };

  return (
    <>
      <PageHeader back="/settings/staff" backLabel="Staff" title={existing ? existing.name : 'Add staff'} />
      {existing && !existing.active && <Banner kind="warn">This person is deactivated and cannot sign in.</Banner>}
      <Card pad>
        <div className="stack">
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" />
          <TextInput label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} help="Used when the online version sends invitations." />
          {isDean && (
            <SelectInput label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf}>
              <option value="ra">RA</option>
              {state.settings.headRAEnabled && <option value="headra">Head RA</option>}
              <option value="dean">Dean</option>
            </SelectInput>
          )}
          <TextInput label={existing ? 'New PIN (leave blank to keep)' : 'PIN'} inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} help="4 to 6 digits. Tell them in person." />
          {canAssign && role !== 'dean' && (
            <div className="field">
              <span className="label">Floors</span>
              <Card>
                {sortedFloors(state).map((f) => (
                  <Toggle key={f.id} label={f.name} checked={floorIds.includes(f.id)} onChange={(v) => setFloorIds((ids) => (v ? [...ids, f.id] : ids.filter((x) => x !== f.id)))} />
                ))}
              </Card>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          <Button size="lg" onClick={save}>{existing ? 'Save' : 'Add'}</Button>
        </div>
      </Card>
      {existing && !isSelf && (
        <Button variant={existing.active ? 'danger' : 'outline'} onClick={() => setActive(!existing.active)}>{existing.active ? 'Deactivate' : 'Reactivate'}</Button>
      )}
    </>
  );
}
