import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { actions, useAppState } from '../lib/store';
import { findCheck, sortedFloors } from '../lib/checks';
import { todayKey } from '../lib/dates';
import { visibleFloorIds } from '../lib/permissions';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { SelectInput, TextInput } from '../ui/Form';
import { Banner, Card, PageHeader } from '../ui/Layout';
import { toast } from '../ui/toast';

export function EnterFromPaper({ user }: { user: StaffUser }) {
  const state = useAppState();
  const navigate = useNavigate();
  const floors = sortedFloors(state).filter((f) => visibleFloorIds(state, user).includes(f.id));
  const [date, setDate] = useState(todayKey());
  const [scheduleId, setScheduleId] = useState(state.schedules[0]?.id ?? '');
  const [floorId, setFloorId] = useState(floors[0]?.id ?? '');
  const existing = scheduleId && floorId ? findCheck(state, scheduleId, floorId, date) : undefined;

  const open = () => {
    if (!scheduleId || !floorId) return toast('Pick a check and a floor.', 'error');
    if (existing) {
      navigate(`/check/${existing.id}`);
      return;
    }
    const id = actions.startCheck(scheduleId, floorId, date, user, 'paper');
    navigate(`/check/${id}`);
  };

  return (
    <>
      <PageHeader back="/" backLabel="Tonight" title="Enter from paper" subtitle="Type in a check that was done on the blank sheet." />
      <Banner kind="info">The check is marked “entered from paper” in history and on the printout, so the record stays honest. Boys are listed by their current rooms.</Banner>
      <Card pad>
        <div className="stack">
          <TextInput label="Date" type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <SelectInput label="Check" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
            {state.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectInput>
          <SelectInput label="Floor" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
            {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </SelectInput>
          {existing && <p className="small muted">{existing.submittedAt ? 'That check was already submitted. You can view it, and a dean can reopen it.' : 'That check is already in progress. You will continue it.'}</p>}
          <Button size="lg" onClick={open}>{existing ? 'Open that check' : 'Open sheet'}</Button>
        </div>
      </Card>
    </>
  );
}
