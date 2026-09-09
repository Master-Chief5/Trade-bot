import { actions, useAppState } from '../../lib/store';
import { HEAD_RA_PERMISSION_LABELS } from '../../lib/defaults';
import type { StaffUser } from '../../lib/types';
import { Toggle } from '../../ui/Form';
import { Card, PageHeader, SectionLabel } from '../../ui/Layout';
import { toast } from '../../ui/toast';

export function HeadRA({ user }: { user: StaffUser }) {
  const state = useAppState();
  const perms = state.headRAPermissions;
  const headRAs = state.staff.filter((s) => s.active && s.role === 'headra');
  const setEnabled = (v: boolean) => {
    if (!v && headRAs.length) {
      if (!window.confirm(`${headRAs.map((h) => h.name).join(', ')} will become a regular RA. Continue?`)) return;
      headRAs.forEach((h) => actions.updateStaff(h.id, { role: 'ra' }, user));
    }
    actions.updateSettings({ headRAEnabled: v });
    toast(v ? 'Head RA role available' : 'No head RA this year');
  };
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Head RA" subtitle="Decide whether there is a head RA this year and what they may do." />
      <Card>
        <Toggle label="There is a head RA this year" help={headRAs.length ? `Currently ${headRAs.map((h) => h.name).join(', ')}` : 'Assign the role under Staff.'} checked={state.settings.headRAEnabled} onChange={setEnabled} />
      </Card>
      <SectionLabel>What the head RA may do</SectionLabel>
      <Card>
        {HEAD_RA_PERMISSION_LABELS.map((p) => (
          <Toggle key={p.key} label={p.label} help={p.help} checked={perms[p.key]} disabled={!state.settings.headRAEnabled} onChange={(v) => actions.setHeadRAPermissions({ ...perms, [p.key]: v }, user)} />
        ))}
      </Card>
      <p className="muted small">Everything else, such as status types, schedules, deans, leave, backups and the year rollover, stays with the deans.</p>
    </>
  );
}
