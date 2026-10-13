# expo-secure-enclave

[![npm version](https://img.shields.io/npm/v/expo-secure-enclave.svg)](https://www.npmjs.com/package/expo-secure-enclave)
[![npm downloads](https://img.shields.io/npm/dm/expo-secure-enclave.svg)](https://www.npmjs.com/package/expo-secure-enclave)
[![license](https://img.shields.io/npm/l/expo-secure-enclave.svg)](./LICENSE)
[![platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android-informational)](#getting-started)
[![CI](https://github.com/umar-tariq-1/expo-secure-enclave/actions/workflows/ci.yml/badge.svg)](https://github.com/umar-tariq-1/expo-secure-enclave/actions/workflows/ci.yml)

<!-- The sections between "include" markers are generated from docs/*.md. Edit the pages in docs/,
     then run `npm run docs`. -->
<!-- include docs/index.md -->
Hardware-backed ECDSA P-256 signing for Expo and React Native apps. The private key is generated
inside the **iOS Secure Enclave** or the **Android Keystore** (StrongBox-backed where the device
has it) and never leaves it. Every signature requires a fresh Face ID, Touch ID, or fingerprint
check, enforced by the operating system rather than by app code.

Use it when your backend needs proof that a request came from one specific, previously registered
device, and that the device's owner just approved it with a biometric: passwordless sign-in,
device binding, approving payments and other sensitive actions.

```ts
import * as SecureEnclave from 'expo-secure-enclave';

const publicKey = await SecureEnclave.getOrCreatePublicKey(); // no prompt; register it with your server once
const signature = await SecureEnclave.sign(challengeFromServer); // Face ID / Touch ID / fingerprint prompt
```

## Why hardware-backed signing?

A key kept in app storage, or in the keychain as plain bytes, has to be loaded into the app's
memory to be used, so malware or a debugger on a compromised device can copy it. A Secure Enclave
or Keystore key can't be copied: it is created inside isolated security hardware (the Secure
Enclave on iOS; the TEE or a StrongBox secure element on Android), signing happens there, and only
the signature comes out. The biometric check is enforced by that hardware and the OS for every
single signature, so no app code can skip it. A server holding the public key can then check that
a signature could only have come from that one device, right after its owner authenticated.

## Features

- **Non-exportable hardware keys**: P-256 keys generated in the Secure Enclave on iOS, and in the
  Android Keystore on Android (StrongBox when available, otherwise the TEE).
- **A biometric for every signature**: Face ID, Touch ID, or a Class 3 (strong) Android biometric.
  There is no device-passcode fallback, on either platform.
- **Automatic invalidation** when the user adds or removes a fingerprint or face.
- **Standard formats, identical on both platforms**: base64 X9.63 public keys and base64 DER
  ECDSA/SHA-256 signatures, verifiable by any P-256 library. Tested server examples for Node.js,
  Web Crypto, `jose`, Python, Go, Java, and OpenSSL.
- **One error type, four reasons** (`cancelled`, `biometric_failed`, `key_invalidated`,
  `unavailable`), with the same meaning on iOS, Android, and web.
- **Multiple keys** per app through an optional `alias`.
- **Config plugin** for the iOS Face ID usage description: no manual native-file edits.
- **Safe to import anywhere**: in Expo Go and on web, `isAvailable()` resolves `false` instead of
  the import crashing, so you can feature-detect.
- **Testing support**: a pure-JS `verify()`, and a Jest mock at `expo-secure-enclave/mock`.
- **Typed**: TypeScript types and TSDoc with examples on every export.

## Status

Version 0.2.0, tested with Expo SDK 57.

- **iOS:** the core flow (creating a key, signing with a biometric, verifying the signature) was
  tested on a physical iPhone with version 0.1.0. The 0.2.0 changes (the stricter `isAvailable()`,
  the consistent error reasons, the Expo Go fallback) are built but haven't been re-tested on a
  device yet.
- **Android:** the module compiles and the example app builds, but it has **not yet been verified
  on a physical device**.

Some native error paths haven't been observed on any device, including which error iOS reports for
a cancelled prompt ([#1](https://github.com/umar-tariq-1/expo-secure-enclave/issues/1)) and after
a Face ID or fingerprint change; the [API reference](#how-each-platform-maps-to-these-reasons)
marks each one. Device reports are very welcome, especially for Android: run the
[device test plan](https://github.com/umar-tariq-1/expo-secure-enclave/blob/main/example/TEST_PLAN.md)
and share the results with the [device test results form](https://github.com/umar-tariq-1/expo-secure-enclave/issues/new?template=device_test_report.yml).
<!-- end include -->

**Contents:** [Getting started](#getting-started) · [API reference](#api-reference) ·
[Recipes](#recipes) · [Server-side verification](#server-side-verification) ·
[Testing](#testing) · [Security model](#security-model-and-limitations) ·
[Comparison](#when-to-use-this-and-when-to-use-something-else) · [FAQ](#faq) ·
[Troubleshooting](#troubleshooting)

<!-- include docs/getting-started.md -->
## Getting started

### Requirements

| | |
|---|---|
| Expo SDK | 57 (tested). Earlier SDKs are untested; the package declares `expo >= 57` as a peer dependency. |
| iOS | 16.4 or later, on a device with Face ID or Touch ID. Every such device has a Secure Enclave. |
| Android | API 24 or later (Expo's default minimum), with a Class 3 ("strong") biometric enrolled. StrongBox is used when the device has it, the TEE-backed Keystore otherwise. |
| iOS Simulator | Not supported: the Simulator has no Secure Enclave. `isAvailable()` resolves `false`; creating a key or signing rejects with `unavailable`. |
| Android Emulator | Expected to work with a fingerprint enrolled through the emulator's extended controls, but not yet tested. Emulator keys are not hardware-backed. |
| Expo Go | Not supported: Expo Go doesn't contain this native module. Importing the package there is safe (`isAvailable()` resolves `false`); use a [development build](https://docs.expo.dev/develop/development-builds/introduction/) to actually sign. |
| Web | Not supported: `isAvailable()` resolves `false`. |
| New Architecture | Supported. This is an Expo module, and the example app builds with the New Architecture enabled. |

### Installation

#### Expo projects

```sh
npx expo install expo-secure-enclave
```

Add the config plugin to `app.json` (or `app.config.ts`):

```json
{
  "expo": {
    "plugins": [
      [
        "expo-secure-enclave",
        { "faceIdUsageDescription": "Confirm it's you before approving sensitive actions." }
      ]
    ]
  }
}
```

The plugin sets iOS's `NSFaceIDUsageDescription`, the text iOS shows the first time your app uses
Face ID. `faceIdUsageDescription` is optional; without it the plugin uses "This app uses Face ID to
protect a hardware-backed signing key." If your app already sets `NSFaceIDUsageDescription` (for
example through `ios.infoPlist` or another plugin), the plugin leaves it unchanged. Android needs
no configuration: the `androidx.biometric` library declares the `USE_BIOMETRIC` permission itself.

Then build the native app, since this package contains native code:

```sh
npx expo run:ios       # or: npx expo run:android
# or, with EAS: eas build --profile development
```

#### Bare React Native projects

Bare apps need the Expo Modules runtime first (`npx install-expo-modules@latest`, see
[Expo's guide](https://docs.expo.dev/bare/installing-expo-modules/)), at Expo SDK 57. Then:

```sh
npx expo install expo-secure-enclave
npx pod-install
```

Config plugins don't run in bare projects, so add the Face ID usage description to
`ios/<YourApp>/Info.plist` yourself:

```xml
<key>NSFaceIDUsageDescription</key>
<string>Confirm it's you before approving sensitive actions.</string>
```

### Quick start

A complete minimal flow: check the device, create the key and register its public key with your
server once, then sign challenges from the server whenever you need proof that it's the user.

```ts
import * as SecureEnclave from 'expo-secure-enclave';

const API_URL = 'https://api.example.com'; // your backend

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

// Once, e.g. right after the user signs in another way: register this device's key.
export async function registerThisDevice(): Promise<boolean> {
  // Never prompts. False on devices without usable hardware or biometrics, in Expo Go, on web.
  if (!(await SecureEnclave.isAvailable())) return false;

  // Never prompts. Creates the key pair the first time, then returns the same public key:
  // base64 of 65 bytes (0x04 ‖ X ‖ Y).
  const publicKey = await SecureEnclave.getOrCreatePublicKey();
  await post('/devices', { publicKey });
  return true;
}

// Whenever you need proof that the registered device's owner is present.
export async function confirmItsTheUser(): Promise<boolean> {
  const { challenge } = await post<{ challenge: string }>('/challenges', {}); // random, single-use

  try {
    // Shows the Face ID / Touch ID / fingerprint prompt, then signs inside the secure hardware.
    // Resolves to a base64 DER ECDSA/SHA-256 signature.
    const signature = await SecureEnclave.sign(challenge);
    await post('/challenges/verify', { challenge, signature }); // server checks it against the key
    return true;
  } catch (error) {
    if (error instanceof SecureEnclave.SecureEnclaveError) {
      // error.reason: 'cancelled' | 'biometric_failed' | 'key_invalidated' | 'unavailable'
      console.warn('Not signed:', error.reason);
      return false;
    }
    throw error;
  }
}
```

This sketch trusts whatever public key reaches `/devices`. The
[device registration recipe](#register-a-device) also proves, at registration time, that
the device really holds the private key, and the [recipes](#recipes) cover what to do for each
error `reason`.

For a local sanity check without a server, `SecureEnclave.verify(publicKey, challenge, signature)`
returns `true` for a valid signature.

Next:

- [Recipes](#recipes) for complete client and server code: device registration, passwordless
  sign-in, transaction approval, and handling a key invalidated by a biometric change.
- [Server-side verification](#server-side-verification) for verifying in Node.js, Python, Go, Java,
  and more.
- [API reference](#api-reference) for every function and error reason.
<!-- end include -->

<!-- include docs/api.md -->
## API reference

```ts
import * as SecureEnclave from 'expo-secure-enclave';
// or named imports:
import {
  isAvailable,
  hasKey,
  getOrCreatePublicKey,
  sign,
  deleteKey,
  verify,
  SecureEnclaveError,
  type SecureEnclaveErrorReason,
} from 'expo-secure-enclave';
```

| Function | Prompts a biometric? | Resolves to | Can reject with |
|---|---|---|---|
| [`isAvailable()`](#isavailable) | Never | `boolean` | `unavailable` |
| [`hasKey(alias?)`](#haskey) | Never | `boolean` | `unavailable` |
| [`getOrCreatePublicKey(alias?)`](#getorcreatepublickey) | Never | `string`: base64 X9.63 public key | `unavailable` |
| [`sign(message, alias?)`](#sign) | **Always** | `string`: base64 DER signature | `cancelled`, `biometric_failed`, `key_invalidated`, `unavailable` |
| [`deleteKey(alias?)`](#deletekey) | Never | `void` | `unavailable` |
| [`verify(publicKey, message, signature)`](#verify) | Never (pure JS, synchronous) | `boolean` | Never throws |

Every rejection is a [`SecureEnclaveError`](#secureenclaveerror). `alias` always defaults to
`"default"`.

### isAvailable()

```ts
function isAvailable(): Promise<boolean>;
```

Whether this device can create a key and sign right now. Never prompts, and never creates
anything.

It resolves `true` only when:

- **iOS**: the device has a Secure Enclave, and `LAContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)`
  succeeds, meaning Face ID or Touch ID is enrolled, a passcode is set, the app hasn't been denied
  Face ID, and biometrics aren't locked out. Always `false` in the iOS Simulator.
- **Android**: `BiometricManager.canAuthenticate(BIOMETRIC_STRONG)` reports success, meaning a
  Class 3 (strong) biometric is enrolled and the hardware is usable. A device whose only enrolled
  biometric is Class 2 ("weak", common for camera-based face unlock) resolves `false`.
- **Web, Expo Go, or a build without the native module**: always `false`.

`false` is also exactly the condition under which creating a key or signing would reject with
`unavailable`. The answer can change while the app runs (the user enrolls a fingerprint, or locks
out biometrics), so check it close to where you use it.

```ts
if (!(await SecureEnclave.isAvailable())) {
  showPasswordSignIn(); // your fallback
}
```

### hasKey()

```ts
function hasKey(alias?: string): Promise<boolean>;
```

Whether a key exists for `alias`. Never prompts.

A key the OS has invalidated after a biometric change still counts as existing on Android, so
`true` doesn't guarantee that `sign()` will succeed. Whether iOS reports such a key as existing
hasn't been confirmed on a device yet. Use `hasKey()` to decide whether to register a key, and
handle `key_invalidated` from `sign()` to detect invalidation.

Resolves `false` on web, in Expo Go, and in builds without the native module.

### getOrCreatePublicKey()

```ts
function getOrCreatePublicKey(alias?: string): Promise<string>;
```

Returns the public key for `alias`, creating the key pair first if it doesn't exist yet. Never
prompts a biometric, including the first time: only `sign()` uses the private key.

- **Returns** the public key as standard, padded base64 of the 65-byte uncompressed X9.63 point,
  `0x04 ‖ X(32) ‖ Y(32)` (88 characters). Identical format on iOS and Android. See
  [Server-side verification](#server-side-verification) to convert it to SPKI, PEM, or JWK.
- **Creating** a new key requires exactly what [`isAvailable()`](#isavailable) checks; otherwise it
  rejects with `unavailable`. Returning an existing key's public key requires nothing.
- **An existing key is returned as is**, even if the OS has invalidated it: call `deleteKey()`
  first when you want a fresh key (see [`key_invalidated`](#error-reasons)).
- **Rejects** only with `unavailable` (no hardware, no usable biometric, Simulator, web, Expo Go,
  or a Keychain/Keystore failure).

Call it when you register the device with your backend, and store the result there.

```ts
const publicKey = await SecureEnclave.getOrCreatePublicKey();
await api.registerDevice({ publicKey }); // your backend call
```

### sign()

```ts
function sign(message: string | Uint8Array, alias?: string): Promise<string>;
```

Signs `message` with `alias`'s private key inside the Secure Enclave or Keystore. **Always** shows
the system biometric prompt first. There is no way to sign without a fresh, successful biometric
check, and no device-passcode fallback.

- **`message`**: a string is signed as its UTF-8 bytes; a `Uint8Array` is signed exactly as given.
  Nothing else is added or changed, so your server must verify the same bytes. The whole message
  crosses the native bridge, so sign something compact (a challenge, a canonical request string,
  or a hash of a large document) rather than a large payload.
- **Signature**: ECDSA over SHA-256 of `message` (the hashing happens inside the platform's signing
  call), returned as standard base64 of the DER encoding, an ASN.1 `SEQUENCE { r INTEGER, s INTEGER }`
  (usually 70 to 72 bytes). The S value is not normalized to "low S"; see
  [Server-side verification](#low-s-signatures).
- **Order of checks**, the same on both platforms: device state first (no usable biometric,
  lockout, or on Android no foreground activity gives `unavailable`), then the key (missing gives
  `key_invalidated`), then the prompt.
- **The prompt**: on iOS, the system Face ID or Touch ID UI. On Android, a `BiometricPrompt` titled
  "Authenticate" with the subtitle "Confirm your identity to sign" and a "Cancel" button. These
  texts can't be customized or localized yet.
- Await one `sign()` before starting another.

```ts
try {
  const signature = await SecureEnclave.sign(challenge);
  await api.verifyChallenge({ challenge, signature }); // your backend call
} catch (error) {
  if (error instanceof SecureEnclave.SecureEnclaveError) {
    handleSignError(error.reason); // see "Error reasons" below
  } else {
    throw error;
  }
}
```

### deleteKey()

```ts
function deleteKey(alias?: string): Promise<void>;
```

Deletes `alias`'s key pair. Never prompts. Deleting a key that doesn't exist is a no-op, not an
error. A deleted key is gone permanently: signatures it made still verify against its public key,
but it can never sign again. Rejects only with `unavailable`.

### verify()

```ts
function verify(
  publicKey: string,
  message: string | Uint8Array,
  signature: string
): boolean;
```

Checks a `sign()` signature against a `getOrCreatePublicKey()` public key, in pure JavaScript
(`@noble/curves`), synchronously, without any native call or device. Accepts both low-S and high-S
signatures. Returns `false` (never throws) for a wrong signature or for malformed input.

Useful in tests, and for checking a signature locally. Your backend still has to verify signatures
itself: a check inside the app proves nothing to the server.

```ts
const ok = SecureEnclave.verify(publicKey, 'hello', signature);
```

### SecureEnclaveError

```ts
class SecureEnclaveError extends Error {
  readonly name: 'SecureEnclaveError';
  readonly reason: SecureEnclaveErrorReason;
  message: string; // the platform's own detail, for logs
}

type SecureEnclaveErrorReason = 'cancelled' | 'biometric_failed' | 'key_invalidated' | 'unavailable';
```

The only error type this package rejects with. Branch on `reason`; `message` is for logging and
its wording isn't stable.

### Error reasons

Only `sign()` can produce `cancelled`, `biometric_failed`, or `key_invalidated`, because it's the
only call that shows a prompt or uses the private key. Every other function rejects only with
`unavailable`.

| Reason | Meaning | What to do |
|---|---|---|
| `cancelled` | The prompt closed without a result: the user tapped Cancel or dismissed it, or the system dismissed it (for example, the app went to the background). | Nothing to report. Let the user try again when they want to. |
| `biometric_failed` | The biometric check ran but didn't succeed (face or finger not recognized, timeout), or signing failed in a way the platform didn't classify more precisely. | Offer to try again. |
| `key_invalidated` | This alias has no usable key: it was never created, was deleted, or the OS invalidated it because the enrolled biometrics changed. | Retrying never helps. Call `deleteKey()`, then `getOrCreatePublicKey()`, and register the new public key with your backend, after the user has authenticated some other way. See the [recipe](#handle-every-outcome). |
| `unavailable` | Hardware-backed biometric signing can't be used here right now: no Secure Enclave or Keystore (iOS Simulator, web, Expo Go, an app not rebuilt after installing), no biometric enrolled, no passcode, biometrics locked out, or, on Android, no foreground activity. | Fall back to another method, or ask the user to set up biometrics. `isAvailable()` resolves `false` in exactly these situations. |

#### How each platform maps to these reasons

"Confirmed" means observed on a physical device. Until then, a row describes what the code does,
based on the platform documentation.

| Situation | Reason | iOS | Android | Confirmed |
|---|---|---|---|---|
| No biometric enrolled, no passcode, no biometric hardware | `unavailable` | `canEvaluatePolicy` fails; checked before creating a key and before signing | `canAuthenticate(BIOMETRIC_STRONG)` fails; same checks | Not yet |
| Biometrics locked out after too many failures | `unavailable` | `canEvaluatePolicy` fails, so the next `sign()` is `unavailable`. The attempt that causes the lockout may report `biometric_failed`. | `ERROR_LOCKOUT` or `ERROR_LOCKOUT_PERMANENT` from the prompt | Not yet |
| User cancels or dismisses the prompt | `cancelled` | `errSecUserCanceled`. If iOS reports a cancel with a different error code, it currently surfaces as `biometric_failed` ([#1](https://github.com/umar-tariq-1/expo-secure-enclave/issues/1)). | `ERROR_USER_CANCELED`, `ERROR_NEGATIVE_BUTTON`, `ERROR_CANCELED` | Not yet |
| Face or finger not recognized, timeout | `biometric_failed` | `errSecAuthFailed`, and any unrecognized signing error | `ERROR_TIMEOUT`, `ERROR_UNABLE_TO_PROCESS`, `ERROR_VENDOR`, and any other prompt error | Not yet |
| No key for this alias | `key_invalidated` | Keychain lookup finds nothing | Keystore has no such alias | Logic covered by unit tests |
| Key invalidated by a biometric change | `key_invalidated` | Expected via `errSecItemNotFound`; which error iOS actually reports is not yet confirmed | `KeyPermanentlyInvalidatedException` or `UnrecoverableKeyException` when loading the key | Not yet |
| No foreground activity to show the prompt on | `unavailable` | Not applicable | `sign()` checks for a `FragmentActivity` | Not yet |
| iOS Simulator, web, Expo Go, missing native module | `unavailable` | Simulator: compile-time check | Not applicable | Web and missing module covered by unit tests |
| Any failure in `isAvailable`, `hasKey`, `getOrCreatePublicKey`, or `deleteKey` | `unavailable` | All platforms | All platforms | Covered by unit tests |

On iOS, `SecureEnclaveError.message` for a signing failure ends with the native error domain and
code, for example `(NSOSStatusErrorDomain -128)`, which is what the device test plan records.

### Aliases and multiple keys

Pass an `alias` to any function to keep separate keys, for example one per account signed in on
the device:

```ts
const workKey = await SecureEnclave.getOrCreatePublicKey('work');
const signature = await SecureEnclave.sign(payload, 'work');
await SecureEnclave.deleteKey('work'); // the 'default' key is untouched
```

Keys belong to your app. On iOS each alias is a Keychain key tagged
`<your bundle identifier>.secureenclave.<alias>`; on Android it's the Keystore alias
`expo-secure-enclave.<alias>`.

### Formats

| | Encoding | Size |
|---|---|---|
| Public key (`getOrCreatePublicKey`) | Standard base64 of the uncompressed X9.63 point `0x04 ‖ X ‖ Y` | 65 bytes (88 base64 characters) |
| Signature (`sign`) | Standard base64 of a DER `SEQUENCE { r, s }`, ECDSA P-256 with SHA-256; S not normalized | Usually 70 to 72 bytes |
| Message (`sign`, `verify`) | A string is used as its UTF-8 bytes; a `Uint8Array` as is | Keep it small |

Both platforms produce exactly these formats, so a signature verifies the same way whichever
platform made it. [Server-side verification](#server-side-verification) shows how to verify them, and
how to convert to SPKI, PEM, JWK, or the raw `r ‖ s` form that JOSE and Web Crypto expect.

### Config plugin

```json
{ "expo": { "plugins": [["expo-secure-enclave", { "faceIdUsageDescription": "..." }]] } }
```

| Option | Default | Effect |
|---|---|---|
| `faceIdUsageDescription` | `"This app uses Face ID to protect a hardware-backed signing key."` | Sets iOS `NSFaceIDUsageDescription`, unless the app already sets it. |

There are no Android options.

### Jest mock

`expo-secure-enclave/mock` is an in-memory stand-in with the same exports, plus `mockControls`. See
[Testing](#testing).
<!-- end include -->

<!-- include docs/recipes.md -->
## Recipes

Each recipe has the app code and the matching server code. The server side is TypeScript for
Node.js using only `node:crypto`; the same checks work in any language (see
[Server-side verification](#server-side-verification)). All of the code below is exercised end to end
in a test: the app code against the package's [Jest mock](#testing), the server code against
real signatures.

### Shared pieces

#### The app's request helper

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

#### Server: signature check and one-time challenges

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

### Register a device

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

`sign()` rejects with a [`SecureEnclaveError`](#secureenclaveerror) if the user cancels or
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

### Passwordless sign-in

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

### Approve a transaction

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

### Handle every outcome

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

### Fall back when hardware isn't available

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

### Multiple keys

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

### ES256 JWT signed by the device

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
<!-- end include -->

<!-- include docs/server-verification.md -->
## Server-side verification

The app sends your server two things: a public key once, at registration, and a signature each
time the user approves something. The server verifies the signature against the stored public key,
over exactly the bytes the app signed. Any standard ECDSA P-256 (secp256r1, prime256v1) library can
do this. Every snippet on this page was run against the [test vectors](#test-vectors) below.

### What you receive

| | Format |
|---|---|
| Public key, from `getOrCreatePublicKey()` | Standard base64 (with `=` padding) of the 65-byte uncompressed point `0x04 ‖ X(32) ‖ Y(32)`, the X9.63 / SEC 1 encoding. Not SPKI, not PEM. |
| Signature, from `sign()` | Standard base64 of the DER encoding `SEQUENCE { r INTEGER, s INTEGER }`, usually 70 to 72 bytes. ECDSA with SHA-256. Not the raw 64-byte `r ‖ s` form. |
| Signed bytes | The UTF-8 bytes of the string the app passed to `sign()`, or the exact `Uint8Array` it passed. The SHA-256 hash is computed by the signer; your verifier hashes the same bytes again itself. Don't hash the message before passing it to a verify function that hashes. |

iOS and Android produce identical formats.

#### Converting the public key

- **To SPKI DER**: prepend the fixed 26-byte header
  `3059301306072a8648ce3d020106082a8648ce3d030107034200` (hex) to the 65 decoded bytes. Most
  libraries accept SPKI.
- **To PEM**: base64 the SPKI DER and wrap it in `-----BEGIN PUBLIC KEY-----` /
  `-----END PUBLIC KEY-----` lines.
- **To JWK**: `{ "kty": "EC", "crv": "P-256", "x": base64url(bytes 1 to 32), "y": base64url(bytes 33 to 64) }`.
- **To raw**: Web Crypto's `"raw"` format and Python's `from_encoded_point` take the 65 bytes as is.

#### Low-S signatures

ECDSA signatures come in two equally valid forms, with a "low" or a "high" S value. Neither the
Secure Enclave nor the Android Keystore guarantees the low form, and this package passes their
signatures through unchanged, so expect high-S signatures (if S isn't normalized, about half of
them). Some libraries reject high-S signatures by default, which looks like random verification
failures.
Every verifier on this page accepts both. If yours doesn't, find its option for allowing high S
(for example, `@noble/curves` needs `lowS: false`, which this package's own `verify()` passes).

### Node.js

`node:crypto` only, no dependencies.

<!-- file: verify-node.mjs -->
```js
import { createPublicKey, verify } from 'node:crypto';

// DER header that wraps a raw 65-byte P-256 point into a SubjectPublicKeyInfo (SPKI) structure.
const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');

export function verifySignature(publicKeyBase64, message, signatureBase64) {
  const publicKey = createPublicKey({
    key: Buffer.concat([P256_SPKI_PREFIX, Buffer.from(publicKeyBase64, 'base64')]),
    format: 'der',
    type: 'spki',
  });
  // `message` must be what the app passed to sign(): a string there means its UTF-8 bytes.
  return verify('sha256', Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureBase64, 'base64'));
}
```

`verify` throws on a malformed key or signature, so wrap it in `try`/`catch` when the inputs come
from a client (the [recipes](#shared-pieces) do).

For JWTs verified with `jose`, see the [ES256 JWT recipe](#es256-jwt-signed-by-the-device).

### Web Crypto

Cloudflare Workers, Deno, Bun, browsers, and Node.js 20 and later (`globalThis.crypto.subtle`). Web
Crypto expects the raw 64-byte `r ‖ s` signature, so convert from DER first.

<!-- file: verify-webcrypto.mjs -->
```js
function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Web Crypto expects ECDSA signatures as raw r || s (64 bytes), not DER.
function derToRaw(der) {
  let offset = 2;
  const readInteger = () => {
    const length = der[offset + 1];
    let value = der.subarray(offset + 2, offset + 2 + length);
    offset += 2 + length;
    while (value.length > 32 && value[0] === 0) value = value.subarray(1);
    const out = new Uint8Array(32);
    out.set(value, 32 - value.length);
    return out;
  };
  const raw = new Uint8Array(64);
  raw.set(readInteger(), 0);
  raw.set(readInteger(), 32);
  return raw;
}

export async function verifySignature(publicKeyBase64, message, signatureBase64) {
  const publicKey = await crypto.subtle.importKey(
    'raw', // the 65-byte X9.63 point is exactly Web Crypto's "raw" EC public key format
    base64ToBytes(publicKeyBase64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    derToRaw(base64ToBytes(signatureBase64)),
    new TextEncoder().encode(message)
  );
}
```

### Python

With [`cryptography`](https://cryptography.io/).

<!-- file: verify_signature.py -->
```python
import base64

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec


def verify_signature(public_key_b64: str, message: bytes, signature_b64: str) -> bool:
    # from_encoded_point reads the 65-byte X9.63 point (0x04 || X || Y) directly.
    public_key = ec.EllipticCurvePublicKey.from_encoded_point(
        ec.SECP256R1(), base64.b64decode(public_key_b64)
    )
    try:
        # DER signature, SHA-256 hashed internally: the same contract sign() uses.
        public_key.verify(base64.b64decode(signature_b64), message, ec.ECDSA(hashes.SHA256()))
        return True
    except InvalidSignature:
        return False
```

Pass `message` as bytes: `"the signed string".encode("utf-8")`.

### Go

Standard library only. Needs Go 1.25 or later for `ecdsa.ParseUncompressedPublicKey`.

<!-- file: verify.go -->
```go
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
)

// VerifySignature checks a sign() result against a getOrCreatePublicKey() result.
func VerifySignature(publicKeyB64 string, message []byte, signatureB64 string) (bool, error) {
	rawKey, err := base64.StdEncoding.DecodeString(publicKeyB64)
	if err != nil {
		return false, err
	}
	publicKey, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), rawKey)
	if err != nil {
		return false, err
	}
	signature, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		return false, err
	}
	digest := sha256.Sum256(message)
	return ecdsa.VerifyASN1(publicKey, digest[:], signature), nil
}
```

### Java and Kotlin (JVM)

Standard library only (Java 17 or later, for `HexFormat`). The same calls work from Kotlin.

<!-- file: DeviceSignatures.java -->
```java
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.HexFormat;

public final class DeviceSignatures {
  // DER header that wraps a raw 65-byte P-256 point into a SubjectPublicKeyInfo (SPKI) structure.
  private static final byte[] P256_SPKI_PREFIX =
      HexFormat.of().parseHex("3059301306072a8648ce3d020106082a8648ce3d030107034200");

  public static boolean verify(String publicKeyBase64, String message, String signatureBase64)
      throws Exception {
    byte[] point = Base64.getDecoder().decode(publicKeyBase64);
    byte[] spki = new byte[P256_SPKI_PREFIX.length + point.length];
    System.arraycopy(P256_SPKI_PREFIX, 0, spki, 0, P256_SPKI_PREFIX.length);
    System.arraycopy(point, 0, spki, P256_SPKI_PREFIX.length, point.length);
    PublicKey publicKey = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(spki));

    Signature verifier = Signature.getInstance("SHA256withECDSA"); // expects DER, hashes internally
    verifier.initVerify(publicKey);
    verifier.update(message.getBytes(StandardCharsets.UTF_8));
    try {
      return verifier.verify(Base64.getDecoder().decode(signatureBase64));
    } catch (SignatureException malformed) {
      return false;
    }
  }
}
```

### OpenSSL command line

Handy for checking a signature by hand while debugging.

<!-- file: verify.sh -->
```sh
# PUBLIC_KEY, SIGNATURE and MESSAGE hold the values the app produced and signed.
( printf '3059301306072a8648ce3d020106082a8648ce3d030107034200' | xxd -r -p
  printf '%s' "$PUBLIC_KEY" | base64 -d ) > public.der
openssl pkey -pubin -inform DER -in public.der -out public.pem
printf '%s' "$SIGNATURE" | base64 -d > signature.der
printf '%s' "$MESSAGE" > message.txt
openssl dgst -sha256 -verify public.pem -signature signature.der message.txt   # "Verified OK"
```

### Test vectors

To check your own implementation: one P-256 key, one message, and the same signature in both its
low-S and high-S DER forms. Both signatures must verify, and a signature over any other message
must not.

```text
publicKey  BB6aMpW+7SJL7GGj/UxFecBe9nNd8JXRo7+3snPn0jnQOPmiQq7i+pExAEZ+Y1ITykCQhXvpytrzqMssRLh2jhE=
message    approve:transfer:42:acct_123:nonce=8f2c
sigLowS    MEQCIHLYuVXr5SwsXAlNmRDiZi2mZdsYSLT4qZ4523S2i4B0AiAS/YqcCNBiL7ocsEn6mUErMBXUE+EAHAntqpx6zDzUJQ==
sigHighS   MEUCIHLYuVXr5SwsXAlNmRDiZi2mZdsYSLT4qZ4523S2i4B0AiEA7QJ1YvcvndFF40+2BWa+1IzRJpnGF4J7Bg8uSDAmUSw=
```

### Common mistakes

- **Verifying different bytes than were signed.** Re-serializing JSON, trimming whitespace, or
  changing the encoding breaks the signature. Send the exact signed string alongside the
  signature, verify that string, then parse it.
- **Hashing twice.** `sign()` hashes the message with SHA-256 internally. Pass the original message
  to a verify function that also hashes (all of the above do), not a pre-computed hash.
- **DER versus raw.** JOSE and Web Crypto use the 64-byte `r ‖ s` form; most other libraries use
  DER. Convert as shown above.
- **base64 versus base64url.** This package uses standard base64 with padding.
- **Rejecting high S.** See [Low-S signatures](#low-s-signatures).
- **Trusting a public key just because it arrived.** Register keys only for authenticated users,
  and prove possession during registration, as in the
  [device registration recipe](#register-a-device).
<!-- end include -->

<!-- include docs/testing.md -->
## Testing

### The Jest mock

`expo-secure-enclave/mock` is an in-memory stand-in for the package, for Jest. It has the same
exports, signatures, formats, and error reasons, and makes real P-256 keys and signatures (with
Node's `crypto` module, so they're software keys, for tests only). Signatures from the mock verify
with the real `verify()` and on your server, and the mock's `verify()` accepts real device
signatures.

```ts
// jest.setup.ts (listed in "setupFiles"), or at the top of a test file
jest.mock('expo-secure-enclave', () => require('expo-secure-enclave/mock'));
```

With jest-expo's default configuration this needs no other changes.

```ts
import * as SecureEnclave from 'expo-secure-enclave';
import { mockControls } from 'expo-secure-enclave/mock';

beforeEach(() => mockControls.reset());

it('signs a challenge that verifies', async () => {
  const publicKey = await SecureEnclave.getOrCreatePublicKey();
  const signature = await SecureEnclave.sign('challenge');
  expect(SecureEnclave.verify(publicKey, 'challenge', signature)).toBe(true);
});

it('handles a cancelled prompt', async () => {
  await SecureEnclave.getOrCreatePublicKey();
  mockControls.failNextSign('cancelled');
  await expect(SecureEnclave.sign('challenge')).rejects.toMatchObject({ reason: 'cancelled' });
});

it('handles a biometric change', async () => {
  await SecureEnclave.getOrCreatePublicKey();
  mockControls.invalidateKeys();
  await expect(SecureEnclave.sign('challenge')).rejects.toMatchObject({ reason: 'key_invalidated' });
});

it('can spy on calls', async () => {
  const spy = jest.spyOn(SecureEnclave, 'sign');
  await SecureEnclave.getOrCreatePublicKey();
  await SecureEnclave.sign('challenge');
  expect(spy).toHaveBeenCalledWith('challenge');
});
```

#### `mockControls`

| Control | Effect |
|---|---|
| `setAvailable(value)` | What `isAvailable()` resolves (default `true`). `false` behaves like a device without a usable biometric: creating a key and `sign()` reject `unavailable`; existing keys stay readable. |
| `failNextSign(reason)` | The next `sign()` that reaches the prompt rejects with `reason` instead of signing. Calls queue up, one per future `sign()`. |
| `invalidateKeys(alias?)` | Simulates a biometric change, for one alias or all. As on a device, `hasKey()` stays `true` and `getOrCreatePublicKey()` returns the old public key, but `sign()` rejects `key_invalidated` until the key is deleted and recreated. |
| `reset()` | No keys, available, nothing queued. Call it in `beforeEach`. |

The mock's `sign()` checks things in the device's order: availability (`unavailable`), then the key
(`key_invalidated`), then the queued prompt outcome.

### Testing without the mock

If a test imports the real package (for example, a component that renders on every platform),
that works too: there's no native module under Jest, so the package behaves as it does in Expo Go.
`isAvailable()` and `hasKey()` resolve `false`, `getOrCreatePublicKey()` and `sign()` reject with
`unavailable`, and `verify()` works normally.

The real package's `verify()` uses `@noble/curves`, which is published as ES modules only, and
jest-expo doesn't transform `node_modules/@noble` by default. Without a change you'll see
`SyntaxError: Cannot use import statement outside a module`. Add `@noble` to the
`transformIgnorePatterns` allowlist. With jest-expo 57 the full setting is:

```js
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@noble))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
```

This is jest-expo 57's default list plus `@noble`. Setting `transformIgnorePatterns` replaces the
preset's list, so keep the other entries. Tests that use the mock don't need this.

### What tests can't cover

The mock models the API contract, not the hardware: no real prompt, no Secure Enclave, no
Keystore, no OS-driven invalidation. Before relying on a flow in production, run it on physical
devices. The [example app](https://github.com/umar-tariq-1/expo-secure-enclave/tree/main/example)
and its [device test plan](https://github.com/umar-tariq-1/expo-secure-enclave/blob/main/example/TEST_PLAN.md)
are a starting point.
<!-- end include -->

<!-- include docs/security-model.md -->
## Security model and limitations

### What it guarantees

- **The private key can't be extracted.** On iOS it's generated inside the Secure Enclave
  (`kSecAttrTokenIDSecureEnclave`); on Android inside the Keystore, StrongBox-backed when available,
  otherwise TEE-backed. Neither this package nor your app ever has the private key's bytes. Every
  operation passes the OS an opaque key reference and gets a signature back.
- **Every signature needs a fresh biometric.** iOS keys are created with the access control flags
  `.privateKeyUsage` and `.biometryCurrentSet`; Android keys require user authentication for every
  use with `AUTH_BIOMETRIC_STRONG` (API 30 and later; earlier versions use the equivalent
  per-use setting), and signing goes through `BiometricPrompt` with the key bound to the prompt's
  `CryptoObject`. The OS enforces this. There's no passcode fallback, and no app code path that can
  sign without the biometric.
- **A biometric change invalidates the key.** Adding or removing a fingerprint or face, or
  re-enrolling Face ID, makes the key permanently unusable (`.biometryCurrentSet` on iOS,
  `setInvalidatedByBiometricEnrollment(true)` on Android). Someone who learns the device passcode
  can't enroll their own biometric and then use the key.
- **Signatures are standard.** Your server verifies them with ordinary ECDSA P-256 code, so the
  security of the check doesn't depend on this package.

So a valid signature tells your server that it was made by the private key it registered, which
exists only in that device's secure hardware, and that the device's enrolled biometric was just
presented.

### What it doesn't do

- **It doesn't attest the key.** Your server can't tell from the public key alone that it came
  from secure hardware, or from your genuine app. A modified client could register a software key
  instead. If you need that assurance, add platform attestation: Apple App Attest, Android Key
  Attestation, or Play Integrity (for example with
  [react-native-secure-enclave-operations](https://www.npmjs.com/package/react-native-secure-enclave-operations)).
  Attestation is not in this package.
- **It doesn't prove the user understood what they signed.** The system prompt can't show your
  transaction details. Display them in your UI right before calling `sign()`, and sign exactly what
  you displayed. Malware with control of the app's process could request a signature and show a
  misleading screen; the user still has to present their biometric, but your server can't tell
  what they saw.
- **It doesn't prevent replay on its own.** A signature over the same bytes is valid forever.
  Sign server-issued, single-use, expiring challenges, as in the [recipes](#recipes).
- **It doesn't identify a person.** It proves "an enrolled biometric on this device", not "this
  specific person": anyone whose fingerprint or face is enrolled on the device can sign.
- **It doesn't store secrets.** The Secure Enclave only holds 256-bit elliptic curve keys, and this
  package only signs. To keep a token or password on the device, use
  [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/).
- **It doesn't encrypt.** There is no encrypt, decrypt, or key-agreement API.
- **It only does ECDSA P-256 with SHA-256.** No RSA, no Ed25519, no other curves or hashes.

### Key lifecycle

| Event | What happens to the key |
|---|---|
| First `getOrCreatePublicKey(alias)` | A new key pair is created in hardware. No prompt. |
| `sign()` | Requires a fresh biometric every time; the key doesn't change. |
| Fingerprint or face added or removed, Face ID re-enrolled | The key is permanently invalidated. `sign()` is designed to reject with `key_invalidated` (not yet confirmed on a device; on iOS it may surface as `biometric_failed`, see [#1](https://github.com/umar-tariq-1/expo-secure-enclave/issues/1)). Delete it, create a new one, and register it again after the user authenticates another way. |
| Biometrics locked out after failed attempts | The key is fine; `sign()` rejects with `unavailable` until the user unlocks biometrics (on iOS, by entering the passcode). |
| `deleteKey(alias)` | The key is destroyed. |
| Device backup and restore, or moving to a new device | The key does not come along. iOS keys are created as `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, which excludes them from backups and iCloud Keychain, and Keystore keys never leave the device. After a restore, `hasKey()` is `false`: register the new device. |
| App uninstalled (Android) | Keystore keys are deleted with the app. |
| App uninstalled (iOS) | Keychain items, including references to Secure Enclave keys, can survive an uninstall on iOS, so after a reinstall `hasKey()` may return `true` for the old key. This is general iOS Keychain behavior and hasn't been specifically tested with this package. If your app should start fresh after a reinstall, call `deleteKey()` on first launch. |
| Device passcode or screen lock removed | Expect the key to become unusable: Android permanently invalidates keys that require user authentication when the secure lock screen is disabled, and iOS removes Face ID and Touch ID enrollment along with the passcode. |

### Your server's responsibilities

- Issue random, single-use, short-lived challenges, and include their purpose in the signed text.
- Verify against the exact bytes that were signed, accepting high-S signatures
  ([details](#low-s-signatures)).
- Register a public key only for an already-authenticated user, and require a signature over a
  registration challenge to prove the device holds the private key.
- Support several devices per user, let users revoke them, and provide a recovery path that
  doesn't depend on the device key, since keys are lost with the device, with a biometric change,
  or with a restore.
- Treat a re-registration after `key_invalidated` like adding a new device: authenticate the user
  another way first, because the old key can't vouch for the new one.
<!-- end include -->

<!-- include docs/comparison.md -->
## When to use this, and when to use something else

These libraries overlap in vocabulary (biometrics, Secure Enclave, Keystore) but solve different
problems. The facts below come from each package's own README and native source code, as of
October 2026. If something here is out of date, please
[open an issue](https://github.com/umar-tariq-1/expo-secure-enclave/issues).

### Quick guide

- **Store a token, password, or other secret on the device** → [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/),
  or [react-native-sensitive-info](https://www.npmjs.com/package/react-native-sensitive-info) for
  richer access policies.
- **Ask "is it really you?" before showing a screen, with no server involved** →
  [expo-local-authentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/).
- **Prove to your server that the app and device are genuine (attestation)** →
  [react-native-secure-enclave-operations](https://www.npmjs.com/package/react-native-secure-enclave-operations)
  (App Attest, Play Integrity, Android key attestation). It complements this package rather than
  replacing it.
- **Prove to your server that a registered device's owner just approved something, with a
  hardware key and a biometric** → this package.

### Comparison table

| Package | What it's for | Keys and signatures | User verification | Expo Go |
|---|---|---|---|---|
| **expo-secure-enclave** | Hardware-backed signing for server-verifiable approvals | ECDSA P-256 in the Secure Enclave (iOS) and Keystore with StrongBox or TEE (Android). Base64 DER signatures, base64 X9.63 public keys. | Biometric only, for every signature; no passcode fallback. Key invalidated when biometrics change. | No; import is safe, `isAvailable()` is `false` |
| [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) | Encrypted key-value storage | No signing API | Optional `requireAuthentication` (biometric) per item | Yes, with limits on `requireAuthentication` (see its docs) |
| [expo-local-authentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/) | A local "confirm it's you" check that returns success or failure | No keys | Biometric, with device passcode fallback unless `disableDeviceFallback` is set | Yes, except Face ID on iOS (see its docs) |
| [react-native-sensitive-info](https://www.npmjs.com/package/react-native-sensitive-info) (v6) | Secret storage with hooks and per-item access policies | No signing API (AES-GCM encrypted values) | Policies from Secure Enclave biometry down to none; downgrades automatically when hardware or enrollment is missing, and reports the policy applied | No (Nitro modules; New Architecture, RN 0.76+) |
| [react-native-biometrics](https://www.npmjs.com/package/react-native-biometrics) | Biometric prompt plus RSA signing | RSA-2048 on both platforms (iOS Keychain, not the Secure Enclave). PKCS#1 v1.5 SHA-256 signatures, SPKI public keys. | Biometric; optional device-credential fallback. The iOS key survives biometric re-enrollment. | No |
| [react-native-device-binding](https://www.npmjs.com/package/react-native-device-binding) | Silent device binding and a device ID | ECDSA P-256 in the Secure Enclave (falls back to a non-Secure-Enclave key if that fails) and Keystore with StrongBox or TEE. DER signatures, SPKI public keys. | None: signing doesn't prompt | No |
| [react-native-secure-enclave-operations](https://www.npmjs.com/package/react-native-secure-enclave-operations) | App and device attestation | Apple App Attest; Play Integrity and Android key attestation certificate chains. No general-purpose signing. | None | No |
| [expo-device-crypto](https://www.npmjs.com/package/expo-device-crypto) (formerly expo-secure-signing) | Signing and encryption | ECDSA P-256 in the Secure Enclave and StrongBox; RSA 2048/4096 signing and encryption; ECIES. PEM public keys by default. | Optional; device passcode, or passcode or biometric (no biometric-only mode). Android uses a 30-second authorization window. | No |
| [react-native-secure-sign](https://www.npmjs.com/package/react-native-secure-sign) | Biometric signing | ECDSA P-256 in the Secure Enclave and Keystore with StrongBox or TEE. Base64url raw `r ‖ s` (JOSE-style) signatures, base64url SPKI public keys. | Biometric only, per signature. The iOS key survives biometric re-enrollment. | No (New Architecture required) |

### Where another library fits better

- **expo-secure-store** if you only need to keep a secret encrypted at rest, optionally behind a
  biometric. It's part of the Expo SDK and works in Expo Go.
- **expo-local-authentication** for a UI gate where the server doesn't need cryptographic proof,
  or when a device passcode fallback is what you want.
- **react-native-sensitive-info** for a fuller secret store: per-item policies, metadata about the
  security level actually applied, key rotation, and more Apple platforms.
- **react-native-biometrics** if your backend already expects RSA signatures, or you want an
  optional passcode fallback. Its latest release, 3.0.1, is from September 2022.
- **react-native-device-binding** if you want device binding without a biometric prompt on every
  signature.
- **react-native-secure-enclave-operations** if your server needs evidence that requests come from
  your genuine app on genuine hardware. This package doesn't do attestation, so the two can be
  used together.
- **expo-device-crypto** if you need RSA, encryption, PEM output, or a passcode-or-biometric policy.
- **react-native-secure-sign** if you want JOSE-style signatures (base64url, raw `r ‖ s`) out of
  the box, or iOS keys that survive biometric re-enrollment.

### Where this package fits

Choose expo-secure-enclave when you need all of these together: a P-256 key in the Secure Enclave
or StrongBox/TEE, a biometric-only check enforced for every signature, standard DER signatures that
any backend can verify, a config plugin, and behavior that's identical on iOS and Android, down to
the four error reasons.

Its trade-offs:

- **Biometric only.** Users without an enrolled biometric (or, on Android, with only a Class 2
  biometric) can't use it, so you need another sign-in method alongside it.
- **No attestation** of the key or the app.
- **The prompt text can't be customized yet**, and the Android prompt's text is English only.
- **Young.** The iOS core flow has been used on a physical iPhone, but Android hasn't been
  verified on a device yet (see [Status](#status)).
<!-- end include -->

<!-- include docs/faq.md -->
## FAQ

### How do I use the Secure Enclave in an Expo app?

Install this package with `npx expo install expo-secure-enclave`, add `"expo-secure-enclave"` to
the `plugins` in `app.json`, and make a development build. `getOrCreatePublicKey()` creates a P-256
key inside the Secure Enclave (or the Android Keystore) and returns its public key;
`sign(message)` signs with it after a Face ID, Touch ID, or fingerprint check. See
[Getting started](#getting-started).

### Does it work in Expo Go?

No. Expo Go only contains the native modules that ship with it, and this isn't one of them. Use a
development build (`npx expo run:ios`, `npx expo run:android`, or EAS Build). Importing the package
in Expo Go is safe, though: `isAvailable()` resolves `false`, so the same code can fall back
gracefully.

### Does it work on the iOS Simulator or an Android emulator?

The iOS Simulator has no Secure Enclave, so `isAvailable()` is always `false` there and signing
rejects with `unavailable`. Test on a physical iPhone. An Android emulator with a fingerprint
enrolled (through the emulator's extended controls) is expected to work but hasn't been tested yet,
and its keys aren't hardware-backed.

### Can I store a password or API token in the Secure Enclave with this?

No. The Secure Enclave only holds elliptic curve signing keys, and this package only creates keys
and signs with them. To store a secret, use
[expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) (or
[react-native-sensitive-info](https://www.npmjs.com/package/react-native-sensitive-info)). Often you
don't need a stored secret at all: a device key that signs server challenges replaces a long-lived
token.

### How do I verify the signature on my server?

Store the public key from `getOrCreatePublicKey()` when the device registers. To verify, check the
base64 DER ECDSA/SHA-256 signature over the exact bytes the app signed, using any P-256 library.
[Server-side verification](#server-side-verification) has tested code for Node.js, Web Crypto, `jose`,
Python, Go, Java, and OpenSSL, plus test vectors.

### Why does my server reject some valid signatures?

If it's a seemingly random share of them (often around half), your ECDSA library probably requires
"low-S" signatures. The Secure Enclave and Android Keystore don't guarantee that form, and both
forms are valid. Allow high S in your verifier (for `@noble/curves`, pass
`lowS: false`). See [Low-S signatures](#low-s-signatures).

### What happens if the user adds a new fingerprint or re-enrolls Face ID?

The OS permanently invalidates the key, and the next `sign()` is designed to reject with
`key_invalidated` (not yet confirmed on a device; on iOS it may currently surface as
`biometric_failed`, see [#1](https://github.com/umar-tariq-1/expo-secure-enclave/issues/1)). Call
`deleteKey()`, have the user authenticate another way, create a new key with
`getOrCreatePublicKey()`, and register it with your server. See the
[recipe](#handle-every-outcome).

### Can users fall back to their device passcode?

No, by design: signing requires a biometric on both platforms. If you want a passcode option,
offer a separate sign-in method (or see the [comparison](#when-to-use-this-and-when-to-use-something-else) for libraries that allow a
passcode).

### What happens when the user gets a new phone or restores a backup?

The key stays behind: it can't be backed up, synced, or moved. On the new device `hasKey()` is
`false`, and the user registers that device as new. Your server should allow several devices per
user and a recovery path that doesn't depend on any one device.

### Is this the same as passkeys?

No, though they're related. Passkeys (WebAuthn) are a standard protocol, usually synced across a
user's devices by their platform account, for signing in to websites and apps. This package gives
you a raw, device-bound key that never syncs, which you can use to sign anything: login challenges,
transaction approvals, API requests. Your server defines the protocol. If you only need standard
sign-in and want keys to sync between devices, passkeys are likely the better fit.

### Does it prove my app is genuine?

No. That's attestation (Apple App Attest, Android Key Attestation, Play Integrity), which this
package doesn't do. See the [security model](#what-it-doesnt-do).

### Can I have more than one key?

Yes. Pass an `alias` to every function, for example one per signed-in account:
`getOrCreatePublicKey('work')`, `sign(message, 'work')`.

### Does it support the New Architecture?

Yes. It's built with the Expo Modules API, and the example app builds with the New Architecture
enabled.

### Can I sign without showing a prompt every time?

No. Every signature needs a fresh biometric; that's the guarantee this package exists to give. If
you need silent signing, see the [comparison](#when-to-use-this-and-when-to-use-something-else).

### Does it work with bare React Native?

Yes, once the Expo Modules runtime is installed (`npx install-expo-modules@latest`). Add
`NSFaceIDUsageDescription` to `Info.plist` yourself, since config plugins don't run in bare
projects. See [Getting started](#bare-react-native-projects).

### How large a message can I sign?

There's no fixed limit, but the whole message crosses the native bridge, so keep it small: a
challenge, a canonical request string, or a SHA-256 hash of a large document.
<!-- end include -->

<!-- include docs/troubleshooting.md -->
## Troubleshooting

### `isAvailable()` is `false` on a real device

- **No biometric enrolled.** Enroll Face ID, Touch ID, or a fingerprint in the device settings.
- **Android: only a "weak" biometric.** This package requires a Class 3 (strong) biometric. On many
  phones, camera-based face unlock is Class 2, so enroll a fingerprint as well.
- **Biometrics locked out** after too many failed attempts. On iOS, unlock the device with the
  passcode; on Android, wait for the lockout to end or unlock with the device credential.
- **iOS: Face ID permission denied** for the app in Settings, or `NSFaceIDUsageDescription` missing
  from `Info.plist`. Check that the config plugin is in `app.json` and that you rebuilt the app
  after adding it.
- **The app was built without the native module** (Expo Go, or not rebuilt after installing the
  package). `getOrCreatePublicKey()` rejects with a message saying so.

### `sign()` rejects with `unavailable`

The same causes as above, checked at the moment of signing. On Android it also happens when no
activity is in the foreground to show the prompt on, for example when `sign()` is called while the
app is in the background. `error.message` has the platform's detail.

### `sign()` rejects with `key_invalidated`

The key for that alias doesn't exist, or a biometric change invalidated it. It will never sign
again: call `deleteKey()`, then `getOrCreatePublicKey()`, and register the new public key after the
user authenticates another way ([recipe](#handle-every-outcome)). `hasKey()` can still
be `true` for an invalidated key.

### Cancelling the iOS prompt reports `biometric_failed` instead of `cancelled`

Which native error iOS reports for a cancelled prompt hasn't been confirmed on every iOS version.
If you see this, please open an issue with the end of `error.message`, which includes the native
error domain and code, for example `(com.apple.LocalAuthentication -2)`.

### The server rejects valid-looking signatures

Check, in order:

1. **The bytes.** The server must verify exactly the string or bytes passed to `sign()`. Send the
   signed string itself; don't rebuild it from parsed JSON.
2. **Low S.** If a seemingly random share of signatures fails, your library rejects high-S ones. See
   [Low-S signatures](#low-s-signatures).
3. **Hashing.** Don't hash the message yourself before passing it to a verify function that hashes.
4. **Formats.** The signature is DER, not raw `r ‖ s`; the public key is a raw X9.63 point, not
   SPKI; both are standard base64, not base64url. See
   [conversions](#converting-the-public-key).
5. **The key.** After a `key_invalidated` and re-registration, the device has a new public key.

Test your verifier against the [test vectors](#test-vectors).

### Jest: `SyntaxError: Cannot use import statement outside a module`

A test imported the real package, whose `verify()` depends on the ES-module-only `@noble/curves`.
Either use the [Jest mock](#the-jest-mock), or add `@noble` to `transformIgnorePatterns`
as shown in [Testing without the mock](#testing-without-the-mock).

### Android build: `Could not find androidx.biometric:biometric:1.4.0`

Version 0.1.0 of this package depended on an `androidx.biometric` release that was never
published. Upgrade to 0.2.0 or later.

### iOS build: errors in `RuntimeScheduler.h` with Xcode 26.3

`'RuntimeScheduler' cannot be annotated with either SWIFT_RETURNS_RETAINED or
SWIFT_RETURNS_UNRETAINED` comes from `expo-modules-jsi` 57.1.1, not from this package. Update Expo
to the latest SDK 57 patch release (`npx expo install expo@^57`), which brings `expo-modules-jsi`
57.1.2, then run `npx pod-install`.

### Still stuck?

[Open an issue](https://github.com/umar-tariq-1/expo-secure-enclave/issues) with the platform, OS
version, device model, the `reason` and full `message` of the error, and whether `isAvailable()`
was `true`.
<!-- end include -->

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md). To report a
security vulnerability, please don't open a public issue: email the maintainer at the address in
`package.json`.

## License

[MIT](./LICENSE)
