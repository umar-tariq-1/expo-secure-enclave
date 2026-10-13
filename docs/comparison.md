---
title: Comparison
nav_order: 8
description: "How expo-secure-enclave compares with expo-secure-store, expo-local-authentication, react-native-sensitive-info, react-native-biometrics, react-native-device-binding, react-native-secure-enclave-operations and other React Native signing libraries, and when each is the better fit."
---

# When to use this, and when to use something else

These libraries overlap in vocabulary (biometrics, Secure Enclave, Keystore) but solve different
problems. The facts below come from each package's own README and native source code, as of
October 2026. If something here is out of date, please
[open an issue](https://github.com/umar-tariq-1/expo-secure-enclave/issues).

## Quick guide

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

## Comparison table

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

## Where another library fits better

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

## Where this package fits

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
  verified on a device yet (see [Status](index.md#status)).
