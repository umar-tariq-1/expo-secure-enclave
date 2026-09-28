# expo-secure-enclave

[![npm version](https://img.shields.io/npm/v/expo-secure-enclave.svg)](https://www.npmjs.com/package/expo-secure-enclave)
[![license](https://img.shields.io/npm/l/expo-secure-enclave.svg)](./LICENSE)
[![platforms](https://img.shields.io/badge/platform-iOS%20%7C%20Android-informational)](#requirements)

**Hardware-backed ECDSA P-256 signing for Expo and React Native apps**, gated by Face ID, Touch
ID, or Android biometric prompt. The private key is generated inside — and never leaves — the
**iOS Secure Enclave** or the **Android Keystore / StrongBox**. Your app never sees the key
material; it only ever gets a signature back.

If you need to prove "this exact request came from this exact device, and a human just confirmed
it with their face or fingerprint" — approving a payment, authorising a sensitive action, signing
a request to your backend — this is the primitive for it.

## Why hardware-backed signing

A key stored in `AsyncStorage`, or even in the OS keychain without hardware backing, still passes
through your app's memory to be used. On a compromised or jailbroken/rooted device, that's a key
an attacker can eventually read. A **Secure Enclave** (iOS) or **StrongBox/TEE-backed Keystore**
(Android) key never does that: signing happens inside a physically separate secure processor, and
the OS enforces the biometric check at the hardware level — no amount of app-level code can be
tricked into skipping it, because the app never holds the key to skip it with.

## Install

```sh
npx expo install expo-secure-enclave
```

Add the config plugin to `app.json` / `app.config.ts` (it wires up iOS's `NSFaceIDUsageDescription`
automatically — Android needs no manifest changes):

```json
{
  "expo": {
    "plugins": ["expo-secure-enclave"]
  }
}
```

Then rebuild the native app (`npx expo prebuild` / a new development build) — like any package
with native code, this is not available in Expo Go.

## Quick start

```ts
import * as SecureEnclave from 'expo-secure-enclave';

// 1. Once, e.g. at account setup: create the key and send its public half to your backend.
const publicKey = await SecureEnclave.getOrCreatePublicKey(); // base64, no biometric prompt
await fetch('/enrol', { method: 'POST', body: JSON.stringify({ publicKey }) });

// 2. Whenever you need proof of presence: sign the exact thing you're asking the user to approve.
const payload = JSON.stringify({ action: 'transfer', amount: 42, to: 'acct_123' });
try {
  const signature = await SecureEnclave.sign(payload); // prompts Face ID / Touch ID / biometric
  await fetch('/approve', { method: 'POST', body: JSON.stringify({ payload, signature }) });
} catch (error) {
  if (error instanceof SecureEnclave.SecureEnclaveError && error.reason === 'cancelled') {
    // the user backed out — not an error worth showing
  }
}
```

Your backend verifies `signature` against the `publicKey` it stored at enrolment, using any
standard ECDSA/P-256 (secp256r1) library — the signature is a base64 DER (ASN.1) encoding, the
same format essentially every crypto library expects.

## API

### `isAvailable(): Promise<boolean>`

Whether hardware-backed signing can be used right now: Secure Enclave/Keystore hardware present,
and a biometric enrolled. `false` in the Simulator and on web. Never prompts anything.

### `hasKey(alias?: string): Promise<boolean>`

Whether a key already exists for `alias` (default: `"default"`). Never prompts a biometric.

### `getOrCreatePublicKey(alias?: string): Promise<string>`

Returns the key's public half — creating the key pair first if needed — as a base64 **X9.63
uncompressed point** (`0x04 ‖ X(32) ‖ Y(32)`, 65 bytes), the standard encoding. Never prompts a
biometric, including on first creation.

### `sign(message: string | Uint8Array, alias?: string): Promise<string>`

Signs `message` (a string is UTF-8 encoded; bytes are used as-is) with the alias's private key.
**Always** prompts a live biometric check first — there is no way to call this without one, and no
device-passcode fallback. Returns a base64 **DER-encoded ECDSA/SHA-256 signature**.

Throws [`SecureEnclaveError`](#secureenclaveerror) on cancellation, biometric failure, an
invalidated key, or unavailable hardware.

### `deleteKey(alias?: string): Promise<void>`

Deletes the alias's key pair. Deleting an alias that doesn't exist is a no-op.

### `verify(publicKey: string, message: string | Uint8Array, signature: string): boolean`

Pure JS, no native call — verifies a `sign()` output against a `getOrCreatePublicKey()` output
locally. Useful for tests and local debugging; your backend should still be the source of truth
for anything security-relevant.

### `SecureEnclaveError`

```ts
class SecureEnclaveError extends Error {
  reason: 'cancelled' | 'biometric_failed' | 'key_invalidated' | 'unavailable';
}
```

| Reason | Meaning | What to do |
|---|---|---|
| `cancelled` | The user dismissed the prompt | Nothing — let them retry when ready |
| `biometric_failed` | The biometric check itself failed | Offer to try again |
| `key_invalidated` | Biometric enrolment changed, or no key exists | `deleteKey()` then `getOrCreatePublicKey()`, and re-enrol the new key with your backend |
| `unavailable` | No usable hardware/biometric on this device | Fall back to another auth method, or explain the requirement |

### Multiple keys

Pass your own `alias` to any function to keep more than one key (e.g. one per linked account):

```ts
await SecureEnclave.getOrCreatePublicKey('work-account');
await SecureEnclave.sign(payload, 'work-account');
```

## Requirements

| | |
|---|---|
| iOS | 16.4+, a device with Face ID/Touch ID and Secure Enclave hardware (all iPhones since the 5s) |
| Android | API 24+; StrongBox is used automatically where available (most 2019+ flagships), the TEE-backed Keystore everywhere else |
| Simulator/Emulator | `isAvailable()` returns `false` — there is no Secure Enclave in the iOS Simulator. Android emulators with a configured "Fingerprint" sensor in AVD settings do work |
| Expo Go | Not supported — this package has native code. Use a development build |

## How this compares

There are a few other packages in this space (`react-native-biometric`, `react-native-secure-sign`,
`react-native-device-binding`, among others) — worth comparing if you have specific needs. What
this one focuses on: identical, fully-typed behaviour on both platforms from day one, a config
plugin so there's no manual native-file editing, and a bundled `verify()` so you can round-trip
test signatures without standing up a backend first.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
