import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { actions, boyName, useAppState } from '../lib/store';
import { checksForBoy, consecutiveAbsences, floorOfBoy, roomOccupants, roomsOnFloor, sortedFloors, statusById } from '../lib/checks';
import { formatDate, formatDateShort, formatDateTime, todayKey } from '../lib/dates';
import { can, visibleFloorIds } from '../lib/permissions';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { SelectInput, TextInput } from '../ui/Form';
import { Banner, Card, Empty, ListRow, PageHeader, SectionLabel } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { StatusPill } from '../ui/StatusPill';
import { toast } from '../ui/toast';

export function BoyDetail({ user }: { user: StaffUser }) {
  const { id } = useParams();
  const state = useAppState();
  const navigate = useNavigate();
  const boy = state.boys.find((b) => b.id === id);
  const [moving, setMoving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  if (!boy) {
    return (
      <>
        <PageHeader back="/boys" title="Not found" />
        <Card><Empty>This boy is not on the roster.</Empty></Card>
      </>
    );
  }
  const room = state.rooms.find((r) => r.id === boy.roomId);
  const floor = floorOfBoy(state, boy);
  const perms = state.headRAPermissions;
  const manage = can(user, 'manageBoys', perms);
  const canMove = can(user, 'moveBoys', perms) || manage;
  const seeNotes = user.role === 'dean' || state.settings.raSeeNotes;
  const seeDeanNotes = user.role === 'dean';
  const visible = visibleFloorIds(state, user);
  const history = checksForBoy(state, boy.id, 30).filter(({ check }) => visible.includes(check.floorId)).slice(0, 14);
  const streak = consecutiveAbsences(state, boy.id, todayKey());
  const leaves = state.leaves.filter((l) => l.boyId === boy.id && l.to >= todayKey()).sort((a, b) => a.from.localeCompare(b.from));
  const moves = state.moves.filter((m) => m.boyId === boy.id).slice(-5).reverse();

  const remove = () => {
    if (!window.confirm(`Remove ${boyName(boy)} from the roster? He stays on past sheets.`)) return;
    actions.setBoyActive(boy.id, false, user);
    toast('Removed from the roster');
    navigate('/boys');
  };

  return (
    <>
      <PageHeader
        back="/boys"
        backLabel="Boys"
        title={boyName(boy)}
        subtitle={`Grade ${boy.grade} · ${room ? `Room ${room.number}` : 'No room'}${floor ? ` · ${floor.name}` : ''}${boy.active ? '' : ' · removed'}`}
        actions={manage ? <Button variant="soft" size="sm" icon="pencil" to={`/boys/${boy.id}/edit`}>Edit</Button> : undefined}
      />
      {streak >= 3 && <Banner kind="warn" icon="flag">Absent at the last {streak} checks in a row.</Banner>}
      {boy.preferredName && <div className="small muted">Goes by {boy.preferredName}. Legal name {boy.firstName} {boy.lastName}.</div>}
      {seeDeanNotes && boy.deanNotes && (
        <Card pad>
          <div className="eyebrow">Dean's notes</div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{boy.deanNotes}</p>
        </Card>
      )}
      <div className="row wrap">
        {canMove && boy.active && <Button variant="outline" size="sm" icon="floors" onClick={() => setMoving(true)}>Move room</Button>}
        {can(user, 'manageLeave', perms) && boy.active && <Button variant="outline" size="sm" icon="calendar" onClick={() => setLeaveOpen(true)}>Sign out</Button>}
        {manage && boy.active && <Button variant="danger" size="sm" onClick={remove}>Remove</Button>}
        {manage && !boy.active && <Button variant="outline" size="sm" onClick={() => { actions.setBoyActive(boy.id, true, user); toast('Back on the roster'); }}>Put back on roster</Button>}
      </div>
      {leaves.length > 0 && (
        <>
          <SectionLabel>Signed out</SectionLabel>
          <Card>
            {leaves.map((l) => (
              <ListRow key={l.id} icon="calendar" title={`${formatDate(l.from)} to ${formatDate(l.to)}`} subtitle={l.reason || 'No reason given'} trail={can(user, 'manageLeave', perms) ? <Button variant="ghost" size="sm" onClick={() => actions.deleteLeave(l.id, user)}>Remove</Button> : undefined} />
            ))}
          </Card>
        </>
      )}
      <SectionLabel>Recent checks</SectionLabel>
      <Card>
        {history.length === 0 ? (
          <Empty>No submitted checks yet.</Empty>
        ) : (
          history.map(({ check, entry }) => (
            <ListRow key={check.id} to={`/check/${check.id}`} title={`${formatDate(check.date)} · ${check.scheduleName}`} subtitle={`${check.floorName} · Room ${entry.roomNumber}${entry.note && (seeNotes || check.raId === user.id) ? ` · ${entry.note}` : ''}`} trail={<StatusPill small status={statusById(state, entry.statusId)} />} />
          ))
        )}
      </Card>
      {user.role === 'dean' && moves.length > 0 && (
        <>
          <SectionLabel>Room history</SectionLabel>
          <Card>
            {moves.map((m) => (
              <ListRow key={m.id} title={`${m.fromRoom ?? 'No room'} → ${m.toRoom ?? 'No room'}`} subtitle={formatDateTime(m.at)} />
            ))}
          </Card>
        </>
      )}
      <Sheet open={moving} title="Move room" onClose={() => setMoving(false)}>
        <MoveForm boyId={boy.id} currentRoomId={boy.roomId} user={user} onClose={() => setMoving(false)} />
      </Sheet>
      <Sheet open={leaveOpen} title={`Sign out ${boy.firstName}`} onClose={() => setLeaveOpen(false)}>
        <LeaveForm boyId={boy.id} user={user} onClose={() => setLeaveOpen(false)} />
      </Sheet>
    </>
  );
}

export function MoveForm({ boyId, currentRoomId, user, onClose }: { boyId: string; currentRoomId: string | null; user: StaffUser; onClose: () => void }) {
  const state = useAppState();
  const currentFloor = state.rooms.find((r) => r.id === currentRoomId)?.floorId ?? sortedFloors(state)[0]?.id ?? '';
  const [floorId, setFloorId] = useState(currentFloor);
  const [roomId, setRoomId] = useState(currentRoomId ?? '');
  const rooms = roomsOnFloor(state, floorId).filter((r) => r.type !== 'unused');
  return (
    <div className="stack">
      <SelectInput label="Floor" value={floorId} onChange={(e) => { setFloorId(e.target.value); setRoomId(''); }}>
        {sortedFloors(state).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </SelectInput>
      <SelectInput label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        <option value="">No room</option>
        {rooms.map((r) => {
          const n = roomOccupants(state, r.id).filter((b) => b.id !== boyId).length;
          return <option key={r.id} value={r.id}>{r.number} · {n} of {r.capacity} beds used{r.type === 'ra' ? ' · RA room' : ''}</option>;
        })}
      </SelectInput>
      <Button size="lg" onClick={() => { actions.moveBoy(boyId, roomId || null, user); toast(roomId ? 'Moved' : 'Room cleared'); onClose(); }}>Move</Button>
    </div>
  );
}

export function LeaveForm({ boyId, user, onClose }: { boyId: string; user: StaffUser; onClose: () => void }) {
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [reason, setReason] = useState('');
  return (
    <div className="stack">
      <div className="grid-2">
        <TextInput label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextInput label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <TextInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Home for the weekend, sports trip, infirmary" />
      <p className="muted small">He will be pre-marked away on every check between {formatDateShort(from)} and {formatDateShort(to)}.</p>
      <Button size="lg" onClick={() => {
        const res = actions.addLeave({ boyId, from, to, reason }, user);
        if (!res.ok) return toast(res.error, 'error');
        toast('Signed out');
        onClose();
      }}>Sign out</Button>
    </div>
  );
}
