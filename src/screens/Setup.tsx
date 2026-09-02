import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { actions, type SetupFloorInput } from '../lib/store';
import { signIn } from '../lib/session';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Form';
import { Card } from '../ui/Layout';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/toast';

const STEPS = ['Dorm', 'First dean', 'Floors & rooms', 'Finish'];

function defaultFloor(i: number): SetupFloorInput {
  return { name: `Floor ${i + 1}`, roomFrom: (i + 1) * 100 + 1, roomTo: (i + 1) * 100 + 12, capacity: 2, gradeLabel: '' };
}

export function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dormName, setDormName] = useState('Ryan Hall');
  const [yearLabel, setYearLabel] = useState(() => {
    const y = new Date().getFullYear();
    const start = new Date().getMonth() >= 6 ? y : y - 1;
    return `${start}–${String(start + 1).slice(-2)}`;
  });
  const [deanName, setDeanName] = useState('');
  const [deanEmail, setDeanEmail] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [floors, setFloors] = useState<SetupFloorInput[]>([defaultFloor(0), defaultFloor(1), defaultFloor(2)]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 0 && !dormName.trim()) e.dormName = 'Give the dorm a name.';
    if (step === 1) {
      if (!deanName.trim()) e.deanName = 'The dean needs a name.';
      if (!/^\d{4,6}$/.test(pin)) e.pin = 'Use 4 to 6 digits.';
      else if (pin !== pin2) e.pin2 = 'The PINs do not match.';
    }
    if (step === 2) {
      floors.forEach((f, i) => {
        if (!f.name.trim()) e[`f${i}name`] = 'Name this floor.';
        if (!Number.isFinite(f.roomFrom) || !Number.isFinite(f.roomTo) || f.roomTo < f.roomFrom) e[`f${i}rooms`] = 'Check the room range.';
        else if (f.roomTo - f.roomFrom > 200) e[`f${i}rooms`] = 'That is more than 200 rooms.';
      });
      if (!floors.length) e.floors = 'Add at least one floor.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const finish = () => {
    if (!validate()) return;
    const deanId = actions.completeSetup({ dormName, yearLabel, dean: { name: deanName, pin, email: deanEmail }, floors });
    signIn(deanId);
    toast('Ryan Hall is set up. Next, add the boys.');
    navigate('/boys', { replace: true });
  };

  const setFloor = (i: number, patch: Partial<SetupFloorInput>) => setFloors((fs) => fs.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const roomCount = floors.reduce((n, f) => n + (f.roomTo >= f.roomFrom ? f.roomTo - f.roomFrom + 1 : 0), 0);

  return (
    <div className="signin" style={{ justifyContent: 'flex-start', maxWidth: 560 }}>
      <div className="row" style={{ color: 'var(--duty)' }}>
        <Icon name="dorm" size={28} />
        <div>
          <div className="eyebrow">Set up · step {step + 1} of {STEPS.length}</div>
          <h1 style={{ fontSize: 26 }}>{STEPS[step]}</h1>
        </div>
      </div>
      <div className="steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}>
            <span className="n">{i < step ? <Icon name="check" size={14} stroke={2.4} /> : i + 1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card pad>
          <div className="stack">
            <TextInput label="Dorm name" value={dormName} onChange={(e) => setDormName(e.target.value)} error={errors.dormName} autoFocus />
            <TextInput label="School year" value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} help="Shown on printed sheets. You can start a new year later without losing this one." />
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card pad>
          <div className="stack">
            <p className="muted small">The first dean owns the app on this phone. More deans, the head RA and the RAs are added later under Staff.</p>
            <TextInput label="Dean's name" value={deanName} onChange={(e) => setDeanName(e.target.value)} error={errors.deanName} autoFocus autoComplete="name" />
            <TextInput label="Email (optional)" type="email" value={deanEmail} onChange={(e) => setDeanEmail(e.target.value)} autoComplete="email" />
            <div className="grid-2">
              <TextInput label="PIN" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} error={errors.pin} help="4 to 6 digits" />
              <TextInput label="Confirm PIN" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} error={errors.pin2} />
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <div className="stack">
          <Card pad>
            <div className="row-between">
              <div style={{ fontWeight: 500 }}>How many floors?</div>
              <div className="stepper">
                <Button variant="outline" iconOnly icon="minus" aria-label="Fewer floors" disabled={floors.length <= 1} onClick={() => setFloors((fs) => fs.slice(0, -1))} />
                <span className="value num">{floors.length}</span>
                <Button variant="outline" iconOnly icon="plus" aria-label="More floors" disabled={floors.length >= 10} onClick={() => setFloors((fs) => [...fs, defaultFloor(fs.length)])} />
              </div>
            </div>
          </Card>
          {floors.map((f, i) => (
            <Card pad key={i}>
              <div className="stack">
                <TextInput label={`Floor ${i + 1} name`} value={f.name} onChange={(e) => setFloor(i, { name: e.target.value })} error={errors[`f${i}name`]} />
                <div className="grid-2">
                  <TextInput label="First room" type="number" inputMode="numeric" value={f.roomFrom} onChange={(e) => setFloor(i, { roomFrom: Number(e.target.value) })} />
                  <TextInput label="Last room" type="number" inputMode="numeric" value={f.roomTo} onChange={(e) => setFloor(i, { roomTo: Number(e.target.value) })} error={errors[`f${i}rooms`]} />
                </div>
                <div className="grid-2">
                  <TextInput label="Boys per room" type="number" inputMode="numeric" min={1} max={6} value={f.capacity} onChange={(e) => setFloor(i, { capacity: Math.max(1, Number(e.target.value) || 1) })} />
                  <TextInput label="Grade label (optional)" placeholder="e.g. Grade 9" value={f.gradeLabel ?? ''} onChange={(e) => setFloor(i, { gradeLabel: e.target.value })} />
                </div>
              </div>
            </Card>
          ))}
          <p className="muted small">Room numbers can be changed one by one later. Grades live on each boy, so a mixed floor needs nothing special.</p>
        </div>
      )}

      {step === 3 && (
        <Card pad>
          <div className="stack">
            <div className="row-between"><span className="muted">Dorm</span><span>{dormName} · {yearLabel}</span></div>
            <div className="row-between"><span className="muted">First dean</span><span>{deanName}</span></div>
            <div className="row-between"><span className="muted">Floors</span><span>{floors.length} floors · {roomCount} rooms</span></div>
            {floors.map((f, i) => (
              <div key={i} className="row-between small"><span className="muted">{f.name}</span><span>Rooms {f.roomFrom} to {f.roomTo}{f.gradeLabel ? ` · ${f.gradeLabel}` : ''}</span></div>
            ))}
            <p className="muted small">Next you will paste the roster of boys and add the RAs. Status types and the 10:00 PM evening check are set up with sensible defaults you can change in Settings.</p>
          </div>
        </Card>
      )}

      <div className="setup-footer">
        {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
        {step < STEPS.length - 1 ? (
          <Button size="lg" className="grow" onClick={next}>Next: {STEPS[step + 1]}</Button>
        ) : (
          <Button size="lg" className="grow" onClick={finish}>Finish setup</Button>
        )}
      </div>
    </div>
  );
}
