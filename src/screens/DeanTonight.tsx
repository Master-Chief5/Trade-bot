import { useNavigate } from 'react-router-dom';
import { actions, useAppState } from '../lib/store';
import { absentOn, flaggedBoys, leaveCovering, schedulesForDate, slotsForDate, tally, type Slot } from '../lib/checks';
import { formatClock, formatDateLong, formatTime12, todayKey } from '../lib/dates';
import { can, printableFloorIds } from '../lib/permissions';
import { filledSheet, openPdf, safeName } from '../lib/pdf';
import { useNow } from '../lib/useNow';
import { useReminders, useRemindersEnabled } from '../lib/reminders';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Banner, Card, Empty, ListRow, PageHeader, SectionLabel } from '../ui/Layout';
import { Counts } from '../ui/StatusPill';
import { toast } from '../ui/toast';

export function DeanTonight({ user }: { user: StaffUser }) {
  const state = useAppState();
  const navigate = useNavigate();
  const now = useNow();
  const today = todayKey();
  const [remindersOn] = useRemindersEnabled();
  useReminders(state, user, remindersOn);

  const schedules = schedulesForDate(state, today);
  const slots = slotsForDate(state, today, now);
  const submittedCount = slots.filter((s) => s.status === 'submitted').length;
  const absent = absentOn(state, today);
  const flags = flaggedBoys(state, today);
  const onLeave = state.boys.filter((b) => b.active && leaveCovering(state, b.id, today));
  const printable = printableFloorIds(state, user);
  const tonightChecks = state.checks.filter((c) => c.date === today && c.submittedAt && printable.includes(c.floorId)).sort((a, b) => a.time.localeCompare(b.time) || a.floorName.localeCompare(b.floorName, undefined, { numeric: true }));
  const canPrint = can(user, 'printAllFloors', state.headRAPermissions) || user.role === 'dean';

  const printTonight = () => {
    if (!tonightChecks.length) return toast('No submitted checks yet tonight.', 'error');
    openPdf(filledSheet(state, tonightChecks), `${safeName(state.settings.dormName)}-check-${today}.pdf`);
  };
  const open = (slot: Slot) => {
    const id = actions.startCheck(slot.schedule.id, slot.floor.id, today, user);
    navigate(`/check/${id}`);
  };

  return (
    <>
      <PageHeader
        eyebrow={`${formatDateLong(today)} · ${formatClock(now.toISOString())}`}
        title="Tonight"
        subtitle={schedules.length ? `${submittedCount} of ${slots.length} floor checks in · ${absent.length} absent` : 'No check scheduled today'}
        actions={canPrint ? <Button variant="outline" size="sm" icon="print" onClick={printTonight} disabled={!tonightChecks.length}>Tonight's sheet</Button> : undefined}
      />
      <div className="dash-grid">
        <div className="stack">
          {schedules.length === 0 && (
            <Card>
              <Empty icon="calendar">
                Nothing is scheduled for today.
                {user.role === 'dean' && <div><Button variant="ghost" size="sm" to="/settings/schedules">Check schedules</Button></div>}
              </Empty>
            </Card>
          )}
          {schedules.map((schedule) => {
            const rows = slots.filter((s) => s.schedule.id === schedule.id);
            return (
              <div key={schedule.id} className="stack-sm">
                <div className="row-between">
                  <SectionLabel>{schedule.name} · {formatTime12(schedule.time)}</SectionLabel>
                </div>
                <Card>
                  {rows.map((slot) => {
                    const t = slot.check ? tally(slot.check, state.statusTypes) : null;
                    const circle = slot.status === 'submitted' ? 'done' : slot.pastDeadline ? 'late' : slot.status === 'in-progress' ? 'pending' : 'idle';
                    const icon = slot.status === 'submitted' ? 'check' : slot.pastDeadline ? 'alert' : slot.status === 'in-progress' ? 'clock' : 'minus';
                    const detail =
                      slot.status === 'submitted' && slot.check
                        ? `${formatClock(slot.check.submittedAt!)} · ${slot.check.raName}${slot.check.source === 'paper' ? ' · from paper' : ''}`
                        : slot.status === 'in-progress' && slot.check
                          ? `In progress · ${slot.check.raName}`
                          : slot.pastDeadline
                            ? `Not submitted · past ${formatTime12(schedule.time)} + ${schedule.deadlineMinutes} min`
                            : 'Not started';
                    return (
                      <ListRow
                        key={slot.floor.id}
                        lead={<span className={`status-circle ${circle}`}><Icon name={icon} size={16} stroke={2.2} /></span>}
                        title={slot.floor.name}
                        subtitle={detail}
                        to={slot.status === 'submitted' && slot.check ? `/check/${slot.check.id}` : undefined}
                        onClick={slot.status !== 'submitted' ? () => open(slot) : undefined}
                        trail={t ? <Counts codes={t.byCode} present={t.present} absent={t.absent} excused={t.excused} /> : <span className="tag">{slot.status === 'in-progress' ? 'Continue' : 'Start'}</span>}
                        chevron={slot.status === 'submitted'}
                      />
                    );
                  })}
                </Card>
              </div>
            );
          })}
          <SectionLabel>Absent tonight</SectionLabel>
          <Card>
            {absent.length === 0 ? (
              <Empty>{submittedCount ? 'Nobody marked absent so far.' : 'Waiting for the first floor to submit.'}</Empty>
            ) : (
              absent.map(({ check, entry }) => (
                <ListRow key={check.id + entry.boyId} to={`/boys/${entry.boyId}`} title={entry.name} subtitle={`Room ${entry.roomNumber} · ${check.floorName}${entry.note ? ` · ${entry.note}` : ''}`} chevron />
              ))
            )}
          </Card>
        </div>
        <div className="stack">
          {flags.length > 0 && (
            <>
              <SectionLabel>Needs a look</SectionLabel>
              <Card>
                {flags.map((f) => (
                  <ListRow key={f.boy.id} to={`/boys/${f.boy.id}`} lead={<span style={{ color: 'var(--lamp)' }}><Icon name="flag" size={20} /></span>} title={`${f.boy.firstName} ${f.boy.lastName} absent at ${f.count} checks in a row`} subtitle={`Room ${state.rooms.find((r) => r.id === f.boy.roomId)?.number ?? '—'} · A flag, not a consequence.`} chevron />
                ))}
              </Card>
            </>
          )}
          {onLeave.length > 0 && (
            <Banner kind="info" icon="calendar">
              {onLeave.length} {onLeave.length === 1 ? 'boy is' : 'boys are'} signed out today and pre-marked away on tonight's checks.
            </Banner>
          )}
          <SectionLabel>Quick actions</SectionLabel>
          <Card>
            {canPrint && <ListRow icon="print" onClick={printTonight} title="Print tonight's sheet" subtitle={tonightChecks.length ? `${tonightChecks.length} submitted ${tonightChecks.length === 1 ? 'check' : 'checks'}, one page each` : 'Nothing submitted yet'} chevron />}
            <ListRow icon="sheet" to="/print" title="Blank sheet and other PDFs" chevron />
            {can(user, 'enterFromPaper', state.headRAPermissions) && <ListRow icon="pencil" to="/paper" title="Enter a check from paper" chevron />}
            <ListRow icon="history" to="/history" title="History" chevron />
            {user.role === 'dean' && <ListRow icon="calendar" to="/settings/leave" title="Leave board" subtitle="Sign boys out ahead of time" chevron />}
          </Card>
        </div>
      </div>
    </>
  );
}
