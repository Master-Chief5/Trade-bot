import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { actions, useAppState } from '../../lib/store';
import { downloadText } from '../../lib/download';
import { useOnline } from '../../lib/online';
import { todayKey } from '../../lib/dates';
import { Banner, Card, ListRow, PageHeader } from '../../ui/Layout';
import { toast } from '../../ui/toast';

export function Backup() {
  const state = useAppState();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const size = Math.round(actions.exportJson().length / 1024);
  const synced = !!useOnline().session;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm('Replace everything on this device with the backup? The current data is gone unless you exported it.')) return;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      setBusy(false);
      const res = actions.importJson(String(reader.result ?? ''));
      if (!res.ok) return toast(res.error, 'error');
      toast('Backup restored');
      navigate('/');
    };
    reader.onerror = () => { setBusy(false); toast('Could not read that file.', 'error'); };
    reader.readAsText(file);
  };

  return (
    <>
      <PageHeader back="/settings" backLabel="Settings" title="Backup and restore" subtitle="Everything lives on this device until the online version is set up." />
      <Banner kind="info">A backup is one file with the floors, boys, staff, checks and settings. Keep a copy somewhere other than this phone, such as the school Drive.</Banner>
      <Card>
        <ListRow icon="download" onClick={() => downloadText(`room-check-backup-${todayKey()}.json`, actions.exportJson())} title="Export backup" subtitle={`${state.boys.length} boys · ${state.checks.length} checks · about ${size} KB`} chevron />
        {!synced && <ListRow icon="upload" onClick={() => fileRef.current?.click()} title={busy ? 'Reading…' : 'Restore from a backup'} subtitle="Replaces everything on this device" chevron />}
      </Card>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <p className="muted small">{synced ? 'With sync on, a new phone gets everything by signing in and being approved. Restoring a file here is turned off so devices cannot drift apart.' : 'To move to a new phone: export here, open the app on the new phone, finish setup with any name, then restore. The restore replaces the setup.'}</p>
    </>
  );
}
