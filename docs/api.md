---
title: API reference
nav_order: 3
description: "Every expo-secure-enclave function, its parameters and return values, the four SecureEnclaveError reasons, how each platform maps to them, and the exact key and signature formats."
---

# API reference

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

## isAvailable()

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

## hasKey()

```ts
function hasKey(alias?: string): Promise<boolean>;
```

Whether a key exists for `alias`. Never prompts.

A key the OS has invalidated after a biometric change still counts as existing on Android, so
`true` doesn't guarantee that `sign()` will succeed. Whether iOS reports such a key as existing
hasn't been confirmed on a device yet. Use `hasKey()` to decide whether to register a key, and
handle `key_invalidated` from `sign()` to detect invalidation.

Resolves `false` on web, in Expo Go, and in builds without the native module.

## getOrCreatePublicKey()

```ts
function getOrCreatePublicKey(alias?: string): Promise<string>;
```

Returns the public key for `alias`, creating the key pair first if it doesn't exist yet. Never
prompts a biometric, including the first time: only `sign()` uses the private key.

- **Returns** the public key as standard, padded base64 of the 65-byte uncompressed X9.63 point,
  `0x04 ‖ X(32) ‖ Y(32)` (88 characters). Identical format on iOS and Android. See
  [Server-side verification](server-verification.md) to convert it to SPKI, PEM, or JWK.
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

## sign()

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
  [Server-side verification](server-verification.md#low-s-signatures).
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

## deleteKey()

```ts
function deleteKey(alias?: string): Promise<void>;
```

Deletes `alias`'s key pair. Never prompts. Deleting a key that doesn't exist is a no-op, not an
error. A deleted key is gone permanently: signatures it made still verify against its public key,
but it can never sign again. Rejects only with `unavailable`.

## verify()

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

## SecureEnclaveError

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

## Error reasons

Only `sign()` can produce `cancelled`, `biometric_failed`, or `key_invalidated`, because it's the
only call that shows a prompt or uses the private key. Every other function rejects only with
`unavailable`.

| Reason | Meaning | What to do |
|---|---|---|
| `cancelled` | The prompt closed without a result: the user tapped Cancel or dismissed it, or the system dismissed it (for example, the app went to the background). | Nothing to report. Let the user try again when they want to. |
| `biometric_failed` | The biometric check ran but didn't succeed (face or finger not recognized, timeout), or signing failed in a way the platform didn't classify more precisely. | Offer to try again. |
| `key_invalidated` | This alias has no usable key: it was never created, was deleted, or the OS invalidated it because the enrolled biometrics changed. | Retrying never helps. Call `deleteKey()`, then `getOrCreatePublicKey()`, and register the new public key with your backend, after the user has authenticated some other way. See the [recipe](recipes.md#handle-every-outcome). |
| `unavailable` | Hardware-backed biometric signing can't be used here right now: no Secure Enclave or Keystore (iOS Simulator, web, Expo Go, an app not rebuilt after installing), no biometric enrolled, no passcode, biometrics locked out, or, on Android, no foreground activity. | Fall back to another method, or ask the user to set up biometrics. `isAvailable()` resolves `false` in exactly these situations. |

### How each platform maps to these reasons

"Confirmed" means observed on a physical device. Until then, a row describes what the code does,
based on the platform documentation.

| Situation | Reason | iOS | Android | Confirmed |
|---|---|---|---|---|
| No biometric enrolled, no passcode, no biometric hardware | `unavailable` | `canEvaluatePolicy` fails; checked before creating a key and before signing | `canAuthenticate(BIOMETRIC_STRONG)` fails; same checks | Not yet |
| Biometrics locked out after too many failures | `unavailable` | `canEvaluatePolicy` fails, so the next `sign()` is `unavailable`. The attempt that causes the lockout may report `biometric_failed`. | `ERROR_LOCKOUT` or `ERROR_LOCKOUT_PERMANENT` from the prompt | Not yet |
| User cancels or dismisses the prompt | `cancelled` | `errSecUserCanceled`. If iOS reports a cancel with a different error code, it currently surfaces as `biometric_failed` ([tracked](https://github.com/umar-tariq-1/expo-secure-enclave/issues)). | `ERROR_USER_CANCELED`, `ERROR_NEGATIVE_BUTTON`, `ERROR_CANCELED` | Not yet |
| Face or finger not recognized, timeout | `biometric_failed` | `errSecAuthFailed`, and any unrecognized signing error | `ERROR_TIMEOUT`, `ERROR_UNABLE_TO_PROCESS`, `ERROR_VENDOR`, and any other prompt error | Not yet |
| No key for this alias | `key_invalidated` | Keychain lookup finds nothing | Keystore has no such alias | Logic covered by unit tests |
| Key invalidated by a biometric change | `key_invalidated` | Expected via `errSecItemNotFound`; which error iOS actually reports is not yet confirmed | `KeyPermanentlyInvalidatedException` or `UnrecoverableKeyException` when loading the key | Not yet |
| No foreground activity to show the prompt on | `unavailable` | Not applicable | `sign()` checks for a `FragmentActivity` | Not yet |
| iOS Simulator, web, Expo Go, missing native module | `unavailable` | Simulator: compile-time check | Not applicable | Web and missing module covered by unit tests |
| Any failure in `isAvailable`, `hasKey`, `getOrCreatePublicKey`, or `deleteKey` | `unavailable` | All platforms | All platforms | Covered by unit tests |

On iOS, `SecureEnclaveError.message` for a signing failure ends with the native error domain and
code, for example `(NSOSStatusErrorDomain -128)`, which is what the device test plan records.

## Aliases and multiple keys

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

## Formats

| | Encoding | Size |
|---|---|---|
| Public key (`getOrCreatePublicKey`) | Standard base64 of the uncompressed X9.63 point `0x04 ‖ X ‖ Y` | 65 bytes (88 base64 characters) |
| Signature (`sign`) | Standard base64 of a DER `SEQUENCE { r, s }`, ECDSA P-256 with SHA-256; S not normalized | Usually 70 to 72 bytes |
| Message (`sign`, `verify`) | A string is used as its UTF-8 bytes; a `Uint8Array` as is | Keep it small |

Both platforms produce exactly these formats, so a signature verifies the same way whichever
platform made it. [Server-side verification](server-verification.md) shows how to verify them, and
how to convert to SPKI, PEM, JWK, or the raw `r ‖ s` form that JOSE and Web Crypto expect.

## Config plugin

```json
{ "expo": { "plugins": [["expo-secure-enclave", { "faceIdUsageDescription": "..." }]] } }
```

| Option | Default | Effect |
|---|---|---|
| `faceIdUsageDescription` | `"This app uses Face ID to protect a hardware-backed signing key."` | Sets iOS `NSFaceIDUsageDescription`, unless the app already sets it. |

There are no Android options.

## Jest mock

`expo-secure-enclave/mock` is an in-memory stand-in with the same exports, plus `mockControls`. See
[Testing](testing.md).
