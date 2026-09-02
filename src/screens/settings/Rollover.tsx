import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { actions, useAppState } from '../../lib/store';
import { downloadText } from '../../lib/download';
import { todayKey } from '../../lib/dates';
import type { StaffUser } from '../../lib/types';
import { Button } from '../../ui/Button';
import { TextInput, Toggle } from '../../ui/Form';
import { Banner, Card, PageHeader } from '../../ui/Layout';
import { toast } from '../../ui/toast';

function nextLabel(current: string): string {
  const m = current.match(/(\d{4})/);
  if (!m) return '';
  const y = Number(m[1]) + 1;
  return `${y}–${String(y + 1).slice(-2)}`;
}

export function Rollover({ user }: { user: StaffUser }) {
  const state = useAppState();
  const navigate = useNavigate();
  const [label, setLabel] = useState(nextLabel(state.settings.yearLabel));
  const [backedUp, setBackedUp] = useState(false);
  const [sure, setSure] = useState(false);
  const boys = state.boys.filter((b) => b.active).length;
  const checks = state.checks.length;
  const ras = state.staff.filter((s) => s.active && s.role !== 'dean').length;

  const run = () => {
    if (!label.trim()) return toast('Name the new year.', 'error');
    if (!window.confirm(`Archive ${state.settings.yearLabel} and start ${label}?`)) return;
    actions.archiveYear(label, user);
    toast(`Started ${label}. Now paste the new roster.`);
    navigate('/boys');
  };

  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Start a new school year" subtitle={`Archive ${state.settings.yearLabel} and begin fresh.`} />
      <Card pad>
        <div className="stack">
          <div><strong>What is kept:</strong> the deans, floors, rooms, status types and check schedules.</div>
          <div><strong>What is archived:</strong> {boys} boys, {checks} checks and all leave. Archived years stay readable and printable under Settings.</div>
          <div><strong>What is cleared:</strong> {ras} RAs and head RAs are deactivated. Re-appoint the ones who return under Staff.</div>
        </div>
      </Card>
      <Banner kind="warn">Export a backup first. This cannot be undone from inside the app.</Banner>
      <Button variant="outline" icon="download" onClick={() => { downloadText(`room-check-backup-${todayKey()}.json`, actions.exportJson()); setBackedUp(true); }}>Export backup</Button>
      <Card pad>
        <div className="stack">
          <TextInput label="New school year" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Card>
            <Toggle label="I have exported a backup" checked={backedUp} onChange={setBackedUp} />
            <Toggle label="I understand this archives the current year" checked={sure} onChange={setSure} />
          </Card>
          <Button size="lg" variant="danger" disabled={!backedUp || !sure} onClick={run}>Archive {state.settings.yearLabel} and start {label || '…'}</Button>
        </div>
      </Card>
    </>
  );
}
