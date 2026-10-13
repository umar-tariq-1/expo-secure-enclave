/**
 * An in-memory stand-in for `expo-secure-enclave`, for Jest or any other test runner on Node. Same
 * exports, same signatures, same wire formats, and the same `SecureEnclaveError` reasons as the real
 * package, plus `mockControls` to put it into the states a real device can be in.
 *
 * Keys are ordinary software keys from Node's `crypto` module: they are NOT hardware-backed, and
 * this file must never run inside an app.
 *
 * @example
 * ```ts
 * // jest.setup.ts (or at the top of a test file)
 * jest.mock('expo-secure-enclave', () => require('expo-secure-enclave/mock'));
 *
 * // in a test
 * import * as SecureEnclave from 'expo-secure-enclave';
 * import { mockControls } from 'expo-secure-enclave/mock';
 *
 * beforeEach(() => mockControls.reset());
 *
 * it('handles a cancelled prompt', async () => {
 *   await SecureEnclave.getOrCreatePublicKey();
 *   mockControls.failNextSign('cancelled');
 *   await expect(SecureEnclave.sign('payload')).rejects.toMatchObject({ reason: 'cancelled' });
 * });
 * ```
 */
import type { SecureEnclaveErrorReason } from './ExpoSecureEnclave.types';
import { DEFAULT_ALIAS, SecureEnclaveError, decodeBase64, encodeBase64, toBytes } from './shared';

export { SecureEnclaveError } from './shared';
export type { SecureEnclaveErrorReason } from './ExpoSecureEnclave.types';

// Just the slice of Node's `crypto` module used below, typed locally so that Node's global types
// never leak into the React Native sources this file is compiled alongside.
type NodeKeyObject = { export(options: { type: 'spki'; format: 'der' }): Uint8Array };
type NodeCrypto = {
  generateKeyPairSync(
    type: 'ec',
    options: { namedCurve: 'P-256' }
  ): { privateKey: NodeKeyObject; publicKey: NodeKeyObject };
  createPublicKey(options: { key: Uint8Array; format: 'der'; type: 'spki' }): NodeKeyObject;
  sign(algorithm: 'sha256', data: Uint8Array, key: NodeKeyObject): Uint8Array;
  verify(algorithm: 'sha256', data: Uint8Array, key: NodeKeyObject, signature: Uint8Array): boolean;
};

// Required lazily, so that merely importing this file somewhere without Node doesn't throw.
function nodeCrypto(): NodeCrypto {
  return require('crypto');
}

// DER header that turns a raw 65-byte P-256 point into a SubjectPublicKeyInfo structure.
const P256_SPKI_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
  0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

type MockKey = { privateKey: NodeKeyObject; publicKey: string; invalidated: boolean };

const keys = new Map<string, MockKey>();
let available = true;
let queuedSignFailures: SecureEnclaveErrorReason[] = [];

/** Resolves whatever `mockControls.setAvailable()` last set (default `true`). */
export async function isAvailable(): Promise<boolean> {
  return available;
}

/** Whether `alias` has a key, including one `mockControls.invalidateKeys()` invalidated. */
export async function hasKey(alias: string = DEFAULT_ALIAS): Promise<boolean> {
  return keys.has(alias);
}

/**
 * Returns `alias`'s public key as a base64 X9.63 point, creating a fresh P-256 key pair first if
 * needed. As on a device, an existing (even invalidated) key's public key is returned without
 * checks, while creating one rejects `unavailable` when `mockControls.setAvailable(false)` is set.
 */
export async function getOrCreatePublicKey(alias: string = DEFAULT_ALIAS): Promise<string> {
  const existing = keys.get(alias);
  if (existing) return existing.publicKey;
  if (!available) {
    throw new SecureEnclaveError('unavailable', 'expo-secure-enclave/mock: unavailable');
  }
  const { privateKey, publicKey } = nodeCrypto().generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const key = {
    privateKey,
    publicKey: encodeBase64(spki.slice(spki.length - 65)),
    invalidated: false,
  };
  keys.set(alias, key);
  return key.publicKey;
}

/**
 * Signs like the real `sign()`: base64 DER ECDSA/SHA-256 over the UTF-8 bytes of a string, or over
 * the given bytes. Checks run in the device's order: availability (`unavailable`), then the key
 * (`key_invalidated`), then the "prompt", which consumes the next `mockControls.failNextSign()`
 * reason if one is queued.
 */
export async function sign(
  message: string | Uint8Array,
  alias: string = DEFAULT_ALIAS
): Promise<string> {
  if (!available) {
    throw new SecureEnclaveError('unavailable', 'expo-secure-enclave/mock: unavailable');
  }
  const key = keys.get(alias);
  if (!key || key.invalidated) {
    throw new SecureEnclaveError('key_invalidated', 'expo-secure-enclave/mock: key_invalidated');
  }
  const failure = queuedSignFailures.shift();
  if (failure) {
    throw new SecureEnclaveError(failure, `expo-secure-enclave/mock: ${failure}`);
  }
  return encodeBase64(nodeCrypto().sign('sha256', toBytes(message), key.privateKey));
}

/** Deletes `alias`'s key. Deleting a key that doesn't exist is a no-op, as on a device. */
export async function deleteKey(alias: string = DEFAULT_ALIAS): Promise<void> {
  keys.delete(alias);
}

/**
 * Verifies a signature the same way the real `verify()` does (both low-S and high-S accepted,
 * `false` rather than a throw for malformed input), so it also accepts real device signatures.
 */
export function verify(
  publicKeyBase64: string,
  message: string | Uint8Array,
  signatureBase64: string
): boolean {
  try {
    const crypto = nodeCrypto();
    const point = decodeBase64(publicKeyBase64);
    const spki = new Uint8Array(P256_SPKI_PREFIX.length + point.length);
    spki.set(P256_SPKI_PREFIX);
    spki.set(point, P256_SPKI_PREFIX.length);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    return crypto.verify('sha256', toBytes(message), publicKey, decodeBase64(signatureBase64));
  } catch {
    return false;
  }
}

/** Test-only controls. Not part of the real package's API. */
export const mockControls = {
  /**
   * What `isAvailable()` resolves. `false` behaves like a device with no usable biometric (none
   * enrolled, or locked out): creating a key and `sign()` reject `unavailable`, while existing keys
   * stay readable. Default `true`.
   */
  setAvailable(value: boolean): void {
    available = value;
  },

  /**
   * Makes the next `sign()` that reaches the prompt reject with `reason` instead of signing, e.g.
   * `'cancelled'` for a dismissed prompt or `'biometric_failed'` for an unrecognised face. Calls
   * queue up, one per future `sign()`.
   */
  failNextSign(reason: SecureEnclaveErrorReason): void {
    queuedSignFailures.push(reason);
  },

  /**
   * Simulates the OS invalidating keys after a biometric enrollment change, for one alias or for
   * all of them. As on a device, the key still "exists" (`hasKey()` is `true`, and
   * `getOrCreatePublicKey()` still returns the old public key) but `sign()` rejects
   * `key_invalidated` until the app calls `deleteKey()` and creates a new key.
   */
  invalidateKeys(alias?: string): void {
    for (const [keyAlias, key] of keys) {
      if (alias === undefined || alias === keyAlias) key.invalidated = true;
    }
  },

  /** Back to a clean slate: no keys, available, nothing queued. Call it in `beforeEach`. */
  reset(): void {
    keys.clear();
    available = true;
    queuedSignFailures = [];
  },
};
