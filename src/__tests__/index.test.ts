import { VECTORS } from './vectors';

type NativeMock = Record<string, jest.Mock>;

function nativeError(code: string, message = code): Error {
  return Object.assign(new Error(message), { code });
}

// Loads `src/index.ts` against a fake native module (or none, as in Expo Go).
function load(native: NativeMock | null): typeof import('../index') {
  let api: typeof import('../index') | undefined;
  jest.isolateModules(() => {
    jest.doMock('../ExpoSecureEnclaveModule', () => ({ __esModule: true, default: native }));
    api = require('../index');
  });
  return api!;
}

function fakeNative(overrides: Partial<NativeMock> = {}): NativeMock {
  return {
    isAvailable: jest.fn(async () => true),
    hasKey: jest.fn(async () => true),
    getOrCreatePublicKey: jest.fn(async () => VECTORS.publicKey),
    sign: jest.fn(async () => VECTORS.sigLowS),
    deleteKey: jest.fn(async () => {}),
    ...overrides,
  };
}

describe('sign() error classification', () => {
  it.each([
    ['E_CANCELLED', 'cancelled'],
    ['E_BIOMETRIC_FAILED', 'biometric_failed'],
    ['E_KEY_INVALIDATED', 'key_invalidated'],
    ['E_UNAVAILABLE', 'unavailable'],
    ['ERR_SOMETHING_UNKNOWN', 'biometric_failed'],
  ])('maps native %s to %s', async (code, reason) => {
    const api = load(fakeNative({ sign: jest.fn(async () => Promise.reject(nativeError(code))) }));
    const error = await api.sign('hi').catch((e) => e);
    expect(error).toBeInstanceOf(api.SecureEnclaveError);
    expect(error.reason).toBe(reason);
    expect(error.message).toBe(code);
  });

  it('maps a code-less failure to biometric_failed', async () => {
    // eslint-disable-next-line prefer-promise-reject-errors -- a native bridge can reject with anything
    const api = load(fakeNative({ sign: jest.fn(async () => Promise.reject('boom')) }));
    await expect(api.sign('hi')).rejects.toMatchObject({ reason: 'biometric_failed' });
  });

  it('passes UTF-8 bytes of a string, base64-encoded, to the native module', async () => {
    const native = fakeNative();
    const api = load(native);
    await api.sign('héllo', 'work');
    expect(native.sign).toHaveBeenCalledWith('work', 'aMOpbGxv');
  });
});

describe('non-signing calls only ever reject with unavailable', () => {
  const codes = ['E_CANCELLED', 'E_BIOMETRIC_FAILED', 'E_KEY_INVALIDATED', 'E_UNAVAILABLE', 'X'];
  it.each(codes)('isAvailable, hasKey, getOrCreatePublicKey, deleteKey given %s', async (code) => {
    const fail = jest.fn(async () => Promise.reject(nativeError(code)));
    const api = load(
      fakeNative({ isAvailable: fail, hasKey: fail, getOrCreatePublicKey: fail, deleteKey: fail })
    );
    for (const call of [
      () => api.isAvailable(),
      () => api.hasKey(),
      () => api.getOrCreatePublicKey(),
      () => api.deleteKey(),
    ]) {
      const error = await call().catch((e) => e);
      expect(error).toBeInstanceOf(api.SecureEnclaveError);
      expect(error.reason).toBe('unavailable');
    }
  });
});

describe('without the native module (Expo Go, stale build)', () => {
  const api = load(null);

  it('reports nothing available instead of throwing at import', async () => {
    await expect(api.isAvailable()).resolves.toBe(false);
    await expect(api.hasKey()).resolves.toBe(false);
    await expect(api.deleteKey()).resolves.toBeUndefined();
  });

  it('rejects key creation and signing as unavailable', async () => {
    await expect(api.getOrCreatePublicKey()).rejects.toMatchObject({ reason: 'unavailable' });
    await expect(api.sign('hi')).rejects.toMatchObject({ reason: 'unavailable' });
  });
});

describe('verify()', () => {
  const api = load(fakeNative());

  it('accepts both the low-S and high-S encoding of a valid signature', () => {
    expect(api.verify(VECTORS.publicKey, VECTORS.message, VECTORS.sigLowS)).toBe(true);
    expect(api.verify(VECTORS.publicKey, VECTORS.message, VECTORS.sigHighS)).toBe(true);
  });

  it('accepts the message as bytes too', () => {
    const bytes = new TextEncoder().encode(VECTORS.message);
    expect(api.verify(VECTORS.publicKey, bytes, VECTORS.sigLowS)).toBe(true);
  });

  it('rejects a signature over a different message', () => {
    expect(api.verify(VECTORS.publicKey, VECTORS.message, VECTORS.sigOtherMessage)).toBe(false);
  });

  it('returns false instead of throwing on malformed input', () => {
    expect(api.verify('not base64!', VECTORS.message, VECTORS.sigLowS)).toBe(false);
    expect(api.verify(VECTORS.publicKey, VECTORS.message, 'AAAA')).toBe(false);
  });
});
