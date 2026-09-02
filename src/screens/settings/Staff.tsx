import { useAppState } from '../../lib/store';
import { roleLabel } from '../../lib/permissions';
import type { StaffUser } from '../../lib/types';
import { Button } from '../../ui/Button';
import { Card, Empty, ListRow, PageHeader, SectionLabel } from '../../ui/Layout';

export function Staff({ user }: { user: StaffUser }) {
  const state = useAppState();
  const isDean = user.role === 'dean';
  const floorsOf = (s: StaffUser) => s.floorIds.map((id) => state.floors.find((f) => f.id === id)?.name).filter(Boolean).join(', ');
  const groups: { label: string; role: StaffUser['role'] }[] = [
    { label: 'Deans', role: 'dean' },
    { label: 'Head RA', role: 'headra' },
    { label: 'RAs', role: 'ra' },
  ];
  const inactive = state.staff.filter((s) => !s.active && (isDean || s.role === 'ra'));
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Staff" subtitle={isDean ? 'Deans, the head RA and the RAs. Each signs in with a PIN.' : 'The RAs on your team.'} actions={<Button iconOnly round icon="plus" aria-label="Add staff" to="/settings/staff/new" />} />
      {groups.map((g) => {
        const people = state.staff.filter((s) => s.active && s.role === g.role).sort((a, b) => a.name.localeCompare(b.name));
        if (!people.length && g.role !== 'ra') return null;
        const editable = isDean || g.role === 'ra';
        return (
          <div key={g.role} className="stack-sm">
            <SectionLabel>{g.label}</SectionLabel>
            <Card>
              {people.length === 0 && <Empty>No RAs yet. Add the RAs and assign each to a floor.</Empty>}
              {people.map((s) => (
                <ListRow key={s.id} to={editable ? `/settings/staff/${s.id}` : undefined} title={s.name} subtitle={`${roleLabel(s.role)}${floorsOf(s) ? ` · ${floorsOf(s)}` : s.role === 'ra' ? ' · no floor yet' : ''}${s.id === user.id ? ' · you' : ''}`} chevron={editable} />
              ))}
            </Card>
          </div>
        );
      })}
      {inactive.length > 0 && (
        <div className="stack-sm">
          <SectionLabel>Not active</SectionLabel>
          <Card>
            {inactive.map((s) => <ListRow key={s.id} to={`/settings/staff/${s.id}`} title={s.name} subtitle={`${roleLabel(s.role)} · deactivated`} chevron />)}
          </Card>
        </div>
      )}
      <p className="muted small">Removing an RA keeps their name on the checks they submitted. Re-appointing someone next year is one tap under Not active.</p>
    </>
  );
}
