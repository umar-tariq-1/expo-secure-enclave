---
title: Security model
nav_order: 7
description: "What expo-secure-enclave's hardware-backed keys protect against, what they don't, and how keys behave across biometric changes, backups, new devices, reinstalls and passcode removal."
---

# Security model and limitations

## What it guarantees

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

## What it doesn't do

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
  Sign server-issued, single-use, expiring challenges, as in the [recipes](recipes.md).
- **It doesn't identify a person.** It proves "an enrolled biometric on this device", not "this
  specific person": anyone whose fingerprint or face is enrolled on the device can sign.
- **It doesn't store secrets.** The Secure Enclave only holds 256-bit elliptic curve keys, and this
  package only signs. To keep a token or password on the device, use
  [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/).
- **It doesn't encrypt.** There is no encrypt, decrypt, or key-agreement API.
- **It only does ECDSA P-256 with SHA-256.** No RSA, no Ed25519, no other curves or hashes.

## Key lifecycle

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

## Your server's responsibilities

- Issue random, single-use, short-lived challenges, and include their purpose in the signed text.
- Verify against the exact bytes that were signed, accepting high-S signatures
  ([details](server-verification.md#low-s-signatures)).
- Register a public key only for an already-authenticated user, and require a signature over a
  registration challenge to prove the device holds the private key.
- Support several devices per user, let users revoke them, and provide a recovery path that
  doesn't depend on the device key, since keys are lost with the device, with a biometric change,
  or with a restore.
- Treat a re-registration after `key_invalidated` like adding a new device: authenticate the user
  another way first, because the old key can't vouch for the new one.
