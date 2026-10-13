// Pieces shared by the real module (`index.ts`) and the Jest mock (`mock.ts`). Deliberately free of
// native-module and `@noble/curves` imports, so the mock can use them without either.
import type { SecureEnclaveErrorReason } from './ExpoSecureEnclave.types';

export const DEFAULT_ALIAS = 'default';

/**
 * The only error this package rejects with. `reason` is always one of the four
 * `SecureEnclaveErrorReason` values, with the same meaning on iOS, Android, and web. `message` carries
 * the platform's own detail, for logging; branch on `reason`, never on `message`.
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

export function toBytes(message: string | Uint8Array): Uint8Array {
  return typeof message === 'string' ? new TextEncoder().encode(message) : message;
}

// Standard base64 (RFC 4648), written by hand rather than relying on the global `btoa`/`atob`:
// Hermes doesn't reliably provide them in a React Native app without an extra polyfill, and this
// package shouldn't require one just to move bytes across the native bridge.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(bytes: Uint8Array): string {
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

export function decodeBase64(base64: string): Uint8Array {
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
