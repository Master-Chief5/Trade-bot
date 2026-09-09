/**
 * End-to-end encryption primitives, all WebCrypto.
 *
 * - Each device has an ECDH P-256 key pair. The private key is non-extractable and never leaves the device.
 * - Each dorm has an AES-GCM 256 dorm key. It is sealed ("wrapped") to a device by deriving a shared secret
 *   from the granter's private key and the device's public key, so only that device can open it.
 * - All dorm data is AES-GCM encrypted with the dorm key before it reaches the server.
 */

const subtle = () => {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error('This browser cannot do encryption. Use Safari, Chrome or Firefox.');
  return c;
};

const ECDH_PARAMS: EcKeyGenParams = { name: 'ECDH', namedCurve: 'P-256' };
const AES_LEN = 256;
const WRAP_INFO = new TextEncoder().encode('ryan-hall-room-check/key-wrap/v1');

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  globalThis.crypto.getRandomValues(out);
  return out;
}

export interface DeviceKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JsonWebKey;
}

export async function generateDeviceKeyPair(): Promise<DeviceKeyPair> {
  const pair = await subtle().generateKey(ECDH_PARAMS, false, ['deriveKey', 'deriveBits']);
  const publicJwk = await subtle().exportKey('jwk', pair.publicKey);
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, publicJwk };
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey('jwk', jwk, ECDH_PARAMS, true, []);
}

export async function generateDormKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: AES_LEN }, true, ['encrypt', 'decrypt']);
}

export async function exportDormKey(key: CryptoKey): Promise<string> {
  return toB64(await subtle().exportKey('raw', key));
}

export async function importDormKey(rawB64: string, extractable = true): Promise<CryptoKey> {
  return subtle().importKey('raw', fromB64(rawB64), { name: 'AES-GCM', length: AES_LEN }, extractable, ['encrypt', 'decrypt']);
}

/** Shared AES key between my private key and their public key (same result from either side). */
async function deriveWrapKey(myPrivate: CryptoKey, theirPublicJwk: JsonWebKey): Promise<CryptoKey> {
  const theirPublic = await importPublicKey(theirPublicJwk);
  const bits = await subtle().deriveBits({ name: 'ECDH', public: theirPublic }, myPrivate, 256);
  const hkdf = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: WRAP_INFO }, hkdf, { name: 'AES-GCM', length: AES_LEN }, false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, aad: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) }, key, plaintext);
  return `v1.${toB64(iv)}.${toB64(ct)}`;
}

async function aesDecrypt(key: CryptoKey, payload: string, aad: string): Promise<Uint8Array<ArrayBuffer>> {
  const [v, ivB64, ctB64] = payload.split('.');
  if (v !== 'v1' || !ivB64 || !ctB64) throw new Error('Unrecognised payload');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(ivB64), additionalData: new TextEncoder().encode(aad) }, key, fromB64(ctB64));
  return new Uint8Array(pt) as Uint8Array<ArrayBuffer>;
}

/** Seal the dorm key so that only the holder of `theirPublicJwk`'s private key can open it. */
export async function wrapDormKey(dormKey: CryptoKey, myPrivate: CryptoKey, theirPublicJwk: JsonWebKey, aad: string): Promise<string> {
  const wrapKey = await deriveWrapKey(myPrivate, theirPublicJwk);
  const raw = new Uint8Array(await subtle().exportKey('raw', dormKey)) as Uint8Array<ArrayBuffer>;
  return aesEncrypt(wrapKey, raw, aad);
}

/**
 * Open a sealed dorm key. `extractable` is true only on a dean's device, which must be able to
 * re-wrap the key for other devices; elsewhere the key cannot be read back out of the browser,
 * so a script injected into the page cannot exfiltrate it.
 */
export async function unwrapDormKey(wrapped: string, myPrivate: CryptoKey, granterPublicJwk: JsonWebKey, aad: string, extractable = false): Promise<CryptoKey> {
  const wrapKey = await deriveWrapKey(myPrivate, granterPublicJwk);
  const raw = await aesDecrypt(wrapKey, wrapped, aad);
  return subtle().importKey('raw', raw, { name: 'AES-GCM', length: AES_LEN }, extractable, ['encrypt', 'decrypt']);
}

export async function encryptJson(dormKey: CryptoKey, value: unknown, aad: string): Promise<string> {
  return aesEncrypt(dormKey, new TextEncoder().encode(JSON.stringify(value)) as Uint8Array<ArrayBuffer>, aad);
}

export async function decryptJson<T = unknown>(dormKey: CryptoKey, payload: string, aad: string): Promise<T> {
  const bytes = await aesDecrypt(dormKey, payload, aad);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/**
 * Short fingerprint of a public key, for a dean to compare against the RA's screen before
 * handing over the dorm key. 64 bits, so an attacker cannot grind out a key that displays
 * the same fingerprint as someone else's phone.
 */
export async function fingerprint(jwk: JsonWebKey): Promise<string> {
  const data = new TextEncoder().encode(`${jwk.x}.${jwk.y}`);
  const hash = new Uint8Array(await subtle().digest('SHA-256', data));
  const hex = Array.from(hash.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return (hex.match(/.{4}/g) ?? []).join(' ');
}

// ---------- recovery code ----------
//
// Every phone that holds the dorm key can be lost at once. When that happens the ciphertext
// on the server is unreadable forever, because the server was never able to read it. A
// recovery code is 160 random bits printed on paper and kept in a drawer: the dorm key is
// sealed under a key derived from it, and a dean signing in on a fresh phone types it in.

/** Crockford's base32: no I, L, O or U, so a code read off paper cannot be misread. */
export const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_LENGTH = 32;
const RECOVERY_ITERATIONS = 100_000;

export function formatRecoveryCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join('-');
}

/** 32 symbols of 5 bits each: 160 bits, from the CSPRNG. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(20);
  let acc = 0;
  let bits = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += RECOVERY_ALPHABET[(acc >> bits) & 31];
    }
  }
  return formatRecoveryCode(out);
}

/**
 * What someone typed, as the 32 canonical symbols, or null if it is not a complete code.
 * Case, spaces and dashes do not matter, and the letters the alphabet leaves out are read
 * as the digits they look like.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]+/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_CODE_LENGTH) return null;
  for (const ch of s) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  return s;
}

/** The key a recovery code unlocks. Never extractable: it exists only to seal and open the dorm key. */
export async function recoveryKek(code: string, saltB64: string): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations: RECOVERY_ITERATIONS },
    base,
    { name: 'AES-GCM', length: AES_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Seal the dorm key under any AES key, such as one derived from a recovery code. */
export async function sealDormKey(wrapKey: CryptoKey, dormKey: CryptoKey, aad: string): Promise<string> {
  const raw = new Uint8Array(await subtle().exportKey('raw', dormKey)) as Uint8Array<ArrayBuffer>;
  return aesEncrypt(wrapKey, raw, aad);
}

export async function openDormKey(wrapKey: CryptoKey, sealed: string, aad: string, extractable = false): Promise<CryptoKey> {
  const raw = await aesDecrypt(wrapKey, sealed, aad);
  return subtle().importKey('raw', raw, { name: 'AES-GCM', length: AES_LEN }, extractable, ['encrypt', 'decrypt']);
}
