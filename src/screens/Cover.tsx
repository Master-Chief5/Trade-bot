import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  claimHandoff, normalizeName, reopenHandoff, submitHandoffResult, validFullName,
  type HandoffPayload, type HandoffResult,
} from '../lib/handoff';
import { DAY_NAMES_LONG, formatDateLong, formatTime12, todayKey, weekdayOf } from '../lib/dates';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Form';
import { Banner, Card, Empty, PageHeader, SectionLabel } from '../ui/Layout';
import { toast } from '../ui/toast';

interface Saved {
  token: string;
  key: string;
  name: string;
  done: string[];
}

const storeKey = (id: string) => `rh-cover-${id}`;

function load(id: string): Saved | null {
  try {
    const raw = localStorage.getItem(storeKey(id));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function save(id: string, s: Saved) {
  try {
    localStorage.setItem(storeKey(id), JSON.stringify(s));
  } catch {
    // A locked-down browser just means they re-enter their name; nothing is lost.
  }
}

/**
 * What someone outside the dorm sees after scanning a handover code. No account, no install,
 * no other floor, and it stops working on its own after the last night it covers.
 */
export function Cover() {
  const { id = '' } = useParams();
  // The key rides in the fragment's query string, which never reaches a server.
  const keyFromUrl = useMemo(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('k') ?? '', []);
  const [saved, setSaved] = useState<Saved | null>(() => load(id));
  const [payload, setPayload] = useState<HandoffPayload | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doing, setDoing] = useState<string | null>(null);

  const key = saved?.key || keyFromUrl;

  const reopen = useCallback(async () => {
    if (!saved) return;
    setBusy(true);
    try {
      const opened = await reopenHandoff(id, saved.key, saved.token);
      setPayload(opened.payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [id, saved]);

  useEffect(() => { void reopen(); }, [reopen]);

  const claim = async () => {
    if (!validFullName(name)) return toast('Enter your first and last name.', 'error');
    if (!key) return toast('This link is incomplete. Ask them to show the code again.', 'error');
    setBusy(true);
    try {
      const opened = await claimHandoff(id, key, normalizeName(name));
      const next: Saved = { token: opened.token, key, name: normalizeName(name), done: [] };
      save(id, next);
      setSaved(next);
      setPayload(opened.payload);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!id || !key) {
    return (
      <div className="pad">
        <PageHeader title="Room check" subtitle="Covering for someone" />
        <Banner kind="danger">This link is missing part of itself. Ask whoever sent you to show the code again.</Banner>
      </div>
    );
  }

  // Not claimed yet: the name gate.
  if (!saved) {
    return (
      <div className="pad">
        <PageHeader title="Covering a room check" subtitle="You do not need an account. Put your name in so the deans know who walked the floor." />
        {error && <Banner kind="danger">{error}</Banner>}
        <Card pad>
          <div className="stack">
            <TextInput
              label="Your full name"
              value={name}
              autoFocus
              autoComplete="name"
              placeholder="Jordan Miles"
              onChange={(e) => setName(e.target.value)}
              help="First and last name. This goes on the sheet the deans file, so it has to be the name you go by on paper."
            />
            <Button size="lg" block disabled={busy || !validFullName(name)} onClick={claim}>
              {busy ? 'Opening…' : 'Start'}
            </Button>
          </div>
        </Card>
        <p className="muted small">
          The code works once and only for a minute, so if this fails, ask them to make a new one.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pad">
        <PageHeader title="Room check" subtitle={saved.name} />
        <Banner kind="danger">{error}</Banner>
        <Card pad><Button block variant="outline" onClick={() => void reopen()}>Try again</Button></Card>
      </div>
    );
  }

  if (!payload) {
    return <div className="pad"><Empty>Opening…</Empty></div>;
  }

  const today = todayKey();
  const inRange = today >= payload.from && today <= payload.to;
  const wd = weekdayOf(today);
  const tonight = payload.checks.filter((c) => c.days.includes(wd));

  if (doing) {
    const check = payload.checks.find((c) => c.scheduleId === doing);
    if (check) {
      return (
        <CoverCheck
          id={id}
          saved={saved}
          payload={payload}
          check={check}
          date={today}
          onDone={() => {
            const next = { ...saved, done: [...saved.done, `${today}:${doing}`] };
            save(id, next);
            setSaved(next);
            setDoing(null);
          }}
          onCancel={() => setDoing(null)}
        />
      );
    }
  }

  return (
    <div className="pad">
      <PageHeader
        eyebrow={formatDateLong(today)}
        title={payload.floorName}
        subtitle={`${payload.dormName} · covering for ${payload.forRaName} · ${saved.name}`}
      />
      {!inRange && (
        <Banner kind="warn">
          You are covering {payload.from === payload.to ? formatDateLong(payload.from) : `${formatDateLong(payload.from)} to ${formatDateLong(payload.to)}`}. There is nothing to do today.
        </Banner>
      )}
      {inRange && tonight.length === 0 && (
        <Banner kind="warn">No check runs on a {DAY_NAMES_LONG[wd]} for this floor.</Banner>
      )}
      {inRange && tonight.map((c) => {
        const done = saved.done.includes(`${today}:${c.scheduleId}`);
        return (
          <Card pad key={c.scheduleId}>
            <div className="stack">
              <div className="row-between">
                <div>
                  <strong style={{ fontSize: 18 }}>{c.name}</strong>
                  <div className="muted small">{formatTime12(c.time)} · {payload.boys.length} boys</div>
                </div>
                {done && <span className="tag present">Sent</span>}
              </div>
              <Button size="lg" block disabled={done} onClick={() => setDoing(c.scheduleId)}>
                {done ? 'Already sent' : 'Start check'}
              </Button>
            </div>
          </Card>
        );
      })}
      <p className="muted small">
        Everything you send goes straight to {payload.forRaName} and the deans. This page stops working after {formatDateLong(payload.to)}.
      </p>
    </div>
  );
}

function CoverCheck({
  id, saved, payload, check, date, onDone, onCancel,
}: {
  id: string;
  saved: Saved;
  payload: HandoffPayload;
  check: HandoffPayload['checks'][number];
  date: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const statuses = useMemo(() => [...payload.statusTypes].sort((a, b) => a.sortOrder - b.sortOrder), [payload.statusTypes]);
  const fallback = statuses.find((s) => s.isDefault) ?? statuses.find((s) => s.countsAs === 'present') ?? statuses[0];
  const [marks, setMarks] = useState<Record<string, string>>(() => Object.fromEntries(payload.boys.map((b) => [b.id, fallback?.id ?? ''])));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [startedAt] = useState(() => new Date().toISOString());
  const [busy, setBusy] = useState(false);

  const cycle = (boyId: string) => {
    setMarks((m) => {
      const i = statuses.findIndex((s) => s.id === m[boyId]);
      return { ...m, [boyId]: statuses[(i + 1) % statuses.length].id };
    });
  };

  const submit = async () => {
    const missing = payload.boys.filter((b) => {
      const st = statuses.find((s) => s.id === marks[b.id]);
      return st?.requiresNote && !notes[b.id]?.trim();
    });
    if (missing.length) return toast(`Add a note for ${missing.map((m) => m.name).join(', ')}.`, 'error');
    setBusy(true);
    try {
      const result: HandoffResult = {
        v: 1,
        scheduleId: check.scheduleId,
        floorId: payload.floorId,
        forRaId: payload.forRaId,
        forRaName: payload.forRaName,
        date,
        by: saved.name,
        startedAt,
        submittedAt: new Date().toISOString(),
        entries: payload.boys.map((b) => ({ boyId: b.id, statusId: marks[b.id], note: notes[b.id]?.trim() || undefined })),
      };
      await submitHandoffResult(id, saved.key, saved.token, result);
      toast('Sent');
      onDone();
    } catch (err) {
      toast((err as Error).message || 'Could not send it.', 'error');
    } finally {
      setBusy(false);
    }
  };

  let lastRoom = '';
  return (
    <div className="pad">
      <PageHeader title={check.name} subtitle={`${payload.floorName} · ${formatDateLong(date)}`} />
      <Card>
        {payload.boys.map((b) => {
          const st = statuses.find((s) => s.id === marks[b.id]);
          const header = b.roomNumber !== lastRoom ? b.roomNumber : '';
          lastRoom = b.roomNumber;
          return (
            <div key={b.id}>
              {header && <SectionLabel>Room {header}</SectionLabel>}
              <div className="listrow">
                <button type="button" className="body" style={{ textAlign: 'left' }} aria-label={`${b.name}: ${st?.name ?? ''}`} onClick={() => cycle(b.id)}>
                  <span className="primary-text">{b.name}</span>
                  <span className="secondary-text">Grade {b.grade}</span>
                </button>
                <span className="trail">
                  <button type="button" className="tag" style={{ background: st?.color, color: '#fff' }} onClick={() => cycle(b.id)}>
                    {st?.code}
                  </button>
                </span>
              </div>
              {st?.requiresNote && (
                <div style={{ padding: '0 14px 10px' }}>
                  <TextInput
                    label={`Why is ${b.name} ${st.name.toLowerCase()}?`}
                    value={notes[b.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [b.id]: e.target.value }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </Card>
      <div className="row">
        <Button variant="outline" onClick={onCancel} disabled={busy}>Back</Button>
        <Button className="grow" size="lg" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send to the dorm'}</Button>
      </div>
      <p className="muted small">Tap a name to change it. Once you send this you cannot take it back — tell {payload.forRaName} if something was wrong.</p>
    </div>
  );
}
