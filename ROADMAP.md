# Roadmap

What's known to be incomplete, and what has to happen before the next release. There are no dates:
this is a one-person project.

## Device verification

0.2.0 was released without a full device pass: the iOS core flow was tested on a physical iPhone
with 0.1.0, and Android hasn't been run on a device yet.

- [ ] Run [`example/TEST_PLAN.md`](example/TEST_PLAN.md) on a physical iPhone and a physical
      Android phone (reports from anyone are welcome, through the "Device test results" issue form).
- [ ] If iOS reports a cancelled prompt as `biometric_failed` (test plan step B1), fix
      [iOS error classification](#ios-signing-errors-are-classified-by-error-code-alone).
- [ ] Fill in the "Confirmed" column of the error-mapping table in
      [`docs/api.md`](docs/api.md#how-each-platform-maps-to-these-reasons) from the results, and
      update the "Known gaps" in the changelog.

## Known issues

### iOS signing errors are classified by error code alone

Tracked in [#1](https://github.com/umar-tariq-1/expo-secure-enclave/issues/1).

`SecureEnclaveException.from(cfError:)` maps a failed `SecKeyCreateSignature` by `NSError.code`
only, ignoring the error domain. If iOS reports a cancelled prompt, or a key invalidated by a
biometric change, in another domain (for example `com.apple.LocalAuthentication`), it surfaces as
`biometric_failed` instead of `cancelled` or `key_invalidated`.

Since 0.2.0, iOS signing error messages end with `(domain code)`, so test plan steps B1, C1, D1 and
E6 show what iOS actually reports. The fix is to match on domain and code together, using the
observed values.

### The biometric prompt's text can't be customized or localized

Tracked in [#2](https://github.com/umar-tariq-1/expo-secure-enclave/issues/2).

- iOS: no prompt reason is passed to the system, so iOS shows its default text.
- Android: the prompt's title ("Authenticate"), subtitle ("Confirm your identity to sign"), and
  button ("Cancel") are fixed English strings.

A likely shape, additive and non-breaking: an optional third argument,
`sign(message, alias, { title, subtitle, cancelLabel })`, mapped to `BiometricPrompt.PromptInfo` on
Android and to the iOS prompt reason.

### Open question: can creating a key ever show a prompt?

Tracked in [#3](https://github.com/umar-tariq-1/expo-secure-enclave/issues/3).

The API promises that `getOrCreatePublicKey()` never prompts and only `sign()` does. That relies
on the platforms checking a key's access control when the key is used, not when it's created,
which is how Apple and Android document it, but it hasn't been observed on a device for this
package yet. Test plan steps A2, D4, and F4 check it. If creation can prompt on some OS version, the
documentation and that guarantee need revisiting.

## Not yet observed on a device

These are documented as expected behavior, pending device results:

- Anything on Android: the module compiles and the example app builds, but it hasn't run on a
  phone.
- The StrongBox-to-TEE fallback, on an Android device without StrongBox.
- Whether Android's `canAuthenticate(BIOMETRIC_STRONG)` reports a biometric lockout.
- Whether `hasKey()` on iOS reports a biometric-invalidated key as existing.
- Whether iOS keeps these keys across an app uninstall.
