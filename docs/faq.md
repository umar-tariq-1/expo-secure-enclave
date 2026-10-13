---
title: FAQ
nav_order: 9
description: "Answers about using the Secure Enclave and Android Keystore from Expo and React Native: Expo Go, the iOS Simulator, storing passwords, verifying signatures on a server, biometric changes, passkeys, and more."
---

# FAQ

## How do I use the Secure Enclave in an Expo app?

Install this package with `npx expo install expo-secure-enclave`, add `"expo-secure-enclave"` to
the `plugins` in `app.json`, and make a development build. `getOrCreatePublicKey()` creates a P-256
key inside the Secure Enclave (or the Android Keystore) and returns its public key;
`sign(message)` signs with it after a Face ID, Touch ID, or fingerprint check. See
[Getting started](getting-started.md).

## Does it work in Expo Go?

No. Expo Go only contains the native modules that ship with it, and this isn't one of them. Use a
development build (`npx expo run:ios`, `npx expo run:android`, or EAS Build). Importing the package
in Expo Go is safe, though: `isAvailable()` resolves `false`, so the same code can fall back
gracefully.

## Does it work on the iOS Simulator or an Android emulator?

The iOS Simulator has no Secure Enclave, so `isAvailable()` is always `false` there and signing
rejects with `unavailable`. Test on a physical iPhone. An Android emulator with a fingerprint
enrolled (through the emulator's extended controls) is expected to work but hasn't been tested yet,
and its keys aren't hardware-backed.

## Can I store a password or API token in the Secure Enclave with this?

No. The Secure Enclave only holds elliptic curve signing keys, and this package only creates keys
and signs with them. To store a secret, use
[expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) (or
[react-native-sensitive-info](https://www.npmjs.com/package/react-native-sensitive-info)). Often you
don't need a stored secret at all: a device key that signs server challenges replaces a long-lived
token.

## How do I verify the signature on my server?

Store the public key from `getOrCreatePublicKey()` when the device registers. To verify, check the
base64 DER ECDSA/SHA-256 signature over the exact bytes the app signed, using any P-256 library.
[Server-side verification](server-verification.md) has tested code for Node.js, Web Crypto, `jose`,
Python, Go, Java, and OpenSSL, plus test vectors.

## Why does my server reject some valid signatures?

If it's a seemingly random share of them (often around half), your ECDSA library probably requires
"low-S" signatures. The Secure Enclave and Android Keystore don't guarantee that form, and both
forms are valid. Allow high S in your verifier (for `@noble/curves`, pass
`lowS: false`). See [Low-S signatures](server-verification.md#low-s-signatures).

## What happens if the user adds a new fingerprint or re-enrolls Face ID?

The OS permanently invalidates the key, and the next `sign()` is designed to reject with
`key_invalidated` (not yet confirmed on a device; on iOS it may currently surface as
`biometric_failed`, see [#1](https://github.com/umar-tariq-1/expo-secure-enclave/issues/1)). Call
`deleteKey()`, have the user authenticate another way, create a new key with
`getOrCreatePublicKey()`, and register it with your server. See the
[recipe](recipes.md#handle-every-outcome).

## Can users fall back to their device passcode?

No, by design: signing requires a biometric on both platforms. If you want a passcode option,
offer a separate sign-in method (or see the [comparison](comparison.md) for libraries that allow a
passcode).

## What happens when the user gets a new phone or restores a backup?

The key stays behind: it can't be backed up, synced, or moved. On the new device `hasKey()` is
`false`, and the user registers that device as new. Your server should allow several devices per
user and a recovery path that doesn't depend on any one device.

## Is this the same as passkeys?

No, though they're related. Passkeys (WebAuthn) are a standard protocol, usually synced across a
user's devices by their platform account, for signing in to websites and apps. This package gives
you a raw, device-bound key that never syncs, which you can use to sign anything: login challenges,
transaction approvals, API requests. Your server defines the protocol. If you only need standard
sign-in and want keys to sync between devices, passkeys are likely the better fit.

## Does it prove my app is genuine?

No. That's attestation (Apple App Attest, Android Key Attestation, Play Integrity), which this
package doesn't do. See the [security model](security-model.md#what-it-doesnt-do).

## Can I have more than one key?

Yes. Pass an `alias` to every function, for example one per signed-in account:
`getOrCreatePublicKey('work')`, `sign(message, 'work')`.

## Does it support the New Architecture?

Yes. It's built with the Expo Modules API, and the example app builds with the New Architecture
enabled.

## Can I sign without showing a prompt every time?

No. Every signature needs a fresh biometric; that's the guarantee this package exists to give. If
you need silent signing, see the [comparison](comparison.md).

## Does it work with bare React Native?

Yes, once the Expo Modules runtime is installed (`npx install-expo-modules@latest`). Add
`NSFaceIDUsageDescription` to `Info.plist` yourself, since config plugins don't run in bare
projects. See [Getting started](getting-started.md#bare-react-native-projects).

## How large a message can I sign?

There's no fixed limit, but the whole message crosses the native bridge, so keep it small: a
challenge, a canonical request string, or a SHA-256 hash of a large document.
