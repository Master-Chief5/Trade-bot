import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { actions, useAppState } from '../lib/store';
import { roomOccupants, roomsOnFloor, sortedFloors } from '../lib/checks';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { SelectInput, TextArea, TextInput } from '../ui/Form';
import { Card, PageHeader } from '../ui/Layout';
import { toast } from '../ui/toast';

export function BoyForm({ user }: { user: StaffUser }) {
  const { id } = useParams();
  const state = useAppState();
  const navigate = useNavigate();
  const existing = id ? state.boys.find((b) => b.id === id) : undefined;
  const [firstName, setFirstName] = useState(existing?.firstName ?? '');
  const [lastName, setLastName] = useState(existing?.lastName ?? '');
  const [preferredName, setPreferredName] = useState(existing?.preferredName ?? '');
  const [grade, setGrade] = useState(existing?.grade ?? 9);
  const [roomId, setRoomId] = useState(existing?.roomId ?? '');
  const [deanNotes, setDeanNotes] = useState(existing?.deanNotes ?? '');
  const [error, setError] = useState('');
  const floors = sortedFloors(state);

  const save = () => {
    if (!firstName.trim() || !lastName.trim()) return setError('First and last name are required.');
    if (existing) {
      actions.updateBoy(existing.id, { firstName, lastName, preferredName: preferredName || undefined, grade, deanNotes: user.role === 'dean' ? deanNotes : existing.deanNotes }, user);
      if ((roomId || null) !== existing.roomId) actions.moveBoy(existing.id, roomId || null, user);
      toast('Saved');
      navigate(`/boys/${existing.id}`, { replace: true });
    } else {
      const newId = actions.addBoy({ firstName, lastName, preferredName, grade, roomId: roomId || null, deanNotes: user.role === 'dean' ? deanNotes : undefined }, user);
      toast('Added');
      navigate(`/boys/${newId}`, { replace: true });
    }
  };

  return (
    <>
      <PageHeader back={existing ? `/boys/${existing.id}` : '/boys'} title={existing ? 'Edit boy' : 'Add a boy'} />
      <Card pad>
        <div className="stack">
          <div className="grid-2">
            <TextInput label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus autoComplete="off" />
            <TextInput label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
          </div>
          <TextInput label="Goes by (optional)" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} help="Shown on the check screen and the sheet instead of the first name." />
          <SelectInput label="Grade" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {[7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </SelectInput>
          <SelectInput label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">No room yet</option>
            {floors.map((f) => (
              <optgroup key={f.id} label={f.name}>
                {roomsOnFloor(state, f.id).filter((r) => r.type !== 'unused').map((r) => {
                  const n = roomOccupants(state, r.id).filter((b) => b.id !== existing?.id).length;
                  return <option key={r.id} value={r.id}>{r.number} · {n} of {r.capacity} beds used</option>;
                })}
              </optgroup>
            ))}
          </SelectInput>
          {user.role === 'dean' && <TextArea label="Dean's notes (deans only)" value={deanNotes} onChange={(e) => setDeanNotes(e.target.value)} rows={3} style={{ fontFamily: 'inherit', minHeight: 80 }} />}
          {error && <div className="form-error">{error}</div>}
          <Button size="lg" onClick={save}>{existing ? 'Save' : 'Add boy'}</Button>
        </div>
      </Card>
    </>
  );
}
