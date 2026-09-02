import { useState } from 'react';
import { useAppState } from '../../lib/store';
import { downloadText } from '../../lib/download';
import { formatDateLong, formatDateTime } from '../../lib/dates';
import { filledSheet, openPdf, safeName } from '../../lib/pdf';
import type { ArchivedYear } from '../../lib/types';
import { Button } from '../../ui/Button';
import { SelectInput } from '../../ui/Form';
import { Card, Empty, PageHeader } from '../../ui/Layout';
import { toast } from '../../ui/toast';

export function Archives() {
  const state = useAppState();
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Archived years" subtitle="Past years stay readable and printable." />
      {state.archives.length === 0 && <Card><Empty icon="archive">No archived years yet. Starting a new school year creates one.</Empty></Card>}
      {state.archives.map((a) => <ArchiveCard key={a.id} archive={a} />)}
    </>
  );
}

function ArchiveCard({ archive }: { archive: ArchivedYear }) {
  const state = useAppState();
  const dates = [...new Set(archive.checks.filter((c) => c.submittedAt).map((c) => c.date))].sort().reverse();
  const [date, setDate] = useState(dates[0] ?? '');
  const print = () => {
    const checks = archive.checks.filter((c) => c.date === date && c.submittedAt).sort((a, b) => a.time.localeCompare(b.time));
    if (!checks.length) return toast('No submitted checks on that date.', 'error');
    const like = { settings: state.settings, statusTypes: state.statusTypes, floors: archive.floors, rooms: archive.rooms, boys: archive.boys, checks: archive.checks };
    openPdf(filledSheet(like, checks), `${safeName(state.settings.dormName)}-${archive.label}-${date}.pdf`);
  };
  return (
    <Card pad>
      <div className="stack">
        <div>
          <h2 style={{ fontSize: 22 }}>{archive.label}</h2>
          <div className="muted small">Archived {formatDateTime(archive.archivedAt)} · {archive.boys.length} boys · {archive.checks.length} checks</div>
        </div>
        {dates.length > 0 && (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <SelectInput label="Print a night" value={date} onChange={(e) => setDate(e.target.value)}>
                {dates.map((d) => <option key={d} value={d}>{formatDateLong(d)}</option>)}
              </SelectInput>
            </div>
            <Button variant="outline" icon="print" onClick={print}>Open PDF</Button>
          </div>
        )}
        <Button variant="ghost" size="sm" icon="download" onClick={() => downloadText(`room-check-${safeName(archive.label)}.json`, JSON.stringify(archive, null, 2))}>Download this year as a file</Button>
      </div>
    </Card>
  );
}
