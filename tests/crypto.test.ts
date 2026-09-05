// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, exportDormKey, fingerprint, generateDeviceKeyPair, generateDormKey, importDormKey, unwrapDormKey, wrapDormKey } from '../src/lib/crypto';

describe('crypto', () => {
  it('seals a dorm key to a device and opens it on the other side', async () => {
    const dean = await generateDeviceKeyPair();
    const ra = await generateDeviceKeyPair();
    const dormKey = await generateDormKey();
    const wrapped = await wrapDormKey(dormKey, dean.privateKey, ra.publicJwk, 'dorm-1:1');
    const opened = await unwrapDormKey(wrapped, ra.privateKey, dean.publicJwk, 'dorm-1:1', true);
    expect(await exportDormKey(opened)).toBe(await exportDormKey(dormKey));
  });

  it('refuses to open a key sealed for someone else or under another label', async () => {
    const dean = await generateDeviceKeyPair();
    const ra = await generateDeviceKeyPair();
    const stranger = await generateDeviceKeyPair();
    const dormKey = await generateDormKey();
    const wrapped = await wrapDormKey(dormKey, dean.privateKey, ra.publicJwk, 'dorm-1:1');
    await expect(unwrapDormKey(wrapped, stranger.privateKey, dean.publicJwk, 'dorm-1:1')).rejects.toBeTruthy();
    await expect(unwrapDormKey(wrapped, ra.privateKey, dean.publicJwk, 'dorm-1:2')).rejects.toBeTruthy();
  });

  it('round-trips data and detects tampering', async () => {
    const key = await importDormKey(await exportDormKey(await generateDormKey()));
    const payload = await encryptJson(key, { name: 'Daniel Achebe', status: 'P' }, 'dorm-1:1');
    expect(payload.startsWith('v1.')).toBe(true);
    expect(payload).not.toContain('Daniel');
    expect(await decryptJson(key, payload, 'dorm-1:1')).toEqual({ name: 'Daniel Achebe', status: 'P' });
    const tampered = payload.slice(0, -4) + 'AAAA';
    await expect(decryptJson(key, tampered, 'dorm-1:1')).rejects.toBeTruthy();
  });

  it('fingerprints public keys with 64 bits, so they cannot be ground out', async () => {
    const a = await generateDeviceKeyPair();
    const b = await generateDeviceKeyPair();
    const fp = await fingerprint(a.publicJwk);
    expect(fp).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
    expect(await fingerprint(a.publicJwk)).toBe(fp);
    expect(await fingerprint(b.publicJwk)).not.toBe(fp);
  });

  it('opens a key non-extractable unless the holder must pass it on', async () => {
    const dean = await generateDeviceKeyPair();
    const ra = await generateDeviceKeyPair();
    const dormKey = await generateDormKey();
    const wrapped = await wrapDormKey(dormKey, dean.privateKey, ra.publicJwk, 'dorm-1:1');

    const raKey = await unwrapDormKey(wrapped, ra.privateKey, dean.publicJwk, 'dorm-1:1');
    expect(raKey.extractable).toBe(false);
    await expect(exportDormKey(raKey)).rejects.toBeTruthy();
    // It still decrypts; it just cannot be read back out of the browser.
    expect(await decryptJson(raKey, await encryptJson(dormKey, { ok: 1 }, 'a'), 'a')).toEqual({ ok: 1 });

    const deanKey = await unwrapDormKey(wrapped, ra.privateKey, dean.publicJwk, 'dorm-1:1', true);
    expect(deanKey.extractable).toBe(true);
  });
});
