import { useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { loadState, useAppState, useStoreReady } from './lib/store';
import { initOnline, onlineAvailable, useOnline } from './lib/online';
import { signOut, useSessionUserId } from './lib/session';
import { useCurrentUser } from './lib/useCurrentUser';
import { can, type Capability } from './lib/permissions';
import { useReminders, useRemindersEnabled } from './lib/reminders';
import type { StaffUser } from './lib/types';
import { TabBar, type TabDef } from './ui/Layout';
import { Toaster } from './ui/Toaster';
import { SignIn } from './screens/SignIn';
import { Setup } from './screens/Setup';
import { Home } from './screens/Home';
import { CheckScreen } from './screens/CheckScreen';
import { Floors } from './screens/Floors';
import { Boys } from './screens/Boys';
import { BoyDetail } from './screens/BoyDetail';
import { BoyForm } from './screens/BoyForm';
import { RosterImport } from './screens/RosterImport';
import { Print } from './screens/Print';
import { History } from './screens/History';
import { EnterFromPaper } from './screens/EnterFromPaper';
import { Settings } from './screens/Settings';
import { Welcome } from './screens/Welcome';
import { Account } from './screens/Account';
import { Join } from './screens/Join';
import { Waiting } from './screens/Waiting';
import { SyncSettings } from './screens/settings/SyncSettings';
import { StatusTypes } from './screens/settings/StatusTypes';
import { Schedules } from './screens/settings/Schedules';
import { Staff } from './screens/settings/Staff';
import { StaffEdit } from './screens/settings/StaffEdit';
import { HeadRA } from './screens/settings/HeadRA';
import { LeaveBoard } from './screens/settings/LeaveBoard';
import { Rollover } from './screens/settings/Rollover';
import { Backup } from './screens/settings/Backup';
import { Appearance } from './screens/settings/Appearance';
import { Dorm } from './screens/settings/Dorm';
import { Audit } from './screens/settings/Audit';
import { Archives } from './screens/settings/Archives';

export default function App() {
  const ready = useStoreReady();
  const online = useOnline();
  useEffect(() => {
    void loadState().then(() => initOnline());
  }, []);
  if (!ready || (onlineAvailable && !online.ready)) return <div className="splash">Opening Room Check…</div>;
  return (
    <HashRouter>
      <Gate />
      <Toaster />
    </HashRouter>
  );
}

function Gate() {
  const state = useAppState();
  const user = useCurrentUser();
  const sessionId = useSessionUserId();
  const online = useOnline();
  const account = online.session;
  useEffect(() => {
    if (!account && sessionId && !user) signOut();
  }, [account, sessionId, user]);

  if (account) {
    // Online mode: the account decides where you land.
    const m = online.membership;
    let element: ReactNode;
    if (!m) element = <Join />;
    else if (m.status === 'revoked') element = <Waiting reason="revoked" />;
    else if (m.status !== 'active') element = <Waiting reason="pending" />;
    else if (!online.hasKey) element = <Waiting reason="device" />;
    else if (!state.setupComplete) element = m.role === 'dean' ? <Setup authUserId={account.user.id} displayName={online.displayName} /> : <Waiting reason="syncing" />;
    else if (!user) element = <Waiting reason="syncing" />;
    else element = <Shell user={user} />;
    return (
      <Routes>
        <Route path="/account" element={<Navigate to="/" replace />} />
        <Route path="/welcome" element={<Navigate to="/" replace />} />
        <Route path="/*" element={element} />
      </Routes>
    );
  }

  // The session expired but this device still holds a synced dorm: sign in, do not fall back to PINs.
  if (online.needsSignIn) {
    return (
      <Routes>
        <Route path="/account" element={<Account />} />
        <Route path="/*" element={<Navigate to="/account" replace />} />
      </Routes>
    );
  }

  // Device-only mode (PIN sign-in), or no account yet.
  return (
    <Routes>
      <Route path="/welcome" element={onlineAvailable && !state.setupComplete ? <Welcome /> : <Navigate to="/" replace />} />
      <Route path="/account" element={onlineAvailable ? <Account /> : <Navigate to="/" replace />} />
      <Route path="/setup" element={state.setupComplete ? <Navigate to="/" replace /> : <Setup />} />
      <Route path="/signin" element={!state.setupComplete ? <Navigate to={onlineAvailable ? '/welcome' : '/setup'} replace /> : user ? <Navigate to="/" replace /> : <SignIn />} />
      <Route path="/*" element={!state.setupComplete ? <Navigate to={onlineAvailable ? '/welcome' : '/setup'} replace /> : !user ? <Navigate to="/signin" replace /> : <Shell user={user} />} />
    </Routes>
  );
}

const TABS: TabDef[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/floors', label: 'Floors', icon: 'floors' },
  { to: '/boys', label: 'Boys', icon: 'boys' },
  { to: '/print', label: 'Print', icon: 'print' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

function Shell({ user }: { user: StaffUser }) {
  const state = useAppState();
  const location = useLocation();
  const [remindersOn] = useRemindersEnabled();
  useReminders(state, user, remindersOn);
  const wide = user.role === 'dean' || can(user, 'viewAllFloors', state.headRAPermissions);
  const isCheck = location.pathname.startsWith('/check/');
  return (
    <div className="shell">
      <TabBar tabs={TABS} brandName={state.settings.dormName} brandSub={`Room check · ${state.settings.yearLabel}`} />
      <main className={`content ${wide ? 'wide' : ''} ${isCheck ? 'has-footer' : ''}`}>
        <Routes>
          <Route index element={<Home user={user} />} />
          <Route path="check/:id" element={<CheckScreen user={user} />} />
          <Route path="floors" element={<Floors user={user} />} />
          <Route path="floors/:floorId" element={<Floors user={user} />} />
          <Route path="boys" element={<Boys user={user} />} />
          <Route path="boys/new" element={<Require user={user} cap="manageBoys"><BoyForm user={user} /></Require>} />
          <Route path="boys/import" element={<Require user={user} cap="manageBoys"><RosterImport user={user} /></Require>} />
          <Route path="boys/:id" element={<BoyDetail user={user} />} />
          <Route path="boys/:id/edit" element={<Require user={user} cap="manageBoys"><BoyForm user={user} /></Require>} />
          <Route path="print" element={<Print user={user} />} />
          <Route path="history" element={<History user={user} />} />
          <Route path="paper" element={<Require user={user} cap="enterFromPaper"><EnterFromPaper user={user} /></Require>} />
          <Route path="settings" element={<Settings user={user} />} />
          <Route path="settings/appearance" element={<Appearance />} />
          <Route path="settings/sync" element={<SyncSettings user={user} />} />
          <Route path="settings/status-types" element={<Require user={user} cap="manageStatusTypes"><StatusTypes /></Require>} />
          <Route path="settings/schedules" element={<Require user={user} cap="manageSchedules"><Schedules /></Require>} />
          <Route path="settings/staff" element={<Require user={user} cap={['manageRAs', 'assignRAs']}><Staff user={user} /></Require>} />
          <Route path="settings/staff/new" element={<Require user={user} cap="manageRAs"><StaffEdit user={user} /></Require>} />
          <Route path="settings/staff/:id" element={<Require user={user} cap={['manageRAs', 'assignRAs']}><StaffEdit user={user} /></Require>} />
          <Route path="settings/head-ra" element={<Require user={user} cap="manageDeans"><HeadRA user={user} /></Require>} />
          <Route path="settings/leave" element={<Require user={user} cap="manageLeave"><LeaveBoard user={user} /></Require>} />
          <Route path="settings/rollover" element={<Require user={user} cap="rollover"><Rollover user={user} /></Require>} />
          <Route path="settings/backup" element={<Require user={user} cap="backup"><Backup /></Require>} />
          <Route path="settings/dorm" element={<Require user={user} cap="manageDorm"><Dorm /></Require>} />
          <Route path="settings/audit" element={<Require user={user} cap="manageDeans"><Audit /></Require>} />
          <Route path="settings/archives" element={<Require user={user} cap="manageDeans"><Archives /></Require>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

/** Renders children only when the user has the capability (or any one of a list). */
function Require({ user, cap, children }: { user: StaffUser; cap: Capability | Capability[]; children: ReactNode }) {
  const state = useAppState();
  const caps = Array.isArray(cap) ? cap : [cap];
  if (!caps.some((c) => can(user, c, state.headRAPermissions))) return <Navigate to="/" replace />;
  return <>{children}</>;
}
