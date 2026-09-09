import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { actions, useAppState } from '../lib/store';
import { parseRoster } from '../lib/roster';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { TextArea, Toggle } from '../ui/Form';
import { Banner, Card, PageHeader } from '../ui/Layout';
import { toast } from '../ui/toast';

export function RosterImport({ user }: { user: StaffUser }) {
  const state = useAppState();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [lastFirst, setLastFirst] = useState(false);
  const rows = useMemo(() => parseRoster(text, state.rooms.map((r) => r.number), lastFirst), [text, state.rooms, lastFirst]);
  const importable = rows.filter((r) => r.firstName && r.grade !== null);
  const skipped = rows.length - importable.length;

  const run = () => {
    const res = actions.importRoster(importable.map((r) => ({ firstName: r.firstName, lastName: r.lastName, grade: r.grade!, roomNumber: r.roomNumber })), user);
    toast(`${res.added} added, ${res.updated} updated${res.unmatchedRooms.length ? `. Rooms not found: ${res.unmatchedRooms.join(', ')}` : ''}`);
    navigate('/boys');
  };

  return (
    <>
      <PageHeader back="/boys" backLabel="Boys" title="Import roster" subtitle="Paste from a spreadsheet: one boy per line with name, grade and room." />
      <Banner kind="info">Any order of columns works. Boys already on the roster are updated, not duplicated. Rooms must exist first under Floors.</Banner>
      <Card pad>
        <div className="stack">
          <TextArea label="Roster" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Daniel Achebe\t9\t201\nJonah Bell\t9\t201\nMicah Brooks, 10, 202'} rows={8} />
          <Toggle label="Names are written Last First" help="Turn on if the spreadsheet says “Bell Jonah” instead of “Jonah Bell”." checked={lastFirst} onChange={setLastFirst} />
        </div>
      </Card>
      {rows.length > 0 && (
        <>
          <div className="row-between">
            <span className="small muted">{importable.length} ready{skipped ? ` · ${skipped} skipped` : ''}</span>
            <Button onClick={run} disabled={!importable.length}>Import {importable.length}</Button>
          </div>
          <Card>
            <div className="table-wrap">
              <table className="plain">
                <thead><tr><th>Name</th><th>Grade</th><th>Room</th><th>Notes</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.firstName} {r.lastName}</td>
                      <td>{r.grade ?? '—'}</td>
                      <td>{r.roomNumber || '—'}</td>
                      <td className={r.issues.length ? 'form-error' : 'muted'}>{r.issues.join('; ') || 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
