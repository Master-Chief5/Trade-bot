import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword, signIn, signUp } from '../lib/online';
import { Button } from '../ui/Button';
import { Segmented, TextInput } from '../ui/Form';
import { Icon } from '../ui/Icon';
import { Banner, Card } from '../ui/Layout';
import { toast } from '../ui/toast';

export function Account() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const submit = async () => {
    setError('');
    setNote('');
    if (mode === 'signup' && !name.trim()) return setError('Tell us your name.');
    if (!email.trim()) return setError('Email is required.');
    if (password.length < 6) return setError('Use a password of at least 6 characters.');
    setBusy(true);
    const res = mode === 'signup' ? await signUp(name, email, password) : await signIn(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.note) return setNote(res.note);
    navigate('/', { replace: true });
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Type your email first, then tap Forgot password.');
    const res = await resetPassword(email);
    if (res.ok) toast(res.note ?? 'Sent');
    else setError(res.error);
  };

  return (
    <div className="signin" style={{ justifyContent: 'flex-start' }}>
      <button type="button" className="back" onClick={() => navigate(-1)}>
        <Icon name="back" size={20} />
        <span>Back</span>
      </button>
      <h1 style={{ fontSize: 28 }}>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
      <Segmented options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} value={mode} onChange={setMode} label="Sign in or create account" />
      <Card pad>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {mode === 'signup' && <TextInput label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus help="How the deans and the printed sheet will show you." />}
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoFocus={mode === 'signin'} />
          <TextInput label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          {error && <div className="form-error" role="alert">{error}</div>}
          {note && <Banner kind="info">{note}</Banner>}
          <Button size="lg" type="submit" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}</Button>
          {mode === 'signin' && <Button variant="ghost" size="sm" type="button" onClick={forgot}>Forgot password</Button>}
        </form>
      </Card>
      <p className="muted small">{mode === 'signup' ? 'After this, a dean activates you with a join code. Your password never leaves your phone in readable form.' : 'Your account only proves who you are. The dorm data stays encrypted with a key that lives on approved phones.'}</p>
    </div>
  );
}
