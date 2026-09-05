import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { actions, useAppState } from '../lib/store';
import { canEditCheck, canReopenCheck, defaultStatus, naturalCompare, sortedStatusTypes, statusById, tally } from '../lib/checks';
import { formatClock, formatDate, formatTime12 } from '../lib/dates';
import { visibleFloorIds } from '../lib/permissions';
import type { CheckEntry, StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Card, Empty, PageHeader, Stat } from '../ui/Layout';
import { StatusPill } from '../ui/StatusPill';
import { Sheet } from '../ui/Sheet';
import { TextArea } from '../ui/Form';
import { toast } from '../ui/toast';

export function CheckScreen({ user }: { user: StaffUser }) {
  const { id } = useParams();
  const state = useAppState();
  const navigate = useNavigate();
  const check = state.checks.find((c) => c.id === id);
  const [query, setQuery] = useState('');
  const [noteFor, setNoteFor] = useState<CheckEntry | null>(null);

  const groups = useMemo(() => {
    if (!check) return [];
    const q = query.trim().toLowerCase();
    const entries = check.entries.filter((e) => !q || e.name.toLowerCase().includes(q) || e.roomNumber.toLowerCase().includes(q));
    const byRoom = new Map<string, CheckEntry[]>();
    for (const e of entries) byRoom.set(e.roomNumber, [...(byRoom.get(e.roomNumber) ?? []), e]);
    return [...byRoom.entries()].sort((a, b) => naturalCompare(a[0], b[0]));
  }, [check, query]);

  if (!check) {
    return (
      <>
        <PageHeader back="/" title="Check not found" />
        <Card><Empty>This check may have been deleted.</Empty></Card>
      </>
    );
  }

  if (!visibleFloorIds(state, user).includes(check.floorId)) return <Navigate to="/" replace />;

  const editable = canEditCheck(state, user, check);
  const reopenable = canReopenCheck(state, user, check);
  const t = tally(check, state.statusTypes);
  const def = defaultStatus(state);
  const canSeeNotes = user.role === 'dean' || state.settings.raSeeNotes || check.raId === user.id || editable;

  const submit = () => {
    const res = actions.submitCheck(check.id, user);
    if (res.ok) {
      toast('Check submitted');
      navigate('/', { replace: true });
    } else {
      toast(`${res.error} ${res.missingNotes.join(', ')}`, 'error');
    }
  };
  const reopen = () => {
    const res = actions.reopenCheck(check.id, user);
    if (!res.ok) toast(res.error, 'error');
    else toast('Check reopened');
  };
  const discard = () => {
    if (!window.confirm('Discard this check? Nothing has been submitted yet.')) return;
    const res = actions.deleteCheck(check.id, user);
    if (!res.ok) toast(res.error, 'error');
    else navigate('/', { replace: true });
  };

  return (
    <>
      <PageHeader
        back="/"
        backLabel="Tonight"
        title={check.scheduleName}
        subtitle={`${check.floorName} · ${formatDate(check.date)} · ${formatTime12(check.time)}`}
        actions={
          check.submittedAt ? (
            <span className="tag present"><Icon name="check" size={14} stroke={2.4} />Submitted {formatClock(check.submittedAt)}</span>
          ) : check.source === 'paper' ? (
            <span className="tag lamp"><Icon name="pencil" size={14} />From paper</span>
          ) : undefined
        }
      />
      <div className="stats">
        <Stat value={t.present} label="Present" color="var(--present)" />
        <Stat value={t.absent} label="Absent" color="var(--absent)" />
        <Stat value={t.excused} label="Excused" color="var(--away)" />
      </div>
      {editable ? (
        <p className="muted small">Everyone starts as {def.name}. Tap a status to change it. Tap a name to add a note or pick another status.</p>
      ) : (
        <p className="muted small">
          {check.raName}{check.source === 'paper' ? ' · entered from paper' : ''}{check.submittedAt ? ` · submitted ${formatClock(check.submittedAt)}` : ' · in progress'}
        </p>
      )}
      {check.entries.length > 8 && (
        <div className="search">
          <Icon name="search" size={20} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a boy or room" aria-label="Find a boy or room" />
        </div>
      )}
      {check.entries.length === 0 && <Card><Empty>No boys are assigned to rooms on this floor yet.</Empty></Card>}
      {groups.map(([room, entries]) => {
        const present = entries.filter((e) => statusById(state, e.statusId)?.countsAs === 'present').length;
        return (
          <Card key={room}>
            <div className="card-title">
              <span className="mono">Room {room || '—'}</span>
              <span className="small muted">{present} of {entries.length} present</span>
            </div>
            {entries.map((e) => {
              const st = statusById(state, e.statusId);
              const showNote = e.note && canSeeNotes;
              return (
                <div className="entry" key={e.boyId}>
                  <button type="button" className="name-btn" onClick={() => (editable ? setNoteFor(e) : navigate(`/boys/${e.boyId}`))}>
                    <span className="name">{e.name}</span>
                    <span className={`meta ${showNote ? 'note' : ''}`}>Grade {e.grade}{showNote ? ` · ${e.note}` : st?.requiresNote && editable && !e.note ? ' · note needed' : ''}</span>
                  </button>
                  <StatusPill status={st} onClick={editable ? () => actions.cycleEntryStatus(check.id, e.boyId) : undefined} ariaLabel={`${e.name}: ${st?.name ?? 'unknown'}. Tap to change.`} />
                </div>
              );
            })}
          </Card>
        );
      })}
      {!editable && reopenable && (
        <Button variant="outline" icon="unlock" onClick={reopen}>Reopen this check</Button>
      )}
      {editable && (
        <div className="check-footer">
          <div className="inner">
            <div className="row small muted">
              <Icon name="sync" size={16} />
              <span>Saved on this phone as you go.</span>
              {(check.raId === user.id || user.role === 'dean') && (
                <button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={discard}>Discard</button>
              )}
            </div>
            <Button size="lg" block onClick={submit}>Submit check</Button>
          </div>
        </div>
      )}
      <Sheet open={!!noteFor} title={noteFor?.name ?? ''} onClose={() => setNoteFor(null)}>
        {noteFor && <NoteEditor checkId={check.id} entry={check.entries.find((e) => e.boyId === noteFor.boyId) ?? noteFor} onDone={() => setNoteFor(null)} />}
      </Sheet>
    </>
  );
}

function NoteEditor({ checkId, entry, onDone }: { checkId: string; entry: CheckEntry; onDone: () => void }) {
  const state = useAppState();
  const [note, setNote] = useState(entry.note ?? '');
  const statuses = sortedStatusTypes(state);
  return (
    <div className="stack">
      <div className="stack-sm">
        <div className="eyebrow">Status</div>
        <div className="row wrap">
          {statuses.map((s) => (
            <StatusPill key={s.id} status={s} onClick={() => actions.setEntryStatus(checkId, entry.boyId, s.id)} ariaLabel={`Set ${s.name}`} />
          ))}
        </div>
        <div className="small muted">Now: {statusById(state, entry.statusId)?.name}</div>
      </div>
      <TextArea label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="In shower, confirmed. With the dean. Signed out to the infirmary." rows={3} style={{ fontFamily: 'inherit', minHeight: 90 }} />
      <div className="row">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button className="grow" onClick={() => { actions.setEntryNote(checkId, entry.boyId, note); onDone(); }}>Save</Button>
      </div>
    </div>
  );
}
