import { useMemo, useState } from 'react';
import { actions, useAppState } from '../../lib/store';
import { scheduleCode, sortedFloors } from '../../lib/checks';
import { addDays, formatDateShort, todayKey } from '../../lib/dates';
import type { Assignment, StaffUser } from '../../lib/types';
import { Button } from '../../ui/Button';
import { SelectInput, TextInput } from '../../ui/Form';
import { Card, Empty, ListRow, PageHeader } from '../../ui/Layout';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';

/**
 * Deans naming who does which check. Without an assignment a check belongs to whoever is on
 * that floor; with one it belongs to the named person and disappears from everyone else's list.
 */
export function Assignments({ user }: { user: StaffUser }) {
  const state = useAppState();
  const [adding, setAdding] = useState(false);
  const today = todayKey();
  const live = useMemo(
    () => [...state.assignments].filter((a) => a.to >= today).sort((a, b) => a.from.localeCompare(b.from)),
    [state.assignments, today],
  );
  const past = useMemo(
    () => [...state.assignments].filter((a) => a.to < today).sort((a, b) => b.to.localeCompare(a.to)).slice(0, 20),
    [state.assignments, today],
  );

  const describe = (a: Assignment) => {
    const who = state.staff.find((s) => s.id === a.raId)?.name ?? 'Someone';
    const what = a.scheduleId === 'all' ? 'Every check' : state.schedules.find((s) => s.id === a.scheduleId)?.name ?? 'A check';
    const floor = state.floors.find((f) => f.id === a.floorId)?.name ?? '';
    const when = a.from === a.to ? formatDateShort(a.from) : `${formatDateShort(a.from)} to ${formatDateShort(a.to)}`;
    return { title: `${who} · ${what}`, subtitle: `${floor} · ${when}` };
  };

  return (
    <>
      <PageHeader
        back="/settings"
        backLabel="Settings"
        title="Who does what"
        subtitle="Put a named person on a check. Leave a check unassigned and anyone on that floor can do it."
        actions={<Button iconOnly round icon="plus" aria-label="Assign a check" onClick={() => setAdding(true)} />}
      />
      <Card>
        {live.length === 0 && <Empty>Nothing assigned. Every check belongs to whoever covers the floor.</Empty>}
        {live.map((a) => {
          const d = describe(a);
          return (
            <ListRow
              key={a.id}
              title={d.title}
              subtitle={d.subtitle}
              trail={<Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Remove ${d.title}`} onClick={() => actions.deleteAssignment(a.id, user)} />}
            />
          );
        })}
      </Card>
      {past.length > 0 && (
        <>
          <p className="muted small">Finished</p>
          <Card>
            {past.map((a) => {
              const d = describe(a);
              return <ListRow key={a.id} title={d.title} subtitle={d.subtitle} />;
            })}
          </Card>
        </>
      )}
      <p className="muted small">
        An assignment only decides whose list a check appears on. A dean can always see and do everything, and the person named can still
        hand it over to someone else if they get stuck.
      </p>
      <Sheet open={adding} title="Assign a check" onClose={() => setAdding(false)}>
        {adding && <AssignForm user={user} onClose={() => setAdding(false)} />}
      </Sheet>
    </>
  );
}

function AssignForm({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const state = useAppState();
  const floors = sortedFloors(state);
  const staff = state.staff.filter((s) => s.active && s.role !== 'dean');
  const [raId, setRaId] = useState(staff[0]?.id ?? '');
  const [floorId, setFloorId] = useState(floors[0]?.id ?? '');
  const [scheduleId, setScheduleId] = useState<string>('all');
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());

  const save = () => {
    if (!raId) return toast('Pick who is doing it.', 'error');
    const res = actions.addAssignment({ raId, floorId, scheduleId, from, to }, user);
    if (!res.ok) return toast(res.error, 'error');
    toast('Assigned');
    onClose();
  };

  return (
    <div className="stack">
      {staff.length === 0 && <Empty>No RAs yet. Add one under Staff first.</Empty>}
      <SelectInput label="Who" value={raId} onChange={(e) => setRaId(e.target.value)}>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectInput>
      <SelectInput label="Floor" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
        {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </SelectInput>
      <SelectInput label="Which check" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
        <option value="all">Every check that day</option>
        {state.schedules.filter((s) => s.active).map((s) => (
          <option key={s.id} value={s.id}>{scheduleCode(s)} · {s.name}</option>
        ))}
      </SelectInput>
      <div className="grid-2">
        <TextInput label="From" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <TextInput label="To" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Button variant="outline" size="sm" onClick={() => { setFrom(todayKey()); setTo(todayKey()); }}>Today</Button>
        <Button variant="outline" size="sm" onClick={() => { setFrom(todayKey()); setTo(addDays(todayKey(), 6)); }}>This week</Button>
        <Button variant="outline" size="sm" onClick={() => { setFrom(todayKey()); setTo(addDays(todayKey(), 27)); }}>Four weeks</Button>
      </div>
      <Button block onClick={save} disabled={!raId}>Assign</Button>
    </div>
  );
}
