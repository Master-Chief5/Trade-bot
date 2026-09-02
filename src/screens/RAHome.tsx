import { useNavigate } from 'react-router-dom';
import { actions, useAppState } from '../lib/store';
import { slotsForDate, slotsForUser, submittedChecksDesc, tally, type Slot } from '../lib/checks';
import { addDays, formatDate, formatDateLong, formatTime12, formatClock, todayKey, DAY_NAMES_LONG, weekdayOf } from '../lib/dates';
import { can, visibleFloorIds } from '../lib/permissions';
import { useRemindersEnabled } from '../lib/reminders';
import { useNow } from '../lib/useNow';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Banner, Card, ListRow, PageHeader, SectionLabel, Empty } from '../ui/Layout';
import { Counts } from '../ui/StatusPill';

export function RAHome({ user }: { user: StaffUser }) {
  const state = useAppState();
  const navigate = useNavigate();
  const now = useNow();
  const today = todayKey();
  const [remindersOn] = useRemindersEnabled();

  const floorIds = visibleFloorIds(state, user);
  const floorNames = floorIds.map((id) => state.floors.find((f) => f.id === id)?.name).filter(Boolean).join(', ');
  // A check whose deadline crosses midnight (23:50 + 20 min) stays on the list until it is done.
  const carried = slotsForUser(state, user, addDays(today, -1), now).filter((s) => s.status !== 'submitted' && !s.pastDeadline);
  const slots = [...carried, ...slotsForUser(state, user, today, now)];
  const escalations = can(user, 'receiveEscalations', state.headRAPermissions) ? slotsForDate(state, today, now).filter((s) => s.pastDeadline && !floorIds.includes(s.floor.id)) : [];

  const nextUpcoming = (() => {
    for (let i = 1; i <= 7; i++) {
      const date = addDays(today, i);
      const s = slotsForUser(state, user, date, now)[0];
      if (s) return { slot: s, date };
    }
    return null;
  })();

  const weekAgo = addDays(today, -7);
  const recent = submittedChecksDesc(state).filter((c) => floorIds.includes(c.floorId) && c.date >= weekAgo && c.date <= today).slice(0, 8);

  const start = (slot: Slot) => {
    const id = actions.startCheck(slot.schedule.id, slot.floor.id, slot.date, user);
    navigate(`/check/${id}`);
  };

  return (
    <>
      <PageHeader
        eyebrow={formatDateLong(today)}
        title="Tonight"
        subtitle={floorNames ? `${user.name} · ${floorNames}` : user.name}
        actions={
          <span className={`tag ${remindersOn ? '' : 'neutral'}`}>
            <Icon name="bell" size={14} />
            {remindersOn ? 'Reminders on' : 'Reminders off'}
          </span>
        }
      />
      {floorIds.length === 0 && (
        <Banner kind="warn">You are not assigned to a floor yet. Ask a dean to add you to one under Staff.</Banner>
      )}
      {escalations.map((s) => (
        <Banner key={s.schedule.id + s.floor.id} kind="danger" icon="clock">
          <strong>{s.floor.name}</strong> has not submitted {s.schedule.name.toLowerCase()} and it is past the deadline.
        </Banner>
      ))}
      {slots.length === 0 && floorIds.length > 0 && (
        <Card>
          <Empty icon="calendar">No check scheduled for your floors today.{nextUpcoming ? ` Next: ${nextUpcoming.slot.schedule.name} on ${formatDate(nextUpcoming.date)}.` : ''}</Empty>
        </Card>
      )}
      {slots.map((slot) => {
        const key = slot.schedule.id + slot.floor.id + slot.date;
        const t = slot.check ? tally(slot.check, state.statusTypes) : null;
        return (
          <Card pad key={key}>
            <div className="stack">
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontSize: 22 }}>{slot.schedule.name}</h2>
                  <div className="muted small">
                    {slot.date !== today ? `${formatDate(slot.date)} · ` : ''}{slot.floor.name} · {formatTime12(slot.schedule.time)} · {slot.check ? slot.check.entries.length : boysCount(state, slot.floor.id)} boys
                  </div>
                </div>
                <SlotTag slot={slot} />
              </div>
              {slot.status === 'submitted' && slot.check && t ? (
                <div className="row-between">
                  <Counts codes={t.byCode} present={t.present} absent={t.absent} excused={t.excused} />
                  <Button variant="outline" size="sm" to={`/check/${slot.check.id}`}>View</Button>
                </div>
              ) : (
                <Button size="lg" block onClick={() => start(slot)}>
                  {slot.status === 'in-progress' ? 'Continue check' : 'Start check'}
                </Button>
              )}
            </div>
          </Card>
        );
      })}
      {nextUpcoming && slots.length > 0 && (
        <Card>
          <ListRow icon="calendar" title={nextUpcoming.slot.schedule.name} subtitle={`${DAY_NAMES_LONG[weekdayOf(nextUpcoming.date)]} · ${formatTime12(nextUpcoming.slot.schedule.time)} · ${nextUpcoming.slot.floor.name}`} trail={<span className="small muted">Next</span>} />
        </Card>
      )}
      {recent.length > 0 && (
        <>
          <SectionLabel>This week</SectionLabel>
          <Card>
            {recent.map((c) => {
              const t = tally(c, state.statusTypes);
              return (
                <ListRow
                  key={c.id}
                  to={`/check/${c.id}`}
                  title={`${formatDate(c.date)} · ${c.scheduleName}`}
                  subtitle={`${c.floorName} · ${c.source === 'paper' ? 'Entered from paper' : `Submitted ${formatClock(c.submittedAt!)}`}`}
                  trail={<Counts codes={t.byCode} present={t.present} absent={t.absent} excused={t.excused} />}
                />
              );
            })}
          </Card>
        </>
      )}
      <Card>
        <ListRow icon="print" to="/print" title="Print a blank sheet" subtitle="Your floors, current roster, empty boxes" chevron />
      </Card>
    </>
  );
}

function boysCount(state: ReturnType<typeof useAppState>, floorId: string): number {
  const roomIds = new Set(state.rooms.filter((r) => r.floorId === floorId).map((r) => r.id));
  return state.boys.filter((b) => b.active && b.roomId && roomIds.has(b.roomId)).length;
}

export function SlotTag({ slot }: { slot: Slot }) {
  if (slot.status === 'submitted') return <span className="tag present"><Icon name="check" size={14} stroke={2.4} />Submitted</span>;
  if (slot.pastDeadline) return <span className="tag absent"><Icon name="clock" size={14} />Past deadline</span>;
  if (slot.status === 'in-progress') return <span className="tag lamp">In progress</span>;
  if (slot.minutesUntil > 0 && slot.minutesUntil <= 90) return <span className="tag lamp">Starts in {slot.minutesUntil} min</span>;
  if (slot.minutesUntil > 90) return <span className="tag neutral">At {formatTime12(slot.schedule.time)}</span>;
  return <span className="tag lamp">Due now</span>;
}
