# Changelog

## 0.2.0

The first release that compiles on both platforms: 0.1.0's Android code could not be built.
Upgrading is recommended for everyone, and some error reasons changed (see "Changed").

### Fixed

- **Android: builds failed.** 0.1.0 depended on `androidx.biometric:biometric:1.4.0`, a version that
  was never published. It now depends on `1.1.0`, the latest stable release.
- **Android: the module didn't compile.** `sign()` called a suspending function from a
  non-suspending function body, and the error class overrode a method Expo's `CodedException`
  doesn't have. Both fixed; the module compiles against Expo SDK 57.
- **iOS: `isAvailable()` was `true` on any physical device**, even with no Face ID or Touch ID
  enrolled. It now requires a Secure Enclave and an enrolled, usable biometric
  (`LAContext.canEvaluatePolicy`), matching Android.
- **Importing the package in Expo Go no longer throws.** Without the native module,
  `isAvailable()` and `hasKey()` resolve `false`, `deleteKey()` is a no-op, and
  `getOrCreatePublicKey()` and `sign()` reject with `unavailable`.
- **`isAvailable()` and `hasKey()` failures** are now `SecureEnclaveError`s instead of raw errors.

### Changed

- **Error reasons are now identical across platforms.** Every rejection from every function is a
  `SecureEnclaveError` with one of the four reasons, with the same meaning on iOS, Android, and web:
  - Biometric lockout is `unavailable` on both platforms (iOS reported `biometric_failed`).
  - Creating a key with no biometric enrolled is `unavailable` on Android (was `biometric_failed`).
  - Web rejections are `unavailable` (were `biometric_failed`).
  - Only `sign()` can reject with `cancelled`, `biometric_failed`, or `key_invalidated`. Every other
    function rejects only with `unavailable`.
- **Creating a key requires what `isAvailable()` checks.** `getOrCreatePublicKey()` rejects with
  `unavailable` instead of creating a key that could never sign. Returning an existing key's public
  key is unchanged.
- **Both platforms check device state before the key**, so `sign()` on a device with no usable
  biometric is `unavailable` regardless of the key's state, then a missing key is
  `key_invalidated`.
- Android: a key load failing with `UnrecoverableKeyException` is `key_invalidated`, and
  `ERROR_SECURITY_UPDATE_REQUIRED` is `unavailable`.
- iOS: signing error messages end with the native error domain and code, for diagnostics.
- Requires Expo SDK 57 (`expo >= 57` peer dependency).

### Added

- **Jest mock** at `expo-secure-enclave/mock`, with `mockControls` to simulate cancelled prompts,
  failed biometrics, invalidated keys, and devices without biometrics. It makes real P-256
  signatures and needs no Jest configuration under jest-expo.
- **Documentation**: a docs site in `docs/` (also included in the README), with recipes for device
  registration, passwordless sign-in, transaction approval, key invalidation and ES256 JWTs;
  server-side verification for Node.js, Web Crypto, `jose`, Python, Go, Java and OpenSSL, with test
  vectors; a security model; a comparison with other libraries; an FAQ; and troubleshooting.
  `llms.txt` is rewritten and `llms-full.txt` added.
- TSDoc with examples on every export.
- The example app logs every call's result, and includes a small local verification server.

### Package

- Published files are now an explicit allowlist; tooling configuration is no longer included.
- Removed the `attestation` keyword: this package doesn't do attestation.

### Known gaps

- The Android implementation compiles and the example app builds, but it has not yet been run on a
  physical device. The iOS changes in this release haven't been re-tested on a device either.
- Which native errors iOS reports for a cancelled prompt and for a biometric-invalidated key is not
  yet confirmed, so those two may surface as `biometric_failed`. See `example/TEST_PLAN.md`.

## 0.1.0

Initial release.

- iOS: Secure Enclave P-256 key generation and ECDSA/SHA-256 signing, gated by Face ID/Touch ID.
- Android: Keystore/StrongBox P-256 key generation and signing, gated by `BiometricPrompt`.
- `isAvailable`, `hasKey`, `getOrCreatePublicKey`, `sign`, `deleteKey`, and a pure-JS `verify`.
- Config plugin: wires up `NSFaceIDUsageDescription` automatically.
- Multiple named keys via an optional `alias` parameter.

**Known gap**: the Android native module has not yet been exercised on a real device or emulator
(see the repo's own testing notes). Please report any issues you hit, this is a new package.
