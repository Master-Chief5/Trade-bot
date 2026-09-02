import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { actions, boyName, useAppState } from '../lib/store';
import { roomOccupants, roomStates, roomsOnFloor, sortedFloors, tally, type RoomState } from '../lib/checks';
import { formatDate, todayKey } from '../lib/dates';
import { can, visibleFloorIds } from '../lib/permissions';
import type { Floor, Room, RoomType, StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { Segmented, SelectInput, TextInput } from '../ui/Form';
import { Card, Empty, ListRow, PageHeader } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { Counts } from '../ui/StatusPill';
import { toast } from '../ui/toast';

export function Floors({ user }: { user: StaffUser }) {
  const state = useAppState();
  const navigate = useNavigate();
  const { floorId } = useParams();
  const today = todayKey();
  const manage = can(user, 'manageDorm', state.headRAPermissions);
  const visible = visibleFloorIds(state, user);
  const floors = sortedFloors(state).filter((f) => visible.includes(f.id));
  const floor = floors.find((f) => f.id === floorId) ?? floors[0];
  const [editing, setEditing] = useState(false);
  const [roomSheet, setRoomSheet] = useState<Room | null>(null);
  const [addRooms, setAddRooms] = useState(false);
  const [floorSheet, setFloorSheet] = useState<'edit' | 'new' | null>(null);

  const rooms = useMemo(() => (floor ? roomsOnFloor(state, floor.id) : []), [state, floor]);
  const states = useMemo(() => (floor ? roomStates(state, floor.id, today) : new Map<string, RoomState>()), [state, floor, today]);
  const latest = floor ? state.checks.filter((c) => c.floorId === floor.id && c.date === today).sort((a, b) => b.time.localeCompare(a.time))[0] : undefined;
  const boysCount = rooms.reduce((n, r) => n + roomOccupants(state, r.id).length, 0);

  const left: Room[] = [];
  const right: Room[] = [];
  rooms.forEach((r, i) => {
    const side = r.side ?? (i % 2 === 0 ? 'left' : 'right');
    (side === 'left' ? left : right).push(r);
  });

  return (
    <>
      <PageHeader
        title="Floors"
        subtitle={`${state.settings.dormName} · ${formatDate(today)}`}
        actions={manage ? <Button variant={editing ? 'primary' : 'soft'} size="sm" icon={editing ? 'check' : 'pencil'} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</Button> : undefined}
      />
      {floors.length === 0 ? (
        <Card>
          <Empty icon="floors">
            {manage ? 'No floors yet.' : 'You are not assigned to a floor yet.'}
            {manage && <Button size="sm" onClick={() => setFloorSheet('new')}>Add a floor</Button>}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="segmented" role="tablist" aria-label="Floor">
            {floors.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={f.id === floor?.id} className={f.id === floor?.id ? 'on' : ''} onClick={() => navigate(`/floors/${f.id}`, { replace: true })}>
                {f.name}
              </button>
            ))}
          </div>
          {floor && (
            <>
              <div className="row-between">
                <span style={{ fontWeight: 500 }}>{floor.name} · {boysCount} {boysCount === 1 ? 'boy' : 'boys'}{floor.gradeLabel ? ` · ${floor.gradeLabel}` : ''}</span>
                {latest ? (() => { const t = tally(latest, state.statusTypes); return <Counts codes={t.byCode} present={t.present} absent={t.absent} excused={t.excused} />; })() : <span className="small muted">No check yet today</span>}
              </div>
              {editing && (
                <div className="row wrap">
                  <Button variant="outline" size="sm" icon="plus" onClick={() => setAddRooms(true)}>Add rooms</Button>
                  <Button variant="outline" size="sm" icon="settings" onClick={() => setFloorSheet('edit')}>Floor settings</Button>
                  <Button variant="outline" size="sm" icon="floors" onClick={() => setFloorSheet('new')}>New floor</Button>
                </div>
              )}
              <Card pad>
                {rooms.length === 0 ? (
                  <Empty>No rooms on this floor yet.</Empty>
                ) : (
                  <div className={`floor-map ${floor.layout} wide`}>
                    <div className="floor-col">
                      {(floor.layout === 'single' ? rooms : left).map((r) => (
                        <Tile key={r.id} room={r} state={states.get(r.id) ?? 'empty'} names={roomOccupants(state, r.id).map((b) => shortName(b.firstName, b.lastName, b.preferredName))} onClick={() => setRoomSheet(r)} />
                      ))}
                    </div>
                    {floor.layout === 'corridor' && (
                      <>
                        <div className="corridor"><span>Corridor</span></div>
                        <div className="floor-col">
                          {right.map((r) => (
                            <Tile key={r.id} room={r} state={states.get(r.id) ?? 'empty'} names={roomOccupants(state, r.id).map((b) => shortName(b.firstName, b.lastName, b.preferredName))} onClick={() => setRoomSheet(r)} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
              <div className="legend">
                <span><i style={{ background: 'var(--present-soft)', borderColor: 'var(--present)' }} />All present</span>
                <span><i style={{ background: 'var(--absent-soft)', borderColor: 'var(--absent)' }} />Someone absent</span>
                <span><i style={{ background: 'var(--away-soft)', borderColor: 'var(--away)' }} />Signed out</span>
                <span><i style={{ background: 'var(--surface)', borderColor: 'var(--faint)' }} />Not checked yet</span>
                <span><i style={{ background: 'var(--surface)', borderColor: 'var(--rule-strong)', borderStyle: 'dashed' }} />Empty or RA room</span>
              </div>
              <p className="muted small">Tap a room to see who is in it.{editing ? ' In edit mode you can change its number, capacity, type, and which side of the corridor it sits on.' : ''}</p>
            </>
          )}
        </>
      )}

      <Sheet open={!!roomSheet} title={roomSheet ? `Room ${roomSheet.number}` : ''} onClose={() => setRoomSheet(null)}>
        {roomSheet && <RoomSheet room={state.rooms.find((r) => r.id === roomSheet.id) ?? roomSheet} editing={editing && manage} onClose={() => setRoomSheet(null)} />}
      </Sheet>
      <Sheet open={addRooms} title="Add rooms" onClose={() => setAddRooms(false)}>
        {floor && <AddRoomsForm floor={floor} onClose={() => setAddRooms(false)} />}
      </Sheet>
      <Sheet open={floorSheet !== null} title={floorSheet === 'new' ? 'New floor' : 'Floor settings'} onClose={() => setFloorSheet(null)}>
        <FloorForm floor={floorSheet === 'edit' ? floor : undefined} onClose={() => setFloorSheet(null)} onCreated={(id) => navigate(`/floors/${id}`, { replace: true })} />
      </Sheet>
    </>
  );
}

function shortName(first: string, last: string, preferred?: string): string {
  const f = preferred?.trim() || first;
  return `${f} ${last ? last[0] + '.' : ''}`.trim();
}

function Tile({ room, state, names, onClick }: { room: Room; state: RoomState; names: string[]; onClick: () => void }) {
  const cls = room.type === 'ra' ? 'ra' : room.type === 'unused' ? 'unused' : state;
  return (
    <button type="button" className={`tile ${cls}`} onClick={onClick} aria-label={`Room ${room.number}, ${names.length ? names.join(', ') : room.type === 'ra' ? 'RA room' : room.type === 'unused' ? 'not in use' : 'empty'}`}>
      <span className="num">{room.number}</span>
      <span className="who">{room.type === 'ra' && !names.length ? 'RA' : room.type === 'unused' ? 'Not in use' : names.length ? names.join(' · ') : 'Empty'}</span>
    </button>
  );
}

function RoomSheet({ room, editing, onClose }: { room: Room; editing: boolean; onClose: () => void }) {
  const state = useAppState();
  const boys = roomOccupants(state, room.id);
  const [number, setNumber] = useState(room.number);
  const [capacity, setCapacity] = useState(room.capacity);
  const [type, setType] = useState<RoomType>(room.type);
  const [side, setSide] = useState<'left' | 'right' | 'auto'>(room.side ?? 'auto');
  const save = () => {
    const dup = state.rooms.some((r) => r.id !== room.id && r.floorId === room.floorId && r.number.toLowerCase() === number.trim().toLowerCase());
    if (!number.trim()) return toast('Room number is required.', 'error');
    if (dup) return toast(`Room ${number.trim()} already exists on this floor.`, 'error');
    actions.updateRoom(room.id, { number: number.trim(), capacity: Math.max(1, capacity), type, side: side === 'auto' ? undefined : side });
    toast('Room saved');
    onClose();
  };
  const remove = () => {
    if (!window.confirm(`Delete room ${room.number}?`)) return;
    const res = actions.deleteRoom(room.id);
    if (!res.ok) return toast(res.error, 'error');
    onClose();
  };
  return (
    <div className="stack">
      <Card>
        {boys.length === 0 ? <Empty>{room.type === 'ra' ? 'RA room.' : room.type === 'unused' ? 'This room is not in use.' : 'Nobody is in this room.'}</Empty> : boys.map((b) => <ListRow key={b.id} to={`/boys/${b.id}`} title={boyName(b)} subtitle={`Grade ${b.grade}`} chevron />)}
      </Card>
      <div className="small muted">{boys.length} of {room.capacity} beds used</div>
      {editing && (
        <>
          <div className="grid-2">
            <TextInput label="Room number" value={number} onChange={(e) => setNumber(e.target.value)} />
            <TextInput label="Beds" type="number" inputMode="numeric" min={1} max={8} value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 1)} />
          </div>
          <SelectInput label="Type" value={type} onChange={(e) => setType(e.target.value as RoomType)}>
            <option value="standard">Boys' room</option>
            <option value="ra">RA room</option>
            <option value="unused">Not in use</option>
          </SelectInput>
          <div className="field">
            <span className="label">Side of corridor</span>
            <Segmented options={[{ value: 'auto', label: 'Auto' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} value={side} onChange={setSide} label="Side of corridor" />
          </div>
          <div className="row">
            <Button variant="danger" icon="trash" onClick={remove}>Delete</Button>
            <Button className="grow" onClick={save}>Save</Button>
          </div>
        </>
      )}
    </div>
  );
}

function AddRoomsForm({ floor, onClose }: { floor: Floor; onClose: () => void }) {
  const [mode, setMode] = useState<'range' | 'one'>('range');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [one, setOne] = useState('');
  const [capacity, setCapacity] = useState(2);
  const submit = () => {
    if (mode === 'range') {
      const a = Number(from);
      const b = Number(to);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return toast('Check the range.', 'error');
      const n = actions.addRoomsRange(floor.id, a, b, capacity);
      toast(n ? `Added ${n} rooms` : 'Those rooms already exist');
    } else {
      const res = actions.addRoom(floor.id, one, capacity);
      if (!res.ok) return toast(res.error, 'error');
      toast(`Added room ${one.trim()}`);
    }
    onClose();
  };
  return (
    <div className="stack">
      <Segmented options={[{ value: 'range', label: 'A range' }, { value: 'one', label: 'One room' }]} value={mode} onChange={setMode} label="How many" />
      {mode === 'range' ? (
        <div className="grid-2">
          <TextInput label="First room" type="number" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} autoFocus />
          <TextInput label="Last room" type="number" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      ) : (
        <TextInput label="Room number" value={one} onChange={(e) => setOne(e.target.value)} autoFocus placeholder="e.g. 214 or 2A" />
      )}
      <TextInput label="Beds per room" type="number" inputMode="numeric" min={1} max={8} value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 1)} />
      <Button size="lg" onClick={submit}>Add</Button>
    </div>
  );
}

function FloorForm({ floor, onClose, onCreated }: { floor?: Floor; onClose: () => void; onCreated: (id: string) => void }) {
  const state = useAppState();
  const [name, setName] = useState(floor?.name ?? '');
  const [gradeLabel, setGradeLabel] = useState(floor?.gradeLabel ?? '');
  const [layout, setLayout] = useState<Floor['layout']>(floor?.layout ?? 'corridor');
  const save = () => {
    if (!name.trim()) return toast('Name the floor.', 'error');
    if (floor) {
      actions.updateFloor(floor.id, { name: name.trim(), gradeLabel: gradeLabel.trim() || undefined, layout });
      toast('Floor saved');
    } else {
      const id = actions.addFloor(name, gradeLabel);
      actions.updateFloor(id, { layout });
      toast('Floor added. Now add its rooms.');
      onCreated(id);
    }
    onClose();
  };
  const remove = () => {
    if (!floor) return;
    if (!window.confirm(`Delete ${floor.name} and all its rooms?`)) return;
    const res = actions.deleteFloor(floor.id);
    if (!res.ok) return toast(res.error, 'error');
    onClose();
  };
  const sorted = sortedFloors(state);
  const idx = floor ? sorted.findIndex((f) => f.id === floor.id) : -1;
  return (
    <div className="stack">
      <TextInput label="Floor name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ground, Floor 2, Grade 9 floor" />
      <TextInput label="Grade label (optional)" value={gradeLabel} onChange={(e) => setGradeLabel(e.target.value)} placeholder="Grade 9, Mixed, Grades 11 to 12" help="Just a label. Grades are set on each boy." />
      <div className="field">
        <span className="label">Map layout</span>
        <Segmented options={[{ value: 'corridor', label: 'Two-sided corridor' }, { value: 'single', label: 'Single row' }]} value={layout} onChange={setLayout} label="Map layout" />
      </div>
      {floor && (
        <div className="row">
          <span className="small muted grow">Order in the tabs</span>
          <Button variant="outline" size="sm" icon="up" disabled={idx <= 0} onClick={() => actions.moveFloor(floor.id, -1)} aria-label="Move up" />
          <Button variant="outline" size="sm" icon="down" disabled={idx < 0 || idx >= sorted.length - 1} onClick={() => actions.moveFloor(floor.id, 1)} aria-label="Move down" />
        </div>
      )}
      <div className="row">
        {floor && <Button variant="danger" icon="trash" onClick={remove}>Delete floor</Button>}
        <Button className="grow" onClick={save}>{floor ? 'Save' : 'Add floor'}</Button>
      </div>
    </div>
  );
}
