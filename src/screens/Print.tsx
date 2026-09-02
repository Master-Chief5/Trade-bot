import { useMemo, useState } from 'react';
import { useAppState } from '../lib/store';
import { sortedFloors } from '../lib/checks';
import { formatDate, formatDateShort, todayKey, weekStart } from '../lib/dates';
import { printableFloorIds } from '../lib/permissions';
import { blankSheet, downloadPdf, filledSheet, openPdf, safeName, weekSheet } from '../lib/pdf';
import type { StaffUser } from '../lib/types';
import type { jsPDF } from 'jspdf';
import { Button } from '../ui/Button';
import { SelectInput, TextInput } from '../ui/Form';
import { Card, PageHeader } from '../ui/Layout';
import { toast } from '../ui/toast';

export function Print({ user }: { user: StaffUser }) {
  const state = useAppState();
  const [date, setDate] = useState(todayKey());
  const [floorSel, setFloorSel] = useState('all');
  const [scheduleName, setScheduleName] = useState(state.schedules[0]?.name ?? 'Room check');
  const allowed = useMemo(() => printableFloorIds(state, user), [state, user]);
  const floors = useMemo(() => sortedFloors(state).filter((f) => allowed.includes(f.id)), [state, allowed]);
  const floorIds = useMemo(() => (floorSel === 'all' ? floors.map((f) => f.id) : [floorSel]), [floorSel, floors]);

  const checks = useMemo(
    () => state.checks.filter((c) => c.date === date && floorIds.includes(c.floorId)).sort((a, b) => a.time.localeCompare(b.time) || a.floorName.localeCompare(b.floorName, undefined, { numeric: true })),
    [state.checks, date, floorIds],
  );
  const canSeeNotesOf = (c: (typeof checks)[number]) => user.role === 'dean' || state.settings.raSeeNotes || c.raId === user.id;
  const submitted = checks
    .filter((c) => c.submittedAt)
    .map((c) => (canSeeNotesOf(c) ? c : { ...c, entries: c.entries.map((e) => ({ ...e, note: undefined })) }));
  const inProgress = checks.length - submitted.length;
  const monday = weekStart(date);
  const dorm = safeName(state.settings.dormName);

  const make = (build: () => jsPDF, name: string, how: 'open' | 'download') => {
    try {
      const doc = build();
      if (how === 'open') openPdf(doc, name);
      else downloadPdf(doc, name);
    } catch (err) {
      console.error(err);
      toast('Could not build that PDF.', 'error');
    }
  };

  const docs = [
    {
      key: 'filled',
      title: `Check sheet · ${formatDate(date)}`,
      desc: submitted.length ? `${submitted.length} submitted ${submitted.length === 1 ? 'check' : 'checks'}, one page each, with signature lines.${inProgress ? ` ${inProgress} still in progress, not included.` : ''}` : 'No submitted checks on this date for these floors.',
      disabled: submitted.length === 0,
      build: () => filledSheet(state, submitted),
      name: `${dorm}-check-${date}.pdf`,
    },
    {
      key: 'blank',
      title: 'Blank check sheet',
      desc: 'Current roster with an empty box per status. For when a phone is not an option.',
      disabled: floorIds.length === 0,
      build: () => blankSheet(state, floorIds, scheduleName),
      name: `${dorm}-blank-sheet.pdf`,
    },
    {
      key: 'week',
      title: `Week at a glance · ${formatDateShort(monday)}`,
      desc: 'Boys down the side, seven nights across, one code per cell. One page per floor.',
      disabled: floorIds.length === 0,
      build: () => weekSheet(state, floorIds, monday),
      name: `${dorm}-week-${monday}.pdf`,
    },
  ];

  return (
    <>
      <PageHeader title="Print" subtitle="PDFs for the binder. Open one, then print or save it from your phone or computer." />
      <Card pad>
        <div className="stack">
          <div className="grid-2">
            <TextInput label="Date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <SelectInput label="Floors" value={floorSel} onChange={(e) => setFloorSel(e.target.value)}>
              {floors.length > 1 && <option value="all">All floors</option>}
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </SelectInput>
          </div>
          {state.schedules.length > 1 && (
            <SelectInput label="Blank sheet heading" value={scheduleName} onChange={(e) => setScheduleName(e.target.value)}>
              {state.schedules.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </SelectInput>
          )}
        </div>
      </Card>
      <Card>
        {docs.map((d) => (
          <div key={d.key} className="listrow">
            <span className="body">
              <span className="primary-text">{d.title}</span>
              <span className="secondary-text">{d.desc}</span>
            </span>
            <span className="trail">
              <Button variant="outline" size="sm" icon="external" disabled={d.disabled} onClick={() => make(d.build, d.name, 'open')}>Open</Button>
              <Button variant="ghost" size="sm" iconOnly icon="download" disabled={d.disabled} aria-label={`Download ${d.title}`} onClick={() => make(d.build, d.name, 'download')} />
            </span>
          </div>
        ))}
      </Card>
      <p className="muted small">Checks entered from paper are marked as such on the printout. Removed boys stay on the sheets for the nights they were here.</p>
    </>
  );
}
