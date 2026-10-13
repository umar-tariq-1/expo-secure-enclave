import * as real from '../index';
import * as mock from '../mock';
import { VECTORS } from './vectors';

const { mockControls } = mock;

beforeEach(() => mockControls.reset());

it('exports exactly the real API, plus mockControls', () => {
  const realExports = Object.keys(real).sort();
  const mockExports = Object.keys(mock)
    .filter((name) => name !== 'mockControls')
    .sort();
  expect(mockExports).toEqual(realExports);
});

it('produces keys and signatures in the real wire formats', async () => {
  const publicKey = await mock.getOrCreatePublicKey();
  const signature = await mock.sign('payload');
  expect(Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0))).toHaveLength(65);
  // The real verify() (noble) and the mock's (node:crypto) agree in both directions.
  expect(real.verify(publicKey, 'payload', signature)).toBe(true);
  expect(mock.verify(publicKey, 'payload', signature)).toBe(true);
  expect(mock.verify(VECTORS.publicKey, VECTORS.message, VECTORS.sigHighS)).toBe(true);
  expect(mock.verify(VECTORS.publicKey, VECTORS.message, VECTORS.sigOtherMessage)).toBe(false);
  expect(mock.verify('garbage', 'payload', signature)).toBe(false);
});

it('returns the same key for an alias and different keys for different aliases', async () => {
  const a = await mock.getOrCreatePublicKey('a');
  expect(await mock.getOrCreatePublicKey('a')).toBe(a);
  expect(await mock.getOrCreatePublicKey('b')).not.toBe(a);
  expect(await mock.hasKey('a')).toBe(true);
  await mock.deleteKey('a');
  expect(await mock.hasKey('a')).toBe(false);
  await expect(mock.deleteKey('never-existed')).resolves.toBeUndefined();
});

it('rejects signing without a key as key_invalidated', async () => {
  await expect(mock.sign('x')).rejects.toMatchObject({ reason: 'key_invalidated' });
});

it('fails the next prompt with a queued reason, once', async () => {
  await mock.getOrCreatePublicKey();
  mockControls.failNextSign('cancelled');
  const error = await mock.sign('x').catch((e) => e);
  expect(error).toBeInstanceOf(mock.SecureEnclaveError);
  expect(error.reason).toBe('cancelled');
  await expect(mock.sign('x')).resolves.toEqual(expect.any(String));
});

it('behaves like a device with no usable biometric when unavailable', async () => {
  const existing = await mock.getOrCreatePublicKey('existing');
  mockControls.setAvailable(false);
  await expect(mock.isAvailable()).resolves.toBe(false);
  await expect(mock.getOrCreatePublicKey('existing')).resolves.toBe(existing);
  await expect(mock.getOrCreatePublicKey('new')).rejects.toMatchObject({ reason: 'unavailable' });
  await expect(mock.sign('x', 'existing')).rejects.toMatchObject({ reason: 'unavailable' });
});

it('models biometric invalidation: key still exists, cannot sign until replaced', async () => {
  const old = await mock.getOrCreatePublicKey();
  mockControls.invalidateKeys();
  expect(await mock.hasKey()).toBe(true);
  expect(await mock.getOrCreatePublicKey()).toBe(old);
  await expect(mock.sign('x')).rejects.toMatchObject({ reason: 'key_invalidated' });
  await mock.deleteKey();
  const fresh = await mock.getOrCreatePublicKey();
  expect(fresh).not.toBe(old);
  await expect(mock.sign('x')).resolves.toEqual(expect.any(String));
});
