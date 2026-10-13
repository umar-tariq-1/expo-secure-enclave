---
title: Troubleshooting
nav_order: 10
description: "Fixes for common expo-secure-enclave problems: isAvailable() returning false, unavailable and key_invalidated errors, server-side signature failures, Jest import errors, and build failures."
---

# Troubleshooting

## `isAvailable()` is `false` on a real device

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

## `sign()` rejects with `unavailable`

The same causes as above, checked at the moment of signing. On Android it also happens when no
activity is in the foreground to show the prompt on, for example when `sign()` is called while the
app is in the background. `error.message` has the platform's detail.

## `sign()` rejects with `key_invalidated`

The key for that alias doesn't exist, or a biometric change invalidated it. It will never sign
again: call `deleteKey()`, then `getOrCreatePublicKey()`, and register the new public key after the
user authenticates another way ([recipe](recipes.md#handle-every-outcome)). `hasKey()` can still
be `true` for an invalidated key.

## Cancelling the iOS prompt reports `biometric_failed` instead of `cancelled`

Which native error iOS reports for a cancelled prompt hasn't been confirmed on every iOS version.
If you see this, please open an issue with the end of `error.message`, which includes the native
error domain and code, for example `(com.apple.LocalAuthentication -2)`.

## The server rejects valid-looking signatures

Check, in order:

1. **The bytes.** The server must verify exactly the string or bytes passed to `sign()`. Send the
   signed string itself; don't rebuild it from parsed JSON.
2. **Low S.** If roughly half the signatures fail, your library rejects high-S signatures. See
   [Low-S signatures](server-verification.md#low-s-signatures).
3. **Hashing.** Don't hash the message yourself before passing it to a verify function that hashes.
4. **Formats.** The signature is DER, not raw `r ‖ s`; the public key is a raw X9.63 point, not
   SPKI; both are standard base64, not base64url. See
   [conversions](server-verification.md#converting-the-public-key).
5. **The key.** After a `key_invalidated` and re-registration, the device has a new public key.

Test your verifier against the [test vectors](server-verification.md#test-vectors).

## Jest: `SyntaxError: Cannot use import statement outside a module`

A test imported the real package, whose `verify()` depends on the ES-module-only `@noble/curves`.
Either use the [Jest mock](testing.md#the-jest-mock), or add `@noble` to `transformIgnorePatterns`
as shown in [Testing without the mock](testing.md#testing-without-the-mock).

## Android build: `Could not find androidx.biometric:biometric:1.4.0`

Version 0.1.0 of this package depended on an `androidx.biometric` release that was never
published. Upgrade to 0.2.0 or later.

## iOS build: errors in `RuntimeScheduler.h` with Xcode 26.3

`'RuntimeScheduler' cannot be annotated with either SWIFT_RETURNS_RETAINED or
SWIFT_RETURNS_UNRETAINED` comes from `expo-modules-jsi` 57.1.1, not from this package. Update Expo
to the latest SDK 57 patch release (`npx expo install expo@^57`), which brings `expo-modules-jsi`
57.1.2, then run `npx pod-install`.

## Still stuck?

[Open an issue](https://github.com/umar-tariq-1/expo-secure-enclave/issues) with the platform, OS
version, device model, the `reason` and full `message` of the error, and whether `isAvailable()`
was `true`.
