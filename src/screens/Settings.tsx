import { useNavigate } from 'react-router-dom';
import { useAppState } from '../lib/store';
import { signOut } from '../lib/session';
import { can, roleLabel } from '../lib/permissions';
import { notificationPermission, requestNotificationPermission, useRemindersEnabled } from '../lib/reminders';
import { useTheme } from '../lib/theme';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Form';
import { Card, ListRow, PageHeader, SectionLabel } from '../ui/Layout';
import { toast } from '../ui/toast';

export function Settings({ user }: { user: StaffUser }) {
  const state = useAppState();
  const navigate = useNavigate();
  const perms = state.headRAPermissions;
  const [remindersOn, setRemindersOn] = useRemindersEnabled();
  const [theme] = useTheme();
  const floors = user.floorIds.map((id) => state.floors.find((f) => f.id === id)?.name).filter(Boolean).join(', ');
  const isDean = user.role === 'dean';

  const toggleReminders = async (v: boolean) => {
    if (v) {
      const p = notificationPermission() === 'granted' ? 'granted' : await requestNotificationPermission();
      if (p === 'unsupported') toast('This browser cannot show notifications. Add the app to your home screen first.', 'error');
      else if (p !== 'granted') toast('Notifications are blocked for this app in your phone settings.', 'error');
    }
    setRemindersOn(v);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle={`${user.name} · ${roleLabel(user.role)}${floors ? ` · ${floors}` : ''}`} />
      <Card>
        <ListRow icon={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'} to="/settings/appearance" title="Appearance" subtitle={theme === 'system' ? 'Follows your phone' : theme === 'dark' ? 'Dark' : 'Light'} chevron />
        <Toggle label="Reminders on this phone" help="A notification before each of your checks while the app is open. Locked-phone reminders arrive with the online version." checked={remindersOn} onChange={toggleReminders} />
      </Card>

      {(isDean || can(user, 'manageRAs', perms) || can(user, 'viewAllFloors', perms)) && (
        <>
          <SectionLabel>Dorm</SectionLabel>
          <Card>
            {isDean && <ListRow icon="dorm" to="/settings/dorm" title="Dorm and year" subtitle={`${state.settings.dormName} · ${state.settings.yearLabel}`} chevron />}
            {isDean && <ListRow icon="floors" to="/floors" title="Floors and rooms" subtitle="Tap Edit on the Floors tab" chevron />}
            {isDean && <ListRow icon="check" to="/settings/status-types" title="Status types" subtitle={state.statusTypes.map((s) => s.code).join(' · ')} chevron />}
            {isDean && <ListRow icon="clock" to="/settings/schedules" title="Check schedules" subtitle={`${state.schedules.filter((s) => s.active).length} active`} chevron />}
            {(isDean || can(user, 'manageRAs', perms)) && <ListRow icon="boys" to="/settings/staff" title="Staff" subtitle={`${state.staff.filter((s) => s.active).length} active`} chevron />}
            {isDean && <ListRow icon="user" to="/settings/head-ra" title="Head RA permissions" subtitle={state.settings.headRAEnabled ? `${Object.values(perms).filter(Boolean).length} of ${Object.keys(perms).length} switches on` : 'No head RA this year'} chevron />}
            {isDean && <ListRow icon="calendar" to="/settings/leave" title="Leave board" subtitle="Sign boys out ahead of time" chevron />}
          </Card>
          <SectionLabel>Records</SectionLabel>
          <Card>
            {can(user, 'viewHistory', perms) && <ListRow icon="history" to="/history" title="History" chevron />}
            {can(user, 'enterFromPaper', perms) && <ListRow icon="pencil" to="/paper" title="Enter a check from paper" chevron />}
            {isDean && <ListRow icon="note" to="/settings/audit" title="Activity log" subtitle="Who changed what" chevron />}
            {isDean && <ListRow icon="archive" to="/settings/archives" title="Archived years" subtitle={state.archives.length ? `${state.archives.length} archived` : 'None yet'} chevron />}
          </Card>
          {isDean && (
            <>
              <SectionLabel>Data</SectionLabel>
              <Card>
                <ListRow icon="download" to="/settings/backup" title="Backup and restore" subtitle="Everything lives on this device. Export a copy regularly." chevron />
                <ListRow icon="sync" to="/settings/rollover" title="Start a new school year" subtitle="Archive this year, keep the building" chevron />
              </Card>
            </>
          )}
        </>
      )}
      <Button variant="outline" icon="logout" onClick={() => { signOut(); navigate('/signin', { replace: true }); }}>Sign out</Button>
      <p className="muted small">Room Check {state.settings.yearLabel} · data is stored on this device only.</p>
    </>
  );
}
