---
title: Getting started
nav_order: 2
description: "Install expo-secure-enclave in an Expo or bare React Native app, configure the Face ID usage description, and sign a first challenge with a hardware-backed key."
---

# Getting started

## Requirements

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

## Installation

### Expo projects

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

### Bare React Native projects

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

## Quick start

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
[device registration recipe](recipes.md#register-a-device) also proves, at registration time, that
the device really holds the private key, and the [recipes](recipes.md) cover what to do for each
error `reason`.

For a local sanity check without a server, `SecureEnclave.verify(publicKey, challenge, signature)`
returns `true` for a valid signature.

Next:

- [Recipes](recipes.md) for complete client and server code: device registration, passwordless
  sign-in, transaction approval, and handling a key invalidated by a biometric change.
- [Server-side verification](server-verification.md) for verifying in Node.js, Python, Go, Java,
  and more.
- [API reference](api.md) for every function and error reason.
