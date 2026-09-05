/**
 * Handing a check to someone outside the dorm, for a night or a few.
 *
 * The person covering never becomes a member and never holds the dorm key. The RA's phone
 * seals a scoped roster — one floor, the dates covered, nothing else — under a fresh key K,
 * uploads that ciphertext, and shows a QR code carrying K in the URL *fragment*. Browsers do
 * not send fragments to servers, so K reaches the other phone by being looked at, and the
 * relay holds only ciphertext it cannot read.
 *
 * K is also sealed under the dorm key, so a dean's phone can read who claimed the code and
 * what they submitted without ever having scanned it.
 */
import { decryptJson, encryptJson, exportDormKey, importDormKey, randomBytes, toB64 } from './crypto';
import { supabase } from './online';
import type { AppState, Boy, Room, StatusType } from './types';

/** How long an unclaimed code stays scannable. It is shown face to face, so this is generous. */
export const CLAIM_WINDOW_SECONDS = 60;

/** Everything the person covering is given. Deliberately small: no history, no other floor. */
export interface HandoffPayload {
  v: 1;
  dormName: string;
  floorId: string;
  floorName: string;
  forRaId: string;
  forRaName: string;
  from: string;
  to: string;
  /** The checks to run each covered day, with the times they are due. */
  checks: { scheduleId: string; name: string; time: string; days: number[] }[];
  statusTypes: Pick<StatusType, 'id' | 'name' | 'code' | 'color' | 'countsAs' | 'requiresNote' | 'sortOrder' | 'isDefault'>[];
  /** Boys on that floor, room number flattened in — the coverer never sees the room graph. */
  boys: { id: string; name: string; grade: number; roomNumber: string }[];
}

export interface HandoffClaim {
  name: string;
  at: string;
}

/** One completed check handed back. Carries its own context so the dorm need not guess. */
export interface HandoffResult {
  v: 1;
  scheduleId: string;
  floorId: string;
  forRaId: string;
  forRaName: string;
  date: string;
  /** The coverer's typed name, repeated here so a result is readable on its own. */
  by: string;
  startedAt: string;
  submittedAt: string;
  entries: { boyId: string; statusId: string; note?: string }[];
}

const AAD = 'handoff:v1';

/** A fresh AES-GCM key used for exactly one handoff. */
async function newKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', randomBytes(32), 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export function handoffUrl(id: string, keyB64: string): string {
  const base = `${location.origin}${location.pathname}`;
  // Hash routing already, so the key rides in the query of the fragment and never leaves the browser.
  return `${base}#/cover/${id}?k=${encodeURIComponent(keyB64)}`;
}

export interface CreatedHandoff {
  id: string;
  url: string;
  expiresAt: string;
}

/** Build the scoped payload for one floor over a date range. */
export function buildPayload(
  state: Pick<AppState, 'settings' | 'floors' | 'rooms' | 'boys' | 'schedules' | 'statusTypes'>,
  floorId: string,
  from: string,
  to: string,
  forRaId: string,
  forRaName: string,
  scheduleIds: string[],
): HandoffPayload {
  const floor = state.floors.find((f) => f.id === floorId);
  const rooms = new Map<string, Room>(state.rooms.filter((r) => r.floorId === floorId).map((r) => [r.id, r]));
  const boys: HandoffPayload['boys'] = state.boys
    .filter((b: Boy) => b.active && b.roomId && rooms.has(b.roomId))
    .map((b) => ({
      id: b.id,
      name: `${b.preferredName?.trim() || b.firstName} ${b.lastName}`.trim(),
      grade: b.grade,
      roomNumber: rooms.get(b.roomId as string)?.number ?? '',
    }))
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  return {
    v: 1,
    dormName: state.settings.dormName,
    floorId,
    floorName: floor?.name ?? '',
    forRaId,
    forRaName,
    from,
    to,
    checks: state.schedules
      .filter((s) => s.active && scheduleIds.includes(s.id))
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((s) => ({ scheduleId: s.id, name: s.name, time: s.time, days: s.days })),
    // Dean notes and private fields are not in this shape at all, so they cannot leak by accident.
    statusTypes: state.statusTypes.map((s) => ({
      id: s.id, name: s.name, code: s.code, color: s.color,
      countsAs: s.countsAs, requiresNote: s.requiresNote, sortOrder: s.sortOrder, isDefault: s.isDefault,
    })),
    boys,
  };
}

/** Seal the payload, upload it, and return the URL to put in a QR code. */
export async function createHandoff(
  dormId: string,
  keyVersion: number,
  dormKey: CryptoKey,
  deviceId: string,
  payload: HandoffPayload,
): Promise<CreatedHandoff> {
  const k = await newKey();
  const kRaw = await exportDormKey(k);
  const sealed = await encryptJson(k, payload, AAD);
  const wrapped = await encryptJson(dormKey, { k: kRaw }, AAD);
  const expiresAt = new Date(Date.now() + CLAIM_WINDOW_SECONDS * 1000).toISOString();

  const { data, error } = await supabase()
    .from('handoffs')
    .insert({
      dorm_id: dormId,
      created_by_device: deviceId,
      key_version: keyVersion,
      payload: sealed,
      wrapped_key: wrapped,
      covers_from: payload.from,
      covers_to: payload.to,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, url: handoffUrl(data.id as string, kRaw), expiresAt };
}

/** Unwrap a handoff's one-time key using the dorm key, for a device that never scanned it. */
export async function unwrapHandoffKey(dormKey: CryptoKey, wrapped: string): Promise<CryptoKey> {
  const { k } = await decryptJson<{ k: string }>(dormKey, wrapped, AAD);
  return importDormKey(k, false);
}

// ---------- the covering person's side ----------

export interface OpenedHandoff {
  payload: HandoffPayload;
  token: string;
  from: string;
  to: string;
}

/**
 * A full name, because the person covering is not in the dorm and this is the only record of
 * who walked the floor. Two words minimum, letters and the punctuation names actually contain.
 */
export function validFullName(raw: string): boolean {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 80) return false;
  const parts = name.split(' ');
  if (parts.length < 2) return false;
  return parts.every((p) => p.length >= 2 && /^[\p{L}][\p{L}'’.-]*$/u.test(p));
}

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Claim a scanned code. Works once; the server settles races between two scanners. */
export async function claimHandoff(id: string, keyB64: string, name: string): Promise<OpenedHandoff> {
  const k = await importDormKey(keyB64, false);
  const claim = await encryptJson(k, { name, at: new Date().toISOString() } satisfies HandoffClaim, AAD);
  const { data, error } = await supabase().rpc('claim_handoff', { p_id: id, p_claim: claim });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('This code has already been used, or it has expired. Ask for a new one.');
  return {
    payload: await decryptJson<HandoffPayload>(k, row.payload as string, AAD),
    token: row.access_token as string,
    from: row.covers_from as string,
    to: row.covers_to as string,
  };
}

/** Re-open a cover already claimed on this phone, for the second or third night. */
export async function reopenHandoff(id: string, keyB64: string, token: string): Promise<OpenedHandoff> {
  const k = await importDormKey(keyB64, false);
  const { data, error } = await supabase().rpc('open_handoff', { p_id: id, p_token: token });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('This cover has ended.');
  return {
    payload: await decryptJson<HandoffPayload>(k, row.payload as string, AAD),
    token,
    from: row.covers_from as string,
    to: row.covers_to as string,
  };
}

export async function submitHandoffResult(id: string, keyB64: string, token: string, result: HandoffResult): Promise<void> {
  const k = await importDormKey(keyB64, false);
  const payload = await encryptJson(k, result, AAD);
  const { data, error } = await supabase().rpc('submit_handoff_result', { p_id: id, p_token: token, p_payload: payload });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error('That cover is no longer open. Tell the RA what you found.');
}

// ---------- the dorm's side ----------

export interface HandoffRow {
  id: string;
  keyVersion: number;
  wrappedKey: string;
  coversFrom: string;
  coversTo: string;
  expiresAt: string;
  claimedAt: string | null;
  claim: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export async function listHandoffs(dormId: string): Promise<HandoffRow[]> {
  const { data, error } = await supabase()
    .from('handoffs')
    .select('id, key_version, wrapped_key, covers_from, covers_to, expires_at, claimed_at, claim, revoked_at, created_at')
    .eq('dorm_id', dormId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    keyVersion: r.key_version as number,
    wrappedKey: r.wrapped_key as string,
    coversFrom: r.covers_from as string,
    coversTo: r.covers_to as string,
    expiresAt: r.expires_at as string,
    claimedAt: r.claimed_at as string | null,
    claim: r.claim as string | null,
    revokedAt: r.revoked_at as string | null,
    createdAt: r.created_at as string,
  }));
}

export async function revokeHandoff(id: string): Promise<void> {
  const { error } = await supabase().from('handoffs').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface ResultRow {
  id: number;
  handoffId: string;
  payload: string;
}

export async function listResults(dormId: string, afterId: number): Promise<ResultRow[]> {
  const { data, error } = await supabase()
    .from('handoff_results')
    .select('id, handoff_id, payload')
    .eq('dorm_id', dormId)
    .gt('id', afterId)
    .order('id')
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: Number(r.id), handoffId: r.handoff_id as string, payload: r.payload as string }));
}

export { AAD as HANDOFF_AAD, toB64 };
