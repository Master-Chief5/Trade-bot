import { useAppState } from '../../lib/store';
import { formatDateTime } from '../../lib/dates';
import { Card, Empty, PageHeader } from '../../ui/Layout';

const LABELS: Record<string, string> = {
  setup: 'Set up', 'boy.add': 'Added boy', 'boy.update': 'Edited boy', 'boy.move': 'Moved boy', 'boy.remove': 'Removed boy', 'boy.reactivate': 'Reactivated boy', 'boy.delete': 'Deleted boy',
  'roster.import': 'Imported roster', 'staff.add': 'Added staff', 'staff.update': 'Edited staff', 'headra.permissions': 'Head RA permissions',
  'check.start': 'Started check', 'check.paper': 'Entered from paper', 'check.submit': 'Submitted check', 'check.reopen': 'Reopened check', 'check.delete': 'Discarded check',
  'leave.add': 'Signed out', 'leave.delete': 'Removed leave', 'year.rollover': 'New school year',
};

export function Audit() {
  const state = useAppState();
  const rows = state.audit.slice(0, 300);
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Activity log" subtitle="Who changed what, newest first." />
      <Card>
        {rows.length === 0 && <Empty>Nothing yet.</Empty>}
        {rows.map((a) => (
          <div key={a.id} className="audit-row">
            <div><strong>{LABELS[a.action] ?? a.action}</strong> · {a.detail}</div>
            <div className="muted small">{a.userName} · {formatDateTime(a.at)}</div>
          </div>
        ))}
      </Card>
    </>
  );
}
