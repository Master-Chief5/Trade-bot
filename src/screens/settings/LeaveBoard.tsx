import { useState } from 'react';
import { actions, boyName, useAppState } from '../../lib/store';
import { formatDate, todayKey } from '../../lib/dates';
import type { StaffUser } from '../../lib/types';
import { Button } from '../../ui/Button';
import { SelectInput, TextInput } from '../../ui/Form';
import { Card, Empty, ListRow, PageHeader, SectionLabel } from '../../ui/Layout';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';

export function LeaveBoard({ user }: { user: StaffUser }) {
  const state = useAppState();
  const today = todayKey();
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const withBoy = state.leaves.map((l) => ({ l, boy: state.boys.find((b) => b.id === l.boyId) })).filter((x) => x.boy);
  const current = withBoy.filter(({ l }) => l.from <= today && l.to >= today).sort((a, b) => a.l.to.localeCompare(b.l.to));
  const upcoming = withBoy.filter(({ l }) => l.from > today).sort((a, b) => a.l.from.localeCompare(b.l.from));
  const past = withBoy.filter(({ l }) => l.to < today).sort((a, b) => b.l.to.localeCompare(a.l.to)).slice(0, 30);
  const row = ({ l, boy }: (typeof withBoy)[number]) => (
    <ListRow key={l.id} to={`/boys/${boy!.id}`} title={boyName(boy!)} subtitle={`${formatDate(l.from)} to ${formatDate(l.to)}${l.reason ? ` · ${l.reason}` : ''}`} trail={<Button variant="ghost" size="sm" onClick={(e) => { e.preventDefault(); actions.deleteLeave(l.id, user); toast('Removed'); }}>Remove</Button>} />
  );
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Leave board" subtitle="Boys signed out ahead of time are pre-marked away on every check in the range." actions={<Button iconOnly round icon="plus" aria-label="Sign a boy out" onClick={() => setAdding(true)} />} />
      <SectionLabel>Away now</SectionLabel>
      <Card>{current.length ? current.map(row) : <Empty>Nobody is signed out today.</Empty>}</Card>
      <SectionLabel>Coming up</SectionLabel>
      <Card>{upcoming.length ? upcoming.map(row) : <Empty>Nothing planned.</Empty>}</Card>
      {past.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowPast(!showPast)}>{showPast ? 'Hide past leave' : `Show past leave (${past.length})`}</Button>
      )}
      {showPast && <Card>{past.map(row)}</Card>}
      <Sheet open={adding} title="Sign a boy out" onClose={() => setAdding(false)}>
        <AddLeave user={user} onClose={() => setAdding(false)} />
      </Sheet>
    </>
  );
}

function AddLeave({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const state = useAppState();
  const boys = state.boys.filter((b) => b.active).sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  const [boyId, setBoyId] = useState(boys[0]?.id ?? '');
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [reason, setReason] = useState('');
  return (
    <div className="stack">
      <SelectInput label="Boy" value={boyId} onChange={(e) => setBoyId(e.target.value)}>
        {boys.map((b) => <option key={b.id} value={b.id}>{b.lastName}, {b.firstName}{b.preferredName ? ` (${b.preferredName})` : ''} · Gr {b.grade}</option>)}
      </SelectInput>
      <div className="grid-2">
        <TextInput label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextInput label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <TextInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Home for the weekend, sports trip" />
      <Button size="lg" disabled={!boyId} onClick={() => {
        const res = actions.addLeave({ boyId, from, to, reason }, user);
        if (!res.ok) return toast(res.error, 'error');
        toast('Signed out');
        onClose();
      }}>Sign out</Button>
    </div>
  );
}
