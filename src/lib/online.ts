/**
 * Online mode: accounts, device keys, dorm membership, approvals and the encrypted event sync.
 *
 * The server (Supabase) stores accounts, public keys, who belongs to which dorm, and ciphertext.
 * Every dorm record is encrypted on the device with the dorm key before it is sent, and decrypted
 * after it is received. The dorm key reaches a device only inside a grant sealed to that device.
 */
import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { del, get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { decryptJson, encryptJson, fingerprint, generateDeviceKeyPair, generateDormKey, unwrapDormKey, wrapDormKey } from './crypto';
import { initialState } from './defaults';
import { actions, applyEvent, getState, rebase, replaceState, setRecorder, type StoreEvent } from './store';
import type { AppState, Role, StaffUser } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
export const onlineAvailable = Boolean(SUPABASE_URL && SUPABASE_KEY && typeof globalThis.crypto?.subtle !== 'undefined');

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL ?? '', SUPABASE_KEY ?? '', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}

// ---------- persisted device records ----------

interface DeviceRecord {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
  deviceId?: string;
}
interface KeyRecord {
  dormId: string;
  keys: Record<string, CryptoKey>;
}
interface SyncMeta {
  dormId: string;
  lastSeq: number;
  lastSnapshotSeq: number;
  pending: { event: StoreEvent; sent: boolean }[];
  confirmedState: AppState | null;
}

const DEVICE_KEY = 'rh-device-v1';
const KEYS_KEY = 'rh-dorm-keys-v1';
const META_KEY = 'rh-sync-v1';

async function loadDevice(): Promise<DeviceRecord> {
  const saved = (await get(DEVICE_KEY)) as DeviceRecord | undefined;
  if (saved?.privateKey) return saved;
  const pair = await generateDeviceKeyPair();
  const rec: DeviceRecord = { privateKey: pair.privateKey, publicJwk: pair.publicJwk };
  await set(DEVICE_KEY, rec);
  return rec;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Device';
}

// ---------- observable online state ----------

export type MembershipStatus = 'pending' | 'active' | 'revoked';
export interface OnlineState {
  ready: boolean;
  session: Session | null;
  displayName: string;
  deviceId: string | null;
  deviceFingerprint: string;
  membership: { dormId: string; role: Role; status: MembershipStatus } | null;
  dorm: { id: string; name: string; joinCode: string; keyVersion: number } | null;
  hasKey: boolean;
  pendingRequests: number;
  sync: { lastSyncAt: string | null; pendingCount: number; error: string | null; busy: boolean };
}

let online: OnlineState = {
  ready: false, session: null, displayName: '', deviceId: null, deviceFingerprint: '', membership: null, dorm: null, hasKey: false, pendingRequests: 0,
  sync: { lastSyncAt: null, pendingCount: 0, error: null, busy: false },
};
const listeners = new Set<() => void>();

/** Shallow value equality, one level into plain objects, so unchanged reloads do not re-render. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

function setOnline(patch: Partial<OnlineState>) {
  const changed = (Object.keys(patch) as (keyof OnlineState)[]).some((k) => !same(online[k], patch[k]));
  if (!changed) return;
  online = { ...online, ...patch };
  listeners.forEach((l) => l());
}
function setSync(patch: Partial<OnlineState['sync']>) {
  setOnline({ sync: { ...online.sync, ...patch } });
}
export function getOnline(): OnlineState {
  return online;
}
export function useOnline(): OnlineState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getOnline,
    getOnline,
  );
}

let device: DeviceRecord | null = null;
let keys: KeyRecord | null = null;
let meta: SyncMeta | null = null;
let channels: RealtimeChannel[] = [];
let waitingChannels: RealtimeChannel[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let waitingTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let loadingInitial = false;
/** Resolves once the current session's device row exists, so actions never race registration. */
let sessionReady: Promise<void> = Promise.resolve();

// ---------- boot ----------

export async function initOnline(): Promise<void> {
  if (!onlineAvailable || started) {
    if (!onlineAvailable) setOnline({ ready: true });
    return;
  }
  started = true;
  device = await loadDevice();
  setOnline({ deviceFingerprint: await fingerprint(device.publicJwk) });
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  sessionReady = onSession(data.session);
  await sessionReady;
  sb.auth.onAuthStateChange((_event, session) => {
    sessionReady = onSession(session);
  });
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setOnline({ ready: true });
}

async function onSession(session: Session | null) {
  if (!session) {
    stopSync();
    stopWaiting();
    setOnline({ session: null, displayName: '', deviceId: null, membership: null, dorm: null, hasKey: false, pendingRequests: 0 });
    return;
  }
  const displayName = (session.user.user_metadata?.display_name as string | undefined) ?? session.user.email ?? 'Someone';
  setOnline({ session, displayName });
  await supabase().from('profiles').upsert({ id: session.user.id, display_name: displayName }, { onConflict: 'id' });
  await registerDevice(session.user.id);
  await refreshMembership();
}

async function registerDevice(userId: string) {
  if (!device) return;
  const sb = supabase();
  if (device.deviceId) {
    const { data } = await sb.from('devices').select('id').eq('id', device.deviceId).maybeSingle();
    if (data) {
      await sb.from('devices').update({ last_seen: new Date().toISOString() }).eq('id', device.deviceId);
      setOnline({ deviceId: device.deviceId });
      return;
    }
  }
  const { data, error } = await sb.from('devices').insert({ user_id: userId, name: deviceName(), public_key: device.publicJwk }).select('id').single();
  if (error || !data) {
    setSync({ error: 'Could not register this device.' });
    return;
  }
  device = { ...device, deviceId: data.id as string };
  await set(DEVICE_KEY, device);
  setOnline({ deviceId: device.deviceId ?? null });
}

/** Re-read membership, dorm and key grants. Starts sync when this device holds the dorm key. */
export async function refreshMembership(): Promise<void> {
  const session = online.session;
  if (!session || !device) return;
  const sb = supabase();
  const { data: rows } = await sb.from('memberships').select('dorm_id, role, status').eq('user_id', session.user.id);
  const row = (rows ?? []).find((m) => m.status === 'active') ?? (rows ?? []).find((m) => m.status === 'pending') ?? (rows ?? [])[0];
  if (!row) {
    stopSync();
    setOnline({ membership: null, dorm: null, hasKey: false });
    return;
  }
  const membership = { dormId: row.dorm_id as string, role: row.role as Role, status: row.status as MembershipStatus };
  const { data: dorm } = await sb.from('dorms').select('id, name, join_code, key_version').eq('id', membership.dormId).maybeSingle();
  setOnline({ membership, dorm: dorm ? { id: dorm.id, name: dorm.name, joinCode: dorm.join_code, keyVersion: dorm.key_version } : null });
  if (membership.status !== 'active' || !dorm) {
    stopSync();
    setOnline({ hasKey: false });
    startWaiting(session.user.id);
    return;
  }
  const hasKey = await ensureKey(membership.dormId, dorm.key_version as number);
  setOnline({ hasKey });
  if (hasKey) {
    stopWaiting();
    await startSync(membership.dormId);
  } else {
    startWaiting(session.user.id);
  }
  if (membership.role === 'dean') void refreshPendingCount();
}

/** While waiting to be approved (or for this device's key), listen for the dean's decision. */
function startWaiting(userId: string) {
  if (waitingChannels.length || !device?.deviceId) return;
  const sb = supabase();
  waitingChannels = [
    sb.channel(`me:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'memberships', filter: `user_id=eq.${userId}` }, () => void refreshMembership()).subscribe(),
    sb.channel(`mykeys:${device.deviceId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'key_grants', filter: `device_id=eq.${device.deviceId}` }, () => void refreshMembership()).subscribe(),
  ];
  // Websockets can be blocked on school networks, so never rely on them alone.
  if (!waitingTimer) waitingTimer = setInterval(() => void refreshMembership(), 8_000);
}

function stopWaiting() {
  waitingChannels.forEach((c) => void supabase().removeChannel(c));
  waitingChannels = [];
  if (waitingTimer) clearInterval(waitingTimer);
  waitingTimer = null;
}

async function loadKeys(dormId: string): Promise<KeyRecord> {
  if (keys && keys.dormId === dormId) return keys;
  const saved = (await get(KEYS_KEY)) as KeyRecord | undefined;
  keys = saved && saved.dormId === dormId ? saved : { dormId, keys: {} };
  return keys;
}

async function saveKeys() {
  if (keys) await set(KEYS_KEY, keys);
}

/** Make sure this device can decrypt `version`; fetches and unwraps the grant when needed. */
async function ensureKey(dormId: string, version: number): Promise<boolean> {
  const rec = await loadKeys(dormId);
  if (rec.keys[version]) return true;
  if (!device?.deviceId) return false;
  const sb = supabase();
  const { data: grant } = await sb.from('key_grants').select('wrapped_key, granter_device_id').eq('dorm_id', dormId).eq('device_id', device.deviceId).eq('key_version', version).maybeSingle();
  if (!grant) return false;
  const { data: granter } = await sb.from('devices').select('public_key').eq('id', grant.granter_device_id).maybeSingle();
  if (!granter) return false;
  try {
    const key = await unwrapDormKey(grant.wrapped_key as string, device.privateKey, granter.public_key as JsonWebKey, aad(dormId, version));
    rec.keys[version] = key;
    await saveKeys();
    return true;
  } catch (err) {
    console.warn('Could not open the dorm key', err);
    return false;
  }
}

function aad(dormId: string, version: number): string {
  return `${dormId}:${version}`;
}

// ---------- accounts ----------

export type OnlineResult = { ok: true; note?: string } | { ok: false; error: string };

export async function signUp(name: string, email: string, password: string): Promise<OnlineResult> {
  const { data, error } = await supabase().auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } });
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data.session) return { ok: true, note: 'Check your email to confirm the account, then sign in.' };
  return { ok: true };
}

export async function signIn(email: string, password: string): Promise<OnlineResult> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true };
}

export async function resetPassword(email: string): Promise<OnlineResult> {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim());
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, note: 'If that email has an account, a reset link is on its way.' };
}

/** Signs out and wipes the dorm data and keys from this device. */
export async function signOutAndWipe(): Promise<void> {
  stopSync();
  try {
    await supabase().auth.signOut();
  } catch {
    // ignore
  }
  await del(KEYS_KEY);
  await del(META_KEY);
  keys = null;
  meta = null;
  replaceState(initialState());
}

function friendly(message: string): string {
  if (/invalid login/i.test(message)) return 'Wrong email or password.';
  if (/already registered/i.test(message)) return 'That email already has an account. Sign in instead.';
  if (/password/i.test(message) && /6/.test(message)) return 'Use a password of at least 6 characters.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first, then sign in.';
  return message;
}

// ---------- joining and creating ----------

export async function requestJoin(code: string): Promise<OnlineResult> {
  await sessionReady;
  const { error } = await supabase().rpc('request_membership', { p_code: code });
  if (error) return { ok: false, error: /no dorm/i.test(error.message) ? 'No dorm has that code. Check it with your dean.' : error.message };
  await refreshMembership();
  return { ok: true };
}

/** A dean creates the dorm online, becomes its first key holder, and uploads this device's data as the first snapshot. */
export async function createDormOnline(name: string): Promise<OnlineResult> {
  await sessionReady;
  const session = online.session;
  if (!session) return { ok: false, error: 'Sign in first.' };
  if (!device?.deviceId) return { ok: false, error: 'This phone could not be registered. Check the connection and try again.' };
  const sb = supabase();
  const { data: dorm, error } = await sb.rpc('create_dorm', { p_name: name });
  if (error || !dorm) return { ok: false, error: error?.message ?? 'Could not create the dorm.' };
  const dormId = dorm.id as string;
  const key = await generateDormKey();
  const wrapped = await wrapDormKey(key, device.privateKey, device.publicJwk, aad(dormId, 1));
  const { error: gerr } = await sb.from('key_grants').insert({ dorm_id: dormId, device_id: device.deviceId, key_version: 1, wrapped_key: wrapped, granter_device_id: device.deviceId });
  if (gerr) return { ok: false, error: gerr.message };
  keys = { dormId, keys: { 1: key } };
  await saveKeys();
  // Link this account to the dean entry on this device, or create one.
  const state = getState();
  const unlinkedDean = state.staff.find((s) => s.role === 'dean' && s.active && !s.authUserId);
  if (state.setupComplete) {
    actions.linkStaff({ authUserId: session.user.id, name: unlinkedDean?.name ?? online.displayName, email: session.user.email ?? undefined, role: 'dean', floorIds: [], staffId: unlinkedDean?.id });
  }
  meta = { dormId, lastSeq: 0, lastSnapshotSeq: 0, pending: [], confirmedState: getState() };
  await set(META_KEY, meta);
  await refreshMembership();
  await uploadSnapshot();
  return { ok: true };
}

// ---------- dean tools ----------

export interface PendingRequest {
  userId: string;
  name: string;
  requestedAt: string;
  devices: { id: string; name: string; fingerprint: string }[];
}

export async function listPending(): Promise<PendingRequest[]> {
  const dormId = online.dorm?.id;
  if (!dormId) return [];
  const sb = supabase();
  const { data: rows } = await sb.from('memberships').select('user_id, requested_at').eq('dorm_id', dormId).eq('status', 'pending').order('requested_at');
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.user_id as string);
  const [{ data: profiles }, { data: devices }] = await Promise.all([
    sb.from('profiles').select('id, display_name').in('id', ids),
    sb.from('devices').select('id, user_id, name, public_key').in('user_id', ids),
  ]);
  return Promise.all(
    rows.map(async (r) => ({
      userId: r.user_id as string,
      name: (profiles ?? []).find((p) => p.id === r.user_id)?.display_name ?? 'Unknown',
      requestedAt: r.requested_at as string,
      devices: await Promise.all((devices ?? []).filter((d) => d.user_id === r.user_id).map(async (d) => ({ id: d.id as string, name: d.name as string, fingerprint: await fingerprint(d.public_key as JsonWebKey) }))),
    })),
  );
}

async function refreshPendingCount() {
  const dormId = online.dorm?.id;
  if (!dormId) return;
  const { count } = await supabase().from('memberships').select('user_id', { count: 'exact', head: true }).eq('dorm_id', dormId).eq('status', 'pending');
  setOnline({ pendingRequests: count ?? 0 });
}

async function grantToDevices(dormId: string, version: number, deviceIds: string[]): Promise<string | null> {
  if (!device?.deviceId) return 'This device is not registered.';
  const rec = await loadKeys(dormId);
  const key = rec.keys[version];
  if (!key) return 'This device does not hold the dorm key.';
  const sb = supabase();
  const { data: targets } = await sb.from('devices').select('id, public_key').in('id', deviceIds);
  for (const t of targets ?? []) {
    const wrapped = await wrapDormKey(key, device.privateKey, t.public_key as JsonWebKey, aad(dormId, version));
    const { error } = await sb.from('key_grants').upsert({ dorm_id: dormId, device_id: t.id, key_version: version, wrapped_key: wrapped, granter_device_id: device.deviceId }, { onConflict: 'dorm_id,device_id,key_version' });
    if (error) return error.message;
  }
  return null;
}

export async function approveRequest(userId: string, role: Role, floorIds: string[], actor: StaffUser): Promise<OnlineResult> {
  const dorm = online.dorm;
  if (!dorm) return { ok: false, error: 'No dorm.' };
  const sb = supabase();
  const { data: devices } = await sb.from('devices').select('id').eq('user_id', userId);
  const err = await grantToDevices(dorm.id, dorm.keyVersion, (devices ?? []).map((d) => d.id as string));
  if (err) return { ok: false, error: err };
  const { error } = await sb.from('memberships').update({ status: 'active', role, decided_by: online.session?.user.id, decided_at: new Date().toISOString() }).eq('dorm_id', dorm.id).eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  const { data: profile } = await sb.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  actions.linkStaff({ authUserId: userId, name: profile?.display_name ?? 'New staff', role, floorIds }, actor);
  await refreshPendingCount();
  return { ok: true };
}

export async function declineRequest(userId: string): Promise<OnlineResult> {
  const dorm = online.dorm;
  if (!dorm) return { ok: false, error: 'No dorm.' };
  const { error } = await supabase().from('memberships').delete().eq('dorm_id', dorm.id).eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  await refreshPendingCount();
  return { ok: true };
}

export interface MemberDevice {
  userId: string;
  name: string;
  role: Role;
  devices: { id: string; name: string; fingerprint: string; hasKey: boolean; lastSeen: string }[];
}

/** Active members and whether each of their devices holds the current key. */
export async function listMembers(): Promise<MemberDevice[]> {
  const dorm = online.dorm;
  if (!dorm) return [];
  const sb = supabase();
  const { data: rows } = await sb.from('memberships').select('user_id, role').eq('dorm_id', dorm.id).eq('status', 'active');
  if (!rows?.length) return [];
  const ids = rows.map((r) => r.user_id as string);
  const [{ data: profiles }, { data: devices }, { data: grants }] = await Promise.all([
    sb.from('profiles').select('id, display_name').in('id', ids),
    sb.from('devices').select('id, user_id, name, public_key, last_seen').in('user_id', ids),
    sb.from('key_grants').select('device_id').eq('dorm_id', dorm.id).eq('key_version', dorm.keyVersion),
  ]);
  const granted = new Set((grants ?? []).map((g) => g.device_id as string));
  return Promise.all(
    rows.map(async (r) => ({
      userId: r.user_id as string,
      name: (profiles ?? []).find((p) => p.id === r.user_id)?.display_name ?? 'Unknown',
      role: r.role as Role,
      devices: await Promise.all(
        (devices ?? [])
          .filter((d) => d.user_id === r.user_id)
          .map(async (d) => ({ id: d.id as string, name: d.name as string, fingerprint: await fingerprint(d.public_key as JsonWebKey), hasKey: granted.has(d.id as string), lastSeen: d.last_seen as string })),
      ),
    })),
  );
}

export async function grantDevice(deviceId: string): Promise<OnlineResult> {
  const dorm = online.dorm;
  if (!dorm) return { ok: false, error: 'No dorm.' };
  const err = await grantToDevices(dorm.id, dorm.keyVersion, [deviceId]);
  return err ? { ok: false, error: err } : { ok: true };
}

/** Remove a member: they lose access, the dorm key is rotated, and remaining devices get the new key. */
export async function revokeMember(userId: string, actor: StaffUser): Promise<OnlineResult> {
  const dorm = online.dorm;
  if (!dorm) return { ok: false, error: 'No dorm.' };
  const sb = supabase();
  const { error } = await sb.from('memberships').update({ status: 'revoked', decided_by: online.session?.user.id, decided_at: new Date().toISOString() }).eq('dorm_id', dorm.id).eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  const { data: theirDevices } = await sb.from('devices').select('id').eq('user_id', userId);
  if (theirDevices?.length) await sb.from('key_grants').delete().eq('dorm_id', dorm.id).in('device_id', theirDevices.map((d) => d.id as string));
  const staff = getState().staff.find((s) => s.authUserId === userId);
  if (staff) actions.updateStaff(staff.id, { active: false }, actor);
  return rotateKey();
}

/** New dorm key for everyone still in: old ciphertext stays readable to old key holders, new changes do not. */
export async function rotateKey(): Promise<OnlineResult> {
  const dorm = online.dorm;
  if (!dorm || !device?.deviceId) return { ok: false, error: 'No dorm.' };
  await syncNow();
  const sb = supabase();
  const version = dorm.keyVersion + 1;
  const key = await generateDormKey();
  const rec = await loadKeys(dorm.id);
  rec.keys[version] = key;
  await saveKeys();
  const { data: members } = await sb.from('memberships').select('user_id').eq('dorm_id', dorm.id).eq('status', 'active');
  const { data: devices } = await sb.from('devices').select('id').in('user_id', (members ?? []).map((m) => m.user_id as string));
  const err = await grantToDevices(dorm.id, version, (devices ?? []).map((d) => d.id as string));
  if (err) return { ok: false, error: err };
  const { error } = await sb.from('dorms').update({ key_version: version }).eq('id', dorm.id);
  if (error) return { ok: false, error: error.message };
  setOnline({ dorm: { ...dorm, keyVersion: version } });
  await uploadSnapshot();
  return { ok: true };
}

export async function regenerateJoinCode(): Promise<OnlineResult> {
  const dorm = online.dorm;
  if (!dorm) return { ok: false, error: 'No dorm.' };
  const { data, error } = await supabase().rpc('regenerate_join_code', { p_dorm: dorm.id });
  if (error) return { ok: false, error: error.message };
  setOnline({ dorm: { ...dorm, joinCode: data as string } });
  return { ok: true };
}

// ---------- sync engine ----------

async function loadMeta(dormId: string): Promise<SyncMeta> {
  if (meta && meta.dormId === dormId) return meta;
  const saved = (await get(META_KEY)) as SyncMeta | undefined;
  meta = saved && saved.dormId === dormId ? saved : { dormId, lastSeq: 0, lastSnapshotSeq: 0, pending: [], confirmedState: null };
  return meta;
}

async function saveMeta() {
  if (meta) await set(META_KEY, meta);
  setSync({ pendingCount: meta?.pending.length ?? 0 });
}

async function startSync(dormId: string) {
  await loadMeta(dormId);
  setRecorder((event) => {
    if (!meta) return;
    meta.pending.push({ event, sent: false });
    void saveMeta();
    void syncNow();
  });
  if (!channels.length) {
    const sb = supabase();
    channels = [
      sb.channel(`events:${dormId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `dorm_id=eq.${dormId}` }, () => void syncNow()).subscribe(),
      sb.channel(`membership:${dormId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'memberships', filter: `dorm_id=eq.${dormId}` }, () => void refreshMembership()).subscribe(),
      sb.channel(`grants:${dormId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'key_grants', filter: `dorm_id=eq.${dormId}` }, () => void refreshMembership()).subscribe(),
    ];
  }
  if (!pollTimer) pollTimer = setInterval(() => void syncNow(), 20_000);
  if (!meta?.confirmedState && !loadingInitial) {
    loadingInitial = true;
    try {
      await initialLoad();
    } finally {
      loadingInitial = false;
    }
  }
  await syncNow();
}

function stopSync() {
  setRecorder(null);
  channels.forEach((c) => void supabase().removeChannel(c));
  channels = [];
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/** First load on a device: the latest snapshot, then everything after it. */
async function initialLoad() {
  if (!meta) return;
  const sb = supabase();
  const { data: snap } = await sb.from('snapshots').select('key_version, upto_seq, payload').eq('dorm_id', meta.dormId).order('upto_seq', { ascending: false }).limit(1).maybeSingle();
  if (snap) {
    if (!(await ensureKey(meta.dormId, snap.key_version as number))) {
      setSync({ error: 'Waiting for a dean to approve this device.' });
      return;
    }
    const rec = await loadKeys(meta.dormId);
    try {
      const body = await decryptJson<{ state: AppState }>(rec.keys[snap.key_version as number], snap.payload as string, aad(meta.dormId, snap.key_version as number));
      meta.confirmedState = body.state;
      meta.lastSeq = Number(snap.upto_seq);
      meta.lastSnapshotSeq = Number(snap.upto_seq);
    } catch (err) {
      console.warn('Could not read snapshot', err);
      setSync({ error: 'Could not read the dorm data with this device\'s key.' });
      return;
    }
  } else {
    meta.confirmedState = getState();
  }
  replaceState(meta.confirmedState);
  for (const p of meta.pending) applyEvent(p.event);
  await saveMeta();
}

let syncing = false;
let again = false;

/** Push what this device has, then pull what others sent. Safe to call often. */
export async function syncNow(): Promise<void> {
  if (!meta || !online.hasKey || !navigator.onLine) return;
  if (syncing) {
    again = true;
    return;
  }
  syncing = true;
  setSync({ busy: true });
  try {
    await push();
    await pull();
    setSync({ lastSyncAt: new Date().toISOString(), error: null });
    await maybeSnapshot();
    if (online.membership?.role === 'dean') await refreshPendingCount();
  } catch (err) {
    setSync({ error: (err as Error).message || 'Sync failed' });
  } finally {
    syncing = false;
    setSync({ busy: false });
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

async function push() {
  if (!meta || !device?.deviceId || !online.dorm) return;
  const rec = await loadKeys(meta.dormId);
  const version = online.dorm.keyVersion;
  const key = rec.keys[version];
  if (!key) return;
  const sb = supabase();
  for (const p of meta.pending) {
    if (p.sent) continue;
    const payload = await encryptJson(key, p.event, aad(meta.dormId, version));
    const { error } = await sb.from('events').insert({ dorm_id: meta.dormId, key_version: version, author_device: device.deviceId, client_id: p.event.seed, payload });
    if (error && error.code !== '23505') throw new Error(error.message);
    p.sent = true;
  }
  await saveMeta();
}

async function pull() {
  if (!meta) return;
  const sb = supabase();
  const rec = await loadKeys(meta.dormId);
  for (;;) {
    const { data: rows, error } = await sb.from('events').select('seq, key_version, client_id, payload').eq('dorm_id', meta.dormId).gt('seq', meta.lastSeq).order('seq').limit(500);
    if (error) throw new Error(error.message);
    if (!rows?.length) return;
    const confirmed: StoreEvent[] = [];
    for (const row of rows) {
      const mine = meta.pending.findIndex((p) => p.event.seed === row.client_id);
      if (mine >= 0) {
        confirmed.push(meta.pending[mine].event);
        meta.pending.splice(mine, 1);
      } else {
        const version = row.key_version as number;
        if (!rec.keys[version] && !(await ensureKey(meta.dormId, version))) {
          setSync({ error: 'Waiting for the new dorm key from a dean.' });
          break;
        }
        try {
          confirmed.push(await decryptJson<StoreEvent>(rec.keys[version], row.payload as string, aad(meta.dormId, version)));
        } catch (err) {
          console.warn('Skipping an event this device cannot read', err);
        }
      }
      meta.lastSeq = Number(row.seq);
    }
    meta.confirmedState = rebase(meta.confirmedState ?? initialState(), confirmed, meta.pending.map((p) => p.event));
    await saveMeta();
    if (rows.length < 500) return;
  }
}

async function maybeSnapshot() {
  if (!meta || online.membership?.role !== 'dean') return;
  if (meta.lastSeq - meta.lastSnapshotSeq >= 150 && meta.pending.length === 0) await uploadSnapshot();
}

async function uploadSnapshot(): Promise<void> {
  if (!meta || !online.dorm || !meta.confirmedState) return;
  const rec = await loadKeys(meta.dormId);
  const version = online.dorm.keyVersion;
  const key = rec.keys[version];
  if (!key) return;
  const payload = await encryptJson(key, { state: meta.confirmedState }, aad(meta.dormId, version));
  const { error } = await supabase().from('snapshots').insert({ dorm_id: meta.dormId, key_version: version, upto_seq: meta.lastSeq, payload });
  if (!error) {
    meta.lastSnapshotSeq = meta.lastSeq;
    await saveMeta();
  }
}

/** Dean restored a backup on this device: make it the new truth for everyone. */
export async function publishLocalStateAsSnapshot(): Promise<OnlineResult> {
  if (!meta || online.membership?.role !== 'dean') return { ok: false, error: 'Deans only, and only when sync is on.' };
  await syncNow();
  meta.confirmedState = getState();
  meta.pending = [];
  await uploadSnapshot();
  return { ok: true };
}
