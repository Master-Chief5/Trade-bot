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

describe('recovery code', () => {
  it('is 32 symbols from an alphabet that cannot be misread off paper', async () => {
    const { generateRecoveryCode, normalizeRecoveryCode, RECOVERY_ALPHABET } = await import('../src/lib/crypto');
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/);
      expect(code).not.toMatch(/[ILOU]/);
      const norm = normalizeRecoveryCode(code);
      expect(norm).toHaveLength(32);
      for (const ch of norm!) expect(RECOVERY_ALPHABET).toContain(ch);
      seen.add(norm!);
    }
    expect(seen.size).toBe(50);
  });

  it('forgives case, spacing and the letters that look like digits', async () => {
    const { normalizeRecoveryCode } = await import('../src/lib/crypto');
    const canonical = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    expect(normalizeRecoveryCode('o123 4567-89ab cdef ghjk mnpq rstv wxyz')).toBe(canonical);
    expect(normalizeRecoveryCode('O1234567 89ABCDEF GHJKMNPQ RSTVWXYZ'.replace('1', 'I').replace('1', 'L'))).toBe(canonical);
    expect(normalizeRecoveryCode(canonical.slice(0, 31))).toBeNull();
    expect(normalizeRecoveryCode(`${canonical}A`)).toBeNull();
    expect(normalizeRecoveryCode(canonical.replace('A', 'U'))).toBeNull();
  });

  it('seals the dorm key under the code and opens it only with the same code', async () => {
    const { generateRecoveryCode, normalizeRecoveryCode, recoveryKek, sealDormKey, openDormKey, toB64, randomBytes } = await import('../src/lib/crypto');
    const dormKey = await generateDormKey();
    const code = generateRecoveryCode();
    const salt = toB64(randomBytes(16));
    const kek = await recoveryKek(normalizeRecoveryCode(code)!, salt);
    expect(kek.extractable).toBe(false);
    const sealed = await sealDormKey(kek, dormKey, 'dorm-1:3:recovery');
    expect(sealed).not.toContain(await exportDormKey(dormKey));

    const opened = await openDormKey(kek, sealed, 'dorm-1:3:recovery', true);
    expect(await exportDormKey(opened)).toBe(await exportDormKey(dormKey));

    // Typed with different spacing and case, the same code still opens it.
    const retyped = await recoveryKek(normalizeRecoveryCode(code.toLowerCase().replace(/-/g, ' '))!, salt);
    expect(await exportDormKey(await openDormKey(retyped, sealed, 'dorm-1:3:recovery', true))).toBe(await exportDormKey(dormKey));

    const wrong = await recoveryKek(normalizeRecoveryCode(generateRecoveryCode())!, salt);
    await expect(openDormKey(wrong, sealed, 'dorm-1:3:recovery')).rejects.toBeTruthy();
    // A different salt, or the seal for another key version, does not open either.
    await expect(openDormKey(await recoveryKek(normalizeRecoveryCode(code)!, toB64(randomBytes(16))), sealed, 'dorm-1:3:recovery')).rejects.toBeTruthy();
    await expect(openDormKey(kek, sealed, 'dorm-1:4:recovery')).rejects.toBeTruthy();
  });
});
