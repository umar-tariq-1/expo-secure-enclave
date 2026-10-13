---
title: Recipes
nav_order: 4
description: "Complete client and server code for device binding, passwordless challenge-response sign-in, transaction approval, key invalidation and re-enrollment, fallbacks, and ES256 JWTs with expo-secure-enclave."
---

# Recipes

Each recipe has the app code and the matching server code. The server side is TypeScript for
Node.js using only `node:crypto`; the same checks work in any language (see
[Server-side verification](server-verification.md)). All of the code below is exercised end to end
in a test: the app code against the package's [Jest mock](testing.md), the server code against
real signatures.

## Shared pieces

### The app's request helper

The app snippets call your backend through a small JSON helper. Use your own client instead if you
have one.

<!-- file: api.ts -->
```ts
const API_URL = 'https://api.example.com';

export async function post<T>(path: string, body: unknown, sessionToken?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return (await response.json()) as T;
}
```

### Server: signature check and one-time challenges

Every flow below has the server issue a random challenge, the app sign it, and the server check
the signature. Challenges are single-use and expire, which stops replay. The challenge text
includes its purpose and subject, so a signature made to sign in can't be reused to approve a
payment, or for another user or device.

<!-- file: server.ts -->
```ts
import { createPublicKey, randomBytes, verify } from 'node:crypto';

// DER header that wraps a raw 65-byte P-256 point into a SubjectPublicKeyInfo (SPKI) structure.
const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');

/** Checks a `sign()` result. `message` is the exact string the app signed. */
export function verifySignature(publicKey: string, message: string, signature: string): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.concat([P256_SPKI_PREFIX, Buffer.from(publicKey, 'base64')]),
      format: 'der',
      type: 'spki',
    });
    return verify('sha256', Buffer.from(message, 'utf8'), key, Buffer.from(signature, 'base64'));
  } catch {
    return false; // malformed key or signature
  }
}

// In memory for illustration only: keep these in your database, with the same rules.
type Challenge = { value: string; purpose: string; subject: string; expiresAt: number };
const challenges = new Map<string, Challenge>();
export const devices = new Map<string, { userId: string; publicKey: string }>();

/** A random, single-use challenge that expires in two minutes. */
export function issueChallenge(purpose: string, subject: string) {
  const challengeId = randomBytes(16).toString('hex');
  const challenge = `${purpose}:${subject}:${randomBytes(32).toString('base64url')}`;
  challenges.set(challengeId, { value: challenge, purpose, subject, expiresAt: Date.now() + 120_000 });
  return { challengeId, challenge };
}

/** The challenge text, exactly once; `null` if unknown, expired, or issued for something else. */
export function consumeChallenge(challengeId: string, purpose: string, subject: string) {
  const entry = challenges.get(challengeId);
  challenges.delete(challengeId); // one attempt per challenge, whether it succeeds or not
  if (!entry || entry.purpose !== purpose || entry.subject !== subject) return null;
  return entry.expiresAt > Date.now() ? entry.value : null;
}
```

## Register a device

Device binding: tie this device's hardware key to a user who has already signed in some other way
(password, email link, passkey). Signing a server challenge during registration proves the device
really holds the private key behind the public key it sends.

App:

<!-- file: client.ts -->
```ts
import * as SecureEnclave from 'expo-secure-enclave';

import { post } from './api';

type ChallengeResponse = { challengeId: string; challenge: string };

/** Returns a `deviceId` to keep (it isn't secret), or `null` when this device can't do
 *  hardware-backed signing, in which case offer another method. */
export async function registerDevice(sessionToken: string): Promise<string | null> {
  if (!(await SecureEnclave.isAvailable())) return null;

  // 1. A one-time challenge from the server, tied to this user.
  const { challengeId, challenge } = await post<ChallengeResponse>(
    '/devices/challenge',
    {},
    sessionToken
  );

  // 2. No prompt: creates the key pair the first time, returns the same public key afterwards.
  const publicKey = await SecureEnclave.getOrCreatePublicKey();

  // 3. Prompts for Face ID / Touch ID / fingerprint, proving this device holds the private key.
  const signature = await SecureEnclave.sign(challenge);

  // 4. The server checks the signature against the submitted public key, then stores the key.
  const { deviceId } = await post<{ deviceId: string }>(
    '/devices',
    { challengeId, publicKey, signature },
    sessionToken
  );
  return deviceId;
}
```

`sign()` rejects with a [`SecureEnclaveError`](api.md#secureenclaveerror) if the user cancels or
the check fails; nothing is registered in that case.

Server:

<!-- file: server.ts -->
```ts
// POST /devices/challenge, for a user who is already signed in.
export function startDeviceRegistration(userId: string) {
  return issueChallenge('register-device', userId);
}

// POST /devices with { challengeId, publicKey, signature }
export function finishDeviceRegistration(
  userId: string,
  body: { challengeId: string; publicKey: string; signature: string }
) {
  const challenge = consumeChallenge(body.challengeId, 'register-device', userId);
  if (!challenge || !verifySignature(body.publicKey, challenge, body.signature)) {
    throw new Error('device registration rejected');
  }
  const deviceId = randomBytes(16).toString('hex');
  devices.set(deviceId, { userId, publicKey: body.publicKey });
  return { deviceId };
}
```

A user can have several devices; give each its own record, and let users see and revoke them.

## Passwordless sign-in

Challenge-response sign-in with nothing but the registered device and a biometric.

App:

<!-- file: client.ts -->
```ts
import * as SecureEnclave from 'expo-secure-enclave';

import { post } from './api';

export async function signInWithDevice(deviceId: string): Promise<{ userId: string }> {
  const { challengeId, challenge } = await post<{ challengeId: string; challenge: string }>(
    '/auth/challenge',
    { deviceId }
  );
  const signature = await SecureEnclave.sign(challenge); // prompts
  return post<{ userId: string }>('/auth/verify', { deviceId, challengeId, signature });
}
```

Server:

<!-- file: server.ts -->
```ts
// POST /auth/challenge with { deviceId }
export function startLogin(body: { deviceId: string }) {
  return issueChallenge('login', body.deviceId);
}

// POST /auth/verify with { deviceId, challengeId, signature }
export function finishLogin(body: { deviceId: string; challengeId: string; signature: string }) {
  const device = devices.get(body.deviceId);
  const challenge = consumeChallenge(body.challengeId, 'login', body.deviceId);
  if (!device || !challenge || !verifySignature(device.publicKey, challenge, body.signature)) {
    throw new Error('login rejected');
  }
  return { userId: device.userId }; // now create a session for this user
}
```

## Approve a transaction

Sign the exact request the user is looking at, so the server can prove they approved that
request and nothing else.

App:

<!-- file: client.ts -->
```ts
import * as SecureEnclave from 'expo-secure-enclave';

import { post } from './api';

type Transfer = { amount: string; currency: string; to: string };

export async function approveTransfer(deviceId: string, transfer: Transfer) {
  const { challengeId, challenge } = await post<{ challengeId: string; challenge: string }>(
    '/approvals/challenge',
    { deviceId }
  );
  // Build the signed text once and send that same string: re-serializing it on either side could
  // change key order or spacing, and the signature would no longer match.
  const payload = JSON.stringify({ type: 'transfer', ...transfer, challenge });
  const signature = await SecureEnclave.sign(payload); // prompts
  return post('/transfers', { deviceId, challengeId, payload, signature });
}
```

Show the user the amount and recipient in your UI before calling `sign()`: the system prompt itself
can't display them.

Server:

<!-- file: server.ts -->
```ts
// POST /approvals/challenge with { deviceId }
export function startApproval(body: { deviceId: string }) {
  return issueChallenge('approve', body.deviceId);
}

// POST /transfers with { deviceId, challengeId, payload, signature }
export function finishApproval(body: {
  deviceId: string;
  challengeId: string;
  payload: string;
  signature: string;
}) {
  const device = devices.get(body.deviceId);
  const challenge = consumeChallenge(body.challengeId, 'approve', body.deviceId);
  if (!device || !challenge || !verifySignature(device.publicKey, body.payload, body.signature)) {
    throw new Error('approval rejected');
  }
  // Parse only after verifying, and act on exactly what was signed, never on separate fields.
  const request = JSON.parse(body.payload);
  if (request.challenge !== challenge) throw new Error('approval rejected');
  return request as { type: string; amount: string; currency: string; to: string };
}
```

## Handle every outcome

Every `sign()` failure carries one of four reasons. This helper turns them into what the UI should
do, including replacing a key that a biometric change invalidated.

<!-- file: client.ts -->
```ts
import * as SecureEnclave from 'expo-secure-enclave';

type SignOutcome =
  | { status: 'signed'; signature: string }
  | { status: 'cancelled' }
  | { status: 'retry' }
  | { status: 'reenroll' }
  | { status: 'fallback' };

export async function signForUser(message: string): Promise<SignOutcome> {
  try {
    return { status: 'signed', signature: await SecureEnclave.sign(message) };
  } catch (error) {
    if (!(error instanceof SecureEnclave.SecureEnclaveError)) throw error;
    switch (error.reason) {
      case 'cancelled':
        return { status: 'cancelled' }; // the user backed out: show nothing
      case 'biometric_failed':
        return { status: 'retry' }; // not recognized: offer to try again
      case 'key_invalidated':
        // Fingerprints or Face ID changed (or the key is gone): this key can never sign again.
        await SecureEnclave.deleteKey();
        return { status: 'reenroll' }; // sign in another way, then registerDevice() again
      case 'unavailable':
        return { status: 'fallback' }; // no usable biometric right now: use another method
    }
  }
}
```

When the outcome is `reenroll`, the old key can't vouch for the new one, so treat it like adding a
new device: have the user authenticate another way first, then run
[Register a device](#register-a-device) again. On the server, remove the old device record
(its public key will never produce another valid signature anyway).

## Fall back when hardware isn't available

Check once to decide which sign-in method to offer, and still handle `unavailable` from `sign()`,
since the answer can change while the app runs (biometrics removed or locked out).

<!-- file: client.ts -->
```ts
import * as SecureEnclave from 'expo-secure-enclave';

export async function preferredSignInMethod(): Promise<'device' | 'password'> {
  const [available, registered] = await Promise.all([
    SecureEnclave.isAvailable(),
    SecureEnclave.hasKey(),
  ]);
  return available && registered ? 'device' : 'password';
}
```

`isAvailable()` resolves `false` in the iOS Simulator, in Expo Go, and on web, so the same code
runs everywhere without platform checks.

## Multiple keys

Use one alias per account when several accounts can be signed in on the same device. Each alias is
an independent key with its own public key and registration.

```ts
import * as SecureEnclave from 'expo-secure-enclave';

export async function signForAccount(accountId: string, challenge: string) {
  const alias = `account-${accountId}`;
  const publicKey = await SecureEnclave.getOrCreatePublicKey(alias); // register per account
  const signature = await SecureEnclave.sign(challenge, alias);
  return { publicKey, signature };
}
```

Delete an account's key with `deleteKey(alias)` when the user removes that account from the device.

## ES256 JWT signed by the device

Many backends already accept JWTs. A JWT's ES256 signature is the raw 64-byte `r ‖ s` form, not
DER, so convert the `sign()` result. These helpers avoid `Buffer` and `btoa`, which React Native
doesn't reliably provide.

App:

<!-- file: jwt.ts -->
```ts
import * as SecureEnclave from 'expo-secure-enclave';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(base64: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of base64.replace(/=+$/, '')) {
    buffer = (buffer << 6) | BASE64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [n >> 18, n >> 12, n >> 6, n].map((v) => BASE64[v & 63]);
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

// ES256 wants the signature as raw r || s (32 bytes each); sign() returns DER.
function derToJose(der: Uint8Array): Uint8Array {
  const raw = new Uint8Array(64);
  let offset = 2; // skip the SEQUENCE header: a P-256 signature is always shorter than 128 bytes
  for (const start of [0, 32]) {
    const length = der[offset + 1]!;
    let value = der.subarray(offset + 2, offset + 2 + length);
    offset += 2 + length;
    while (value.length > 32 && value[0] === 0) value = value.subarray(1); // drop DER sign padding
    raw.set(value, start + 32 - value.length);
  }
  return raw;
}

/** A short-lived ES256 JWT signed by this device's hardware key. Prompts a biometric. */
export async function createDeviceJwt(deviceId: string, claims: Record<string, unknown> = {}) {
  const encodeJson = (value: unknown) =>
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${encodeJson({ alg: 'ES256', typ: 'JWT', kid: deviceId })}.${encodeJson({
    iat: now,
    exp: now + 60,
    ...claims,
  })}`;
  const der = base64ToBytes(await SecureEnclave.sign(signingInput));
  return `${signingInput}.${base64UrlEncode(derToJose(der))}`;
}
```

Server, with [`jose`](https://github.com/panva/jose):

<!-- file: server-jwt.ts -->
```ts
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';

import { devices } from './server';

function publicKeyToJwk(publicKey: string) {
  const point = Buffer.from(publicKey, 'base64'); // 0x04 || X(32) || Y(32)
  return {
    kty: 'EC',
    crv: 'P-256',
    x: point.subarray(1, 33).toString('base64url'),
    y: point.subarray(33, 65).toString('base64url'),
  };
}

export async function verifyDeviceJwt(token: string) {
  const { kid } = decodeProtectedHeader(token);
  const device = devices.get(String(kid));
  if (!device) throw new Error('unknown device');
  const key = await importJWK(publicKeyToJwk(device.publicKey), 'ES256');
  const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'], maxTokenAge: '2m' });
  return payload;
}
```

A JWT can be replayed until it expires. Keep `exp` short, and for anything sensitive put a
server-issued challenge in the claims and consume it as in the other recipes.
