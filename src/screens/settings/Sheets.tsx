import { useMemo, useState } from 'react';
import { actions, useAppState } from '../../lib/store';
import { naturalCompare, roomsOnFloor, scheduleCode, sortedFloors } from '../../lib/checks';
import { DAY_NAMES, DAY_NAMES_LONG } from '../../lib/dates';
import type { SheetTemplate } from '../../lib/types';
import { Button } from '../../ui/Button';
import { SelectInput, TextInput, Toggle } from '../../ui/Form';
import { Card, Empty, ListRow, PageHeader, SectionLabel } from '../../ui/Layout';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';

function daysLabel(days: number[]): string {
  if (days.length === 0) return 'No days';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  // A run of consecutive days reads better as a range than as a list.
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) return `${DAY_NAMES_LONG[sorted[0]]} to ${DAY_NAMES_LONG[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_NAMES[d]).join(', ');
}

export function Sheets() {
  const state = useAppState();
  const [editing, setEditing] = useState<SheetTemplate | 'new' | null>(null);
  const templates = [...state.sheetTemplates].sort((a, b) => a.sortOrder - b.sortOrder);
  const summary = (t: SheetTemplate) => {
    const checks = t.scheduleIds.map((id) => state.schedules.find((s) => s.id === id)).filter(Boolean).map((s) => scheduleCode(s!)).join(' · ') || 'No checks';
    const rooms = t.roomIds === 'floor' ? 'every room on the floor' : `${t.roomIds.length} ${t.roomIds.length === 1 ? 'room' : 'rooms'}`;
    return `${daysLabel(t.days)} · ${checks} · ${rooms}`;
  };
  return (
    <>
      <PageHeader
        back="/settings"
        backLabel="Settings"
        title="Check sheets"
        subtitle="The paper the deans file. Each one sets its own days, checks and rooms."
        actions={<Button iconOnly round icon="plus" aria-label="New sheet" onClick={() => setEditing('new')} />}
      />
      <Card>
        {templates.length === 0 && <Empty>No sheets yet. Add one so there is something to print.</Empty>}
        {templates.map((t) => (
          <ListRow key={t.id} onClick={() => setEditing(t)} title={t.name} subtitle={summary(t)} chevron />
        ))}
      </Card>
      <p className="muted small">
        A sheet is a layout, not a record. Change one and every week you print from then on uses the new shape — nights already
        submitted are untouched. Keep a Sunday-to-Thursday sheet and a separate weekend one if that is how the dorm runs.
      </p>
      <Sheet open={editing !== null} title={editing === 'new' ? 'New sheet' : 'Edit sheet'} onClose={() => setEditing(null)}>
        {editing !== null && <SheetForm existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function SheetForm({ existing, onClose }: { existing?: SheetTemplate; onClose: () => void }) {
  const state = useAppState();
  const floors = sortedFloors(state);
  const [name, setName] = useState(existing?.name ?? '');
  const [days, setDays] = useState<number[]>(existing?.days ?? [0, 1, 2, 3, 4]);
  const [scheduleIds, setScheduleIds] = useState<string[]>(existing?.scheduleIds ?? state.schedules.filter((s) => s.active).map((s) => s.id));
  const [allRooms, setAllRooms] = useState(existing ? existing.roomIds === 'floor' : true);
  // Rooms are picked from one floor at a time, but a sheet may list rooms from several.
  const [floorId, setFloorId] = useState(floors[0]?.id ?? '');
  const [roomIds, setRoomIds] = useState<string[]>(existing && existing.roomIds !== 'floor' ? existing.roomIds : []);

  const rooms = useMemo(() => (floorId ? roomsOnFloor(state, floorId) : []), [state, floorId]);
  const chosen = useMemo(
    () => state.rooms.filter((r) => roomIds.includes(r.id)).sort((a, b) => naturalCompare(a.number, b.number)),
    [state.rooms, roomIds],
  );

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));
  const toggleRoom = (id: string) => setRoomIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const toggleCheck = (id: string) =>
    setScheduleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const move = (id: string, by: number) =>
    setScheduleIds((ids) => {
      const i = ids.indexOf(id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= ids.length) return ids;
      const next = [...ids];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () => {
    if (!name.trim()) return toast('Name the sheet.', 'error');
    if (!days.length) return toast('Pick at least one day.', 'error');
    if (!scheduleIds.length) return toast('Pick at least one check to give a column.', 'error');
    if (!allRooms && !roomIds.length) return toast('Pick at least one room, or list every room on the floor.', 'error');
    const input = { name: name.trim(), days: [...days].sort((a, b) => a - b), scheduleIds, roomIds: allRooms ? ('floor' as const) : roomIds };
    if (existing) actions.updateSheetTemplate(existing.id, input);
    else actions.addSheetTemplate(input);
    toast('Saved');
    onClose();
  };

  const remove = () => {
    if (!existing || !window.confirm(`Delete "${existing.name}"? Sheets already printed are unaffected.`)) return;
    const res = actions.deleteSheetTemplate(existing.id);
    if (!res.ok) return toast(res.error, 'error');
    onClose();
  };

  // Ordered so the preview reads as the printed sheet does, left to right.
  const orderedChecks = scheduleIds.map((id) => state.schedules.find((s) => s.id === id)).filter(Boolean);
  const columns = days.length * scheduleIds.length;

  return (
    <div className="stack">
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Sunday to Thursday" help="Printed in the sheet's heading." />

      <div className="field">
        <span className="label">Days on the sheet</span>
        <div className="row" style={{ gap: 6 }}>
          {DAY_NAMES.map((d, i) => (
            <button key={d} type="button" className={`chip ${days.includes(i) ? 'on' : ''}`} aria-pressed={days.includes(i)} onClick={() => toggleDay(i)} style={{ flex: 1, padding: 0 }}>
              {d}
            </button>
          ))}
        </div>
        <span className="help">Each day gets its own block of columns and its own signature line.</span>
      </div>

      <SectionLabel>Checks, left to right</SectionLabel>
      <Card>
        {state.schedules.length === 0 && <Empty>No checks yet. Add one under Check schedules first.</Empty>}
        {orderedChecks.map((s, i) => (
          <div key={s!.id} className="listrow">
            <span className="body">
              <span className="primary-text">{scheduleCode(s!)} · {s!.name}</span>
              <span className="secondary-text">Column {i + 1} of {orderedChecks.length}</span>
            </span>
            <span className="trail">
              <Button variant="ghost" size="sm" iconOnly icon="up" aria-label={`Move ${s!.name} left`} disabled={i === 0} onClick={() => move(s!.id, -1)} />
              <Button variant="ghost" size="sm" iconOnly icon="down" aria-label={`Move ${s!.name} right`} disabled={i === orderedChecks.length - 1} onClick={() => move(s!.id, 1)} />
              <Button variant="ghost" size="sm" iconOnly icon="x" aria-label={`Remove ${s!.name}`} onClick={() => toggleCheck(s!.id)} />
            </span>
          </div>
        ))}
        {state.schedules.filter((s) => !scheduleIds.includes(s.id)).map((s) => (
          <ListRow key={s.id} onClick={() => toggleCheck(s.id)} title={`${scheduleCode(s)} · ${s.name}`} subtitle="Not on this sheet" trail={<Button variant="outline" size="sm" onClick={() => toggleCheck(s.id)}>Add</Button>} />
        ))}
      </Card>

      <SectionLabel>Rooms</SectionLabel>
      <Card>
        <Toggle label="Every room on the floor" help="Rooms added later appear on the sheet automatically." checked={allRooms} onChange={setAllRooms} />
      </Card>
      {!allRooms && (
        <>
          {floors.length > 1 && (
            <SelectInput label="Show rooms from" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </SelectInput>
          )}
          <Card>
            {rooms.length === 0 && <Empty>No rooms on this floor.</Empty>}
            {rooms.map((r) => (
              <Toggle key={r.id} label={`Room ${r.number}`} help={r.type === 'ra' ? 'RA room' : `${r.capacity} ${r.capacity === 1 ? 'bed' : 'beds'}`} checked={roomIds.includes(r.id)} onChange={() => toggleRoom(r.id)} />
            ))}
          </Card>
          <p className="muted small">
            {chosen.length ? `On the sheet: ${chosen.map((r) => r.number).join(', ')}` : 'No rooms chosen yet.'}
          </p>
        </>
      )}

      <Card pad>
        <p className="muted small" style={{ margin: 0 }}>
          {days.length && scheduleIds.length
            ? `${columns} mark ${columns === 1 ? 'column' : 'columns'} across — ${days.length} ${days.length === 1 ? 'day' : 'days'} × ${scheduleIds.length} ${scheduleIds.length === 1 ? 'check' : 'checks'}.${columns > 15 ? ' Prints landscape at this width.' : ''}`
            : 'Pick days and checks to see how wide the sheet will be.'}
        </p>
      </Card>

      <div className="row">
        {existing && <Button variant="danger" icon="trash" onClick={remove}>Delete</Button>}
        <Button className="grow" onClick={save}>Save</Button>
      </div>
    </div>
  );
}
