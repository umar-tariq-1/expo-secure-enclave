---
title: Home
nav_order: 1
description: "Hardware-backed ECDSA P-256 signing for Expo and React Native: keys made in the iOS Secure Enclave or Android Keystore/StrongBox, every signature gated by Face ID, Touch ID or fingerprint."
permalink: /
---

# expo-secure-enclave

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
a Face ID or fingerprint change; the [API reference](api.md#how-each-platform-maps-to-these-reasons)
marks each one. Device reports are very welcome, especially for Android: run the
[device test plan](https://github.com/umar-tariq-1/expo-secure-enclave/blob/main/example/TEST_PLAN.md)
and share the results with the [device test results form](https://github.com/umar-tariq-1/expo-secure-enclave/issues/new?template=device_test_report.yml).

<!-- site-only -->
## Where to next

- [Getting started](getting-started.md): requirements, installation, and a first signature.
- [API reference](api.md): every function, option, and error reason.
- [Recipes](recipes.md): device binding, passwordless sign-in, transaction approval, re-enrollment, JWTs.
- [Server-side verification](server-verification.md): Node.js, Web Crypto, Python, Go, Java, OpenSSL.
- [Testing](testing.md): the Jest mock.
- [Security model](security-model.md): what this protects against, and what it doesn't.
- [Comparison](comparison.md): when another library is the better fit.
- [FAQ](faq.md) and [Troubleshooting](troubleshooting.md).
<!-- /site-only -->
