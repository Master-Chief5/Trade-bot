import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAppState } from '../lib/store';
import { scheduleCode, sortedFloors } from '../lib/checks';
import { addDays, formatDateShort, todayKey } from '../lib/dates';
import { visibleFloorIds } from '../lib/permissions';
import { buildPayload, createHandoff, CLAIM_WINDOW_SECONDS, listHandoffs, revokeHandoff, unwrapHandoffKey, type HandoffRow, type HandoffClaim } from '../lib/handoff';
import { dormKeyForHandoff, getOnline, useOnline } from '../lib/online';
import { decryptJson } from '../lib/crypto';
import type { StaffUser } from '../lib/types';
import { Button } from '../ui/Button';
import { SelectInput, TextInput, Toggle } from '../ui/Form';
import { Banner, Card, ListRow, PageHeader, SectionLabel } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { toast } from '../ui/toast';

export function Handoff({ user }: { user: StaffUser }) {
  const state = useAppState();
  const online = useOnline();
  const floors = useMemo(() => sortedFloors(state).filter((f) => visibleFloorIds(state, user).includes(f.id)), [state, user]);
  const [floorId, setFloorId] = useState(floors[0]?.id ?? '');
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [scheduleIds, setScheduleIds] = useState<string[]>(state.schedules.filter((s) => s.active).map((s) => s.id));
  const [made, setMade] = useState<{ url: string; id: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<HandoffRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const canHandOff = online.dorm && online.hasKey;

  const reload = useMemo(() => async () => {
    const dormId = getOnline().dorm?.id;
    if (!dormId) return;
    try {
      const list = await listHandoffs(dormId);
      setRows(list);
      // Names are sealed under each handoff's own key; unwrap what this device can read.
      const out: Record<string, string> = {};
      for (const h of list) {
        if (!h.claim) continue;
        try {
          const dk = await dormKeyForHandoff(h.keyVersion);
          if (!dk) continue;
          const k = await unwrapHandoffKey(dk, h.wrappedKey);
          out[h.id] = (await decryptJson<HandoffClaim>(k, h.claim, 'handoff:v1')).name;
        } catch {
          // A handoff sealed under a key this device no longer holds simply stays unnamed.
        }
      }
      setNames(out);
    } catch (err) {
      console.warn(err);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 10_000);
    return () => clearInterval(t);
  }, [reload]);

  const make = async () => {
    if (!floorId) return toast('Pick a floor.', 'error');
    if (to < from) return toast('The last night is before the first.', 'error');
    if (!scheduleIds.length) return toast('Pick at least one check to hand over.', 'error');
    const o = getOnline();
    if (!o.dorm || !o.deviceId) return toast('Turn on online sync first.', 'error');
    setBusy(true);
    try {
      const dormKey = await dormKeyForHandoff(o.dorm.keyVersion);
      if (!dormKey) throw new Error('Waiting for the dorm key.');
      const payload = buildPayload(state, floorId, from, to, user.id, user.name, scheduleIds);
      const created = await createHandoff(o.dorm.id, o.dorm.keyVersion, dormKey, o.deviceId, payload);
      setMade(created);
      void reload();
    } catch (err) {
      toast((err as Error).message || 'Could not make a code.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const nights = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1;

  return (
    <>
      <PageHeader
        back="/"
        backLabel="Home"
        title="Hand over a check"
        subtitle="Show the code to whoever is covering. They scan it with their camera — no account, no app to install."
      />

      {!canHandOff && (
        <Banner kind="warn">
          Handing over needs online sync, because the code has to reach the other phone somehow. Turn it on under Settings → Online sync.
          Until then, print a blank sheet from Print and give them that.
        </Banner>
      )}

      <Card pad>
        <div className="stack">
          <SelectInput label="Floor" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
            {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </SelectInput>
          <div className="grid-2">
            <TextInput label="First night" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            <TextInput label="Last night" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Button variant="outline" size="sm" onClick={() => { setFrom(todayKey()); setTo(todayKey()); }}>Tonight</Button>
            <Button variant="outline" size="sm" onClick={() => { setFrom(todayKey()); setTo(addDays(todayKey(), 2)); }}>Three nights</Button>
            <Button variant="outline" size="sm" onClick={() => { setFrom(todayKey()); setTo(addDays(todayKey(), 6)); }}>A week</Button>
          </div>
          <SectionLabel>Checks they will do</SectionLabel>
          <Card>
            {state.schedules.filter((s) => s.active).map((s) => (
              <Toggle
                key={s.id}
                label={`${scheduleCode(s)} · ${s.name}`}
                checked={scheduleIds.includes(s.id)}
                onChange={(v) => setScheduleIds((ids) => (v ? [...ids, s.id] : ids.filter((x) => x !== s.id)))}
              />
            ))}
          </Card>
          <Button size="lg" block disabled={!canHandOff || busy} onClick={make}>
            {busy ? 'Making a code…' : `Make a code for ${nights} ${nights === 1 ? 'night' : 'nights'}`}
          </Button>
        </div>
      </Card>

      <p className="muted small">
        They get the names and rooms for that floor and those nights, and nothing else — no other floor, no history, no notes.
        Their access ends on its own after the last night. A dean sees who claimed it as soon as they scan.
      </p>

      {rows.length > 0 && (
        <>
          <SectionLabel>Recent handovers</SectionLabel>
          <Card>
            {rows.map((h) => <HandoffRowView key={h.id} row={h} name={names[h.id]} onChanged={reload} />)}
          </Card>
        </>
      )}

      <Sheet open={made !== null} title="Scan this" onClose={() => { setMade(null); void reload(); }}>
        {made && <QrPanel url={made.url} expiresAt={made.expiresAt} onDone={() => { setMade(null); void reload(); }} />}
      </Sheet>
    </>
  );
}

function HandoffRowView({ row, name, onChanged }: { row: HandoffRow; name?: string; onChanged: () => void }) {
  const expired = !row.claimedAt && new Date(row.expiresAt) < new Date();
  const state = row.revokedAt ? 'Cancelled' : row.claimedAt ? `Claimed by ${name ?? 'someone'}` : expired ? 'Not used' : 'Waiting to be scanned';
  const range = row.coversFrom === row.coversTo ? formatDateShort(row.coversFrom) : `${formatDateShort(row.coversFrom)} to ${formatDateShort(row.coversTo)}`;
  const stillRunning = !row.revokedAt && row.claimedAt && row.coversTo >= todayKey();
  return (
    <ListRow
      title={state}
      subtitle={range}
      trail={stillRunning ? (
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            if (!window.confirm('End this cover now? Their page stops working.')) return;
            try {
              await revokeHandoff(row.id);
              onChanged();
              toast('Cover ended');
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          }}
        >
          End
        </Button>
      ) : undefined}
    />
  );
}

/** The code itself, with the countdown that makes it useless once it has been on screen too long. */
function QrPanel({ url, expiresAt, onDone }: { url: string; expiresAt: string; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [left, setLeft] = useState(CLAIM_WINDOW_SECONDS);

  useEffect(() => {
    if (canvas.current) void QRCode.toCanvas(canvas.current, url, { width: 260, margin: 1, errorCorrectionLevel: 'M' });
  }, [url]);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [expiresAt]);

  return (
    <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <canvas ref={canvas} className="qr" aria-label="Handover code" />
      {left > 0 ? (
        <>
          <strong style={{ fontSize: 20 }}>{left}s</strong>
          <p className="muted small" style={{ margin: 0 }}>
            Point their camera at this. It works once — the first phone to scan it takes the cover, and the code dies either way when the
            timer runs out.
          </p>
        </>
      ) : (
        <Banner kind="warn">This code has expired. Make another one.</Banner>
      )}
      <Button variant="outline" block onClick={onDone}>Done</Button>
    </div>
  );
}
