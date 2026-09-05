import { useState } from 'react';
import { actions, useAppState } from '../../lib/store';
import { sortedStatusTypes } from '../../lib/checks';
import type { CountsAs, StatusType } from '../../lib/types';
import { Button } from '../../ui/Button';
import { SelectInput, TextInput, Toggle } from '../../ui/Form';
import { Card, PageHeader } from '../../ui/Layout';
import { Sheet } from '../../ui/Sheet';
import { toast } from '../../ui/toast';

export function StatusTypes() {
  const state = useAppState();
  const list = sortedStatusTypes(state);
  const [editing, setEditing] = useState<StatusType | 'new' | null>(null);
  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Status types" subtitle="What an RA can mark a boy as. The code is what prints on the sheet." actions={<Button iconOnly round icon="plus" aria-label="Add status type" onClick={() => setEditing('new')} />} />
      <Card>
        {list.map((s, i) => (
          <div key={s.id} className="listrow">
            <span className="lead"><span className="dot" style={{ background: s.color }} /></span>
            <button type="button" className="body" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', minHeight: 44, cursor: 'pointer' }} onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
              <span className="primary-text row" style={{ gap: 8 }}>{s.name}<span className="mono small" style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--surface-2)' }}>{s.code}</span></span>
              <span className="secondary-text">{[`Counts as ${s.countsAs}`, s.requiresNote ? 'note required' : '', s.isDefault ? 'default' : '', s.useForLeave ? 'used for leave' : ''].filter(Boolean).join(' · ')}</span>
            </button>
            <span className="trail" style={{ gap: 2 }}>
              <Button variant="ghost" size="sm" iconOnly icon="up" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => actions.moveStatusType(s.id, -1)} />
              <Button variant="ghost" size="sm" iconOnly icon="down" aria-label={`Move ${s.name} down`} disabled={i === list.length - 1} onClick={() => actions.moveStatusType(s.id, 1)} />
            </span>
          </div>
        ))}
      </Card>
      <p className="muted small">The order here is the order a tap cycles through on the check screen. The default is what every boy starts as. The leave status is what a signed-out boy is pre-marked as.</p>
      <Sheet open={editing !== null} title={editing === 'new' ? 'New status type' : 'Edit status type'} onClose={() => setEditing(null)}>
        {editing !== null && <StatusForm existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function StatusForm({ existing, onClose }: { existing?: StatusType; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [color, setColor] = useState(existing?.color ?? '#4C7FA8');
  const [countsAs, setCountsAs] = useState<CountsAs>(existing?.countsAs ?? 'excused');
  const [requiresNote, setRequiresNote] = useState(existing?.requiresNote ?? false);
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [useForLeave, setUseForLeave] = useState(existing?.useForLeave ?? false);
  const save = () => {
    const res = existing
      ? actions.updateStatusType(existing.id, { name: name.trim(), code, color, countsAs, requiresNote, isDefault, useForLeave })
      : actions.addStatusType({ name, code, color, countsAs, requiresNote, isDefault, useForLeave });
    if (!res.ok) return toast(res.error, 'error');
    toast('Saved');
    onClose();
  };
  const remove = () => {
    if (!existing || !window.confirm(`Delete "${existing.name}"?`)) return;
    const res = actions.deleteStatusType(existing.id);
    if (!res.ok) return toast(res.error, 'error');
    onClose();
  };
  return (
    <div className="stack">
      <div className="grid-2">
        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Present" />
        <TextInput label="Code on the sheet" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="P" className="input mono" />
      </div>
      <div className="grid-2">
        <SelectInput label="Counts as" value={countsAs} onChange={(e) => setCountsAs(e.target.value as CountsAs)} help="Decides how the status is tallied and coloured.">
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="excused">Excused</option>
        </SelectInput>
        <div className="field">
          <label htmlFor="st-color">Colour</label>
          <input id="st-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="input" style={{ padding: 4, height: 46 }} />
        </div>
      </div>
      <Card>
        <Toggle label="Requires a note" help="The RA cannot submit until a note is written." checked={requiresNote} onChange={setRequiresNote} />
        <Toggle label="Default for every boy" help="What everyone starts as when a check opens." checked={isDefault} onChange={setIsDefault} />
        <Toggle label="Use for boys on leave" help="Pre-marked for anyone signed out on the leave board." checked={useForLeave} onChange={setUseForLeave} />
      </Card>
      <div className="row">
        {existing && <Button variant="danger" icon="trash" onClick={remove}>Delete</Button>}
        <Button className="grow" onClick={save}>Save</Button>
      </div>
    </div>
  );
}
