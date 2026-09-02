import { useState } from 'react';
import { actions, useAppState } from '../../lib/store';
import { sortedFloors } from '../../lib/checks';
import { DAY_NAMES, formatTime12, isValidTime } from '../../lib/dates';
import type { CheckSchedule } from '../../lib/types';
import { Button } from '../../ui/Button';
import { TextInput, Toggle } from '../../ui/Form';
import { Card, Empty, ListRow, PageHeader } from '../../ui/Layout';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';

function daysLabel(days: number[]): string {
  if (days.length === 7) return 'Every day';
  if (days.length === 0) return 'No days';
  const sorted = [...days].sort();
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join() === '0,6') return 'Weekends';
  return sorted.map((d) => DAY_NAMES[d]).join(', ');
}

export function Schedules() {
  const state = useAppState();
  const [editing, setEditing] = useState<CheckSchedule | 'new' | null>(null);
  const floorsLabel = (s: CheckSchedule) => (s.floorIds === 'all' ? 'All floors' : s.floorIds.map((id) => state.floors.find((f) => f.id === id)?.name).filter(Boolean).join(', ') || 'No floors');
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Check schedules" subtitle="Each schedule creates one check per floor per day." actions={<Button iconOnly round icon="plus" aria-label="Add schedule" onClick={() => setEditing('new')} />} />
      <Card>
        {state.schedules.length === 0 && <Empty>No schedules. Add one so checks appear on the home screen.</Empty>}
        {state.schedules.map((s) => (
          <ListRow key={s.id} onClick={() => setEditing(s)} title={s.name} subtitle={`${formatTime12(s.time)} · ${daysLabel(s.days)} · ${floorsLabel(s)} · reminder ${s.reminderMinutes} min · deadline +${s.deadlineMinutes} min`} trail={<span className={`tag ${s.active ? 'present' : 'neutral'}`}>{s.active ? 'On' : 'Off'}</span>} chevron />
        ))}
      </Card>
      <p className="muted small">Times can differ by day. For a Sabbath morning check, add a second schedule that only runs on Saturday.</p>
      <Sheet open={editing !== null} title={editing === 'new' ? 'New schedule' : 'Edit schedule'} onClose={() => setEditing(null)}>
        {editing !== null && <ScheduleForm existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function ScheduleForm({ existing, onClose }: { existing?: CheckSchedule; onClose: () => void }) {
  const state = useAppState();
  const floors = sortedFloors(state);
  const [name, setName] = useState(existing?.name ?? '');
  const [time, setTime] = useState(existing?.time ?? '22:00');
  const [days, setDays] = useState<number[]>(existing?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [allFloors, setAllFloors] = useState(existing ? existing.floorIds === 'all' : true);
  const [floorIds, setFloorIds] = useState<string[]>(existing && existing.floorIds !== 'all' ? existing.floorIds : floors.map((f) => f.id));
  const [reminder, setReminder] = useState(existing?.reminderMinutes ?? 15);
  const [deadline, setDeadline] = useState(existing?.deadlineMinutes ?? 20);
  const [active, setActive] = useState(existing?.active ?? true);
  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));
  const save = () => {
    if (!name.trim()) return toast('Name the check.', 'error');
    if (!isValidTime(time)) return toast('Enter a time like 22:00.', 'error');
    if (!days.length) return toast('Pick at least one day.', 'error');
    const input = { name: name.trim(), time, days, floorIds: allFloors ? ('all' as const) : floorIds, reminderMinutes: Math.max(0, reminder), deadlineMinutes: Math.max(0, deadline), active };
    if (existing) actions.updateSchedule(existing.id, input);
    else actions.addSchedule(input);
    toast('Saved');
    onClose();
  };
  const remove = () => {
    if (!existing || !window.confirm(`Delete "${existing.name}"? Past checks are kept.`)) return;
    actions.deleteSchedule(existing.id);
    onClose();
  };
  return (
    <div className="stack">
      <div className="grid-2">
        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Evening check" />
        <TextInput label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">Days</span>
        <div className="row" style={{ gap: 6 }}>
          {DAY_NAMES.map((d, i) => (
            <button key={d} type="button" className={`chip ${days.includes(i) ? 'on' : ''}`} aria-pressed={days.includes(i)} onClick={() => toggleDay(i)} style={{ flex: 1, padding: 0 }}>{d}</button>
          ))}
        </div>
      </div>
      <Card>
        <Toggle label="All floors" checked={allFloors} onChange={setAllFloors} />
        {!allFloors && floors.map((f) => (
          <Toggle key={f.id} label={f.name} checked={floorIds.includes(f.id)} onChange={(v) => setFloorIds((ids) => (v ? [...ids, f.id] : ids.filter((x) => x !== f.id)))} />
        ))}
      </Card>
      <div className="grid-2">
        <TextInput label="Reminder (minutes before)" type="number" inputMode="numeric" min={0} value={reminder} onChange={(e) => setReminder(Number(e.target.value))} />
        <TextInput label="Deadline (minutes after)" type="number" inputMode="numeric" min={0} value={deadline} onChange={(e) => setDeadline(Number(e.target.value))} help="After this the floor shows as late." />
      </div>
      <Card><Toggle label="Active" help="Turn off to pause without deleting." checked={active} onChange={setActive} /></Card>
      <div className="row">
        {existing && <Button variant="danger" icon="trash" onClick={remove}>Delete</Button>}
        <Button className="grow" onClick={save}>Save</Button>
      </div>
    </div>
  );
}
