import { useState } from 'react';
import { actions, useAppState } from '../../lib/store';
import { Button } from '../../ui/Button';
import { TextInput, Toggle } from '../../ui/Form';
import { Card, PageHeader, SectionLabel } from '../../ui/Layout';
import { toast } from '../../ui/toast';

export function Dorm() {
  const state = useAppState();
  const [dormName, setDormName] = useState(state.settings.dormName);
  const [yearLabel, setYearLabel] = useState(state.settings.yearLabel);
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Dorm and year" />
      <Card pad>
        <div className="stack">
          <TextInput label="Dorm name" value={dormName} onChange={(e) => setDormName(e.target.value)} />
          <TextInput label="School year" value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} help="Printed on every sheet." />
          <Button onClick={() => { if (!dormName.trim()) return toast('Name the dorm.', 'error'); actions.updateSettings({ dormName: dormName.trim(), yearLabel: yearLabel.trim() }); toast('Saved'); }}>Save</Button>
        </div>
      </Card>
      <SectionLabel>Rules</SectionLabel>
      <Card>
        <Toggle label="RAs can read notes from other RAs' checks" help="Off means an RA only sees notes on checks they did themselves. Deans always see everything." checked={state.settings.raSeeNotes} onChange={(v) => actions.updateSettings({ raSeeNotes: v })} />
        <Toggle label="Reminders allowed" help="Turn off to silence reminders for everyone, for example over a break." checked={state.settings.remindersEnabled} onChange={(v) => actions.updateSettings({ remindersEnabled: v })} />
      </Card>
    </>
  );
}
