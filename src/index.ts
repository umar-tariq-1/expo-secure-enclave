import { p256 } from '@noble/curves/nist.js';

import type { SecureEnclaveErrorReason } from './ExpoSecureEnclave.types';
import ExpoSecureEnclaveModule from './ExpoSecureEnclaveModule';

export type { SecureEnclaveErrorReason } from './ExpoSecureEnclave.types';

const DEFAULT_ALIAS = 'default';

/**
 * Thrown by `sign()`, `getOrCreatePublicKey()` and `deleteKey()`. `reason` is always one of the
 * four `SecureEnclaveErrorReason` values, classified the same way on both platforms.
 */
export class SecureEnclaveError extends Error {
  constructor(
    public readonly reason: SecureEnclaveErrorReason,
    message?: string
  ) {
    super(message ?? reason);
    this.name = 'SecureEnclaveError';
  }
}

function classifyError(error: unknown): SecureEnclaveError {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : undefined;
  switch (code) {
    case 'E_CANCELLED':
      return new SecureEnclaveError('cancelled', message);
    case 'E_KEY_INVALIDATED':
      return new SecureEnclaveError('key_invalidated', message);
    case 'E_UNAVAILABLE':
      return new SecureEnclaveError('unavailable', message);
    case 'E_BIOMETRIC_FAILED':
    default:
      return new SecureEnclaveError('biometric_failed', message);
  }
}

function toBytes(message: string | Uint8Array): Uint8Array {
  return typeof message === 'string' ? new TextEncoder().encode(message) : message;
}

// Standard base64 (RFC 4648), written by hand rather than relying on the global `btoa`/`atob`:
// Hermes doesn't reliably provide them in a React Native app without an extra polyfill, and this
// package shouldn't require one just to move bytes across the native bridge.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    result +=
      BASE64_ALPHABET[(chunk >> 18) & 63] +
      BASE64_ALPHABET[(chunk >> 12) & 63] +
      BASE64_ALPHABET[(chunk >> 6) & 63] +
      BASE64_ALPHABET[chunk & 63];
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i]! << 16;
    result += BASE64_ALPHABET[(chunk >> 18) & 63] + BASE64_ALPHABET[(chunk >> 12) & 63] + '==';
  } else if (remaining === 2) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    result +=
      BASE64_ALPHABET[(chunk >> 18) & 63] +
      BASE64_ALPHABET[(chunk >> 12) & 63] +
      BASE64_ALPHABET[(chunk >> 6) & 63] +
      '=';
  }
  return result;
}

const BASE64_DECODE_MAP: Record<string, number> = {};
for (let i = 0; i < BASE64_ALPHABET.length; i++) BASE64_DECODE_MAP[BASE64_ALPHABET[i]!] = i;

function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE64_DECODE_MAP[char];
    if (value === undefined) throw new Error(`invalid base64 character: ${char}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Whether hardware-backed signing is usable right now on this device: Secure Enclave / Keystore
 * hardware present, and a biometric enrolled. `false` in the Simulator (no Secure Enclave exists
 * there) and on web (no hardware key equivalent). Never prompts anything.
 */
export async function isAvailable(): Promise<boolean> {
  return ExpoSecureEnclaveModule.isAvailable();
}

/**
 * Whether a key already exists for `alias` on this device. Never prompts a biometric: checking a
 * key's existence, unlike using it, doesn't touch the private key material.
 */
export async function hasKey(alias: string = DEFAULT_ALIAS): Promise<boolean> {
  return ExpoSecureEnclaveModule.hasKey(alias);
}

/**
 * Returns `alias`'s public key (creating the key pair first if it doesn't exist yet), as a base64
 * X9.63 uncompressed point (`0x04 ‖ X(32) ‖ Y(32)`, 65 bytes), the standard encoding, the same on
 * both platforms. Never prompts a biometric, including on first creation: only `sign()` does.
 *
 * Call this once per alias, up front (e.g. at enrolment), and send the result to your backend to
 * store alongside whatever it uses to identify this device/key.
 */
export async function getOrCreatePublicKey(alias: string = DEFAULT_ALIAS): Promise<string> {
  try {
    return await ExpoSecureEnclaveModule.getOrCreatePublicKey(alias);
  } catch (error) {
    throw classifyError(error);
  }
}

/**
 * Signs `message` with `alias`'s private key, which never leaves the Secure Enclave (iOS) or
 * Keystore/StrongBox (Android). Always prompts a live biometric check first: there is no way to
 * call this without one, and no device-passcode fallback.
 *
 * `message` is either raw bytes, or a string (encoded as UTF-8): pass whatever your backend will
 * hash and verify against, exactly as-is; this function does not alter it. Returns a base64
 * DER-encoded (ASN.1 SEQUENCE of r, s) ECDSA/SHA-256 signature, verifiable with any standard P-256
 * library, see `verify()` for a ready-made one.
 *
 * Throws `SecureEnclaveError`. `reason: 'key_invalidated'` means the enrolled biometrics changed
 * (or no key ever existed); the old key is unusable, call `deleteKey()` then
 * `getOrCreatePublicKey()` to mint a replacement and re-enrol it with your backend.
 */
export async function sign(
  message: string | Uint8Array,
  alias: string = DEFAULT_ALIAS
): Promise<string> {
  try {
    return await ExpoSecureEnclaveModule.sign(alias, encodeBase64(toBytes(message)));
  } catch (error) {
    throw classifyError(error);
  }
}

/** Deletes `alias`'s key pair. Deleting an alias that doesn't exist is a no-op, not an error. */
export async function deleteKey(alias: string = DEFAULT_ALIAS): Promise<void> {
  try {
    await ExpoSecureEnclaveModule.deleteKey(alias);
  } catch (error) {
    throw classifyError(error);
  }
}

/**
 * Verifies a signature from `sign()` against the public key from `getOrCreatePublicKey()`. Pure
 * JS, no native call, no device required. Use it for local testing, or anywhere you need to check
 * a signature without a round trip to your backend.
 *
 * `lowS: false` is intentional: Apple's Security framework and Android's Keystore don't guarantee
 * a canonical low-S signature the way most JS ECDSA libraries default to expecting, and a
 * genuinely valid signature can carry either; accepting both here means this never spuriously
 * rejects a real native signature over a non-canonical (but still mathematically valid) `s` value.
 */
export function verify(
  publicKeyBase64: string,
  message: string | Uint8Array,
  signatureBase64: string
): boolean {
  try {
    return p256.verify(
      decodeBase64(signatureBase64),
      toBytes(message),
      decodeBase64(publicKeyBase64),
      {
        prehash: true,
        format: 'der',
        lowS: false,
      }
    );
  } catch {
    return false;
  }
}
