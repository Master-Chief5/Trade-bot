import { useMemo, useState } from 'react';
import { useAppState } from '../lib/store';
import { sortedFloors, submittedChecksDesc, tally } from '../lib/checks';
import { formatClock, formatDateLong } from '../lib/dates';
import { visibleFloorIds } from '../lib/permissions';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Form';
import { Card, Empty, ListRow, PageHeader, SectionLabel } from '../ui/Layout';
import { Counts } from '../ui/StatusPill';

export function History({ user }: { user: StaffUser }) {
  const state = useAppState();
  const visible = visibleFloorIds(state, user);
  const floors = sortedFloors(state).filter((f) => visible.includes(f.id));
  const [floor, setFloor] = useState('all');
  const [limit, setLimit] = useState(40);
  const checks = useMemo(() => submittedChecksDesc(state).filter((c) => visible.includes(c.floorId) && (floor === 'all' || c.floorId === floor)), [state, visible, floor]);
  const shown = checks.slice(0, limit);
  const byDate = new Map<string, typeof shown>();
  for (const c of shown) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);

  return (
    <>
      <PageHeader back="/" backLabel="Tonight" title="History" subtitle={`${checks.length} submitted ${checks.length === 1 ? 'check' : 'checks'}`} />
      {floors.length > 1 && <Chips value={floor} onChange={setFloor} options={[{ value: 'all', label: 'All floors' }, ...floors.map((f) => ({ value: f.id, label: f.name }))]} />}
      {shown.length === 0 && <Card><Empty icon="history">No submitted checks yet.</Empty></Card>}
      {[...byDate.entries()].map(([date, list]) => (
        <div key={date} className="stack-sm">
          <SectionLabel>{formatDateLong(date)}</SectionLabel>
          <Card>
            {list.map((c) => {
              const t = tally(c, state.statusTypes);
              return <ListRow key={c.id} to={`/check/${c.id}`} title={`${c.scheduleName} · ${c.floorName}`} subtitle={`${c.raName} · ${c.source === 'paper' ? 'entered from paper' : `submitted ${formatClock(c.submittedAt!)}`}`} trail={<Counts codes={t.byCode} present={t.present} absent={t.absent} excused={t.excused} />} chevron />;
            })}
          </Card>
        </div>
      ))}
      {checks.length > limit && <Button variant="outline" onClick={() => setLimit(limit + 40)}>Show more</Button>}
    </>
  );
}
