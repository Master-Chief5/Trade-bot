import { useTheme, type Theme } from '../../lib/theme';
import { useAppState } from '../../lib/store';
import { sortedStatusTypes } from '../../lib/checks';
import { Segmented } from '../../ui/Form';
import { Card, PageHeader } from '../../ui/Layout';
import { StatusPill } from '../../ui/StatusPill';

export function Appearance() {
  const [theme, setTheme] = useTheme();
  const state = useAppState();
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Appearance" subtitle="Light for the office, dark for the hallway at 10 PM." />
      <Card pad>
        <Segmented<Theme> label="Theme" value={theme} onChange={setTheme} options={[{ value: 'system', label: 'Follow phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Card>
      <Card pad>
        <div className="stack-sm">
          <div className="eyebrow">Preview</div>
          <div className="row wrap">
            {sortedStatusTypes(state).map((s) => <StatusPill key={s.id} status={s} small />)}
          </div>
          <p className="muted small">This choice is saved on this device only. Every RA picks their own.</p>
        </div>
      </Card>
    </>
  );
}
