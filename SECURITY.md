# Security policy

## Supported versions

Only the latest published version receives fixes. Version 0.1.0 can't be built for Android (it
depends on a library version that was never published); upgrade to the latest release.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately instead, by either:

- GitHub's private vulnerability reporting: the **Security** tab of this repository, then
  **Report a vulnerability**; or
- email to official.umartariq@gmail.com.

Please include the package version, platform, OS version and device model, the steps to
reproduce, and what an attacker could achieve. This is a one-person open-source project, so
responses are best effort, but security reports are handled before anything else. Once a fix is
released, the issue is disclosed in the changelog and a GitHub security advisory, crediting you
unless you'd rather not be named.

## What counts as a vulnerability

This package's job is to guarantee a few specific things (see the
[security model](docs/security-model.md)). A way to break any of them is a vulnerability, for
example:

- producing a valid signature without a successful biometric check, or through a device-passcode
  fallback;
- private key material becoming readable by JavaScript, by the app's native code, or by another
  app;
- a key remaining usable after the OS should have invalidated it (for example, after a fingerprint
  is added);
- one alias's key being used to sign for another alias;
- `verify()` accepting a signature that isn't valid for the given key and message;
- the Jest mock, which uses software keys, being reachable from production app code.

## What doesn't

These are documented limitations rather than vulnerabilities:

- The package does no key or app attestation, so a server can't prove a public key came from
  secure hardware or from your genuine app.
- On a compromised device, code running inside your app can request a signature and show the user
  a misleading screen; the user still has to present their biometric.
- Replaying a signature against a server that doesn't use single-use challenges.
- Behavior of the Secure Enclave, Android Keystore, BiometricPrompt, LocalAuthentication, or Expo
  themselves: please report those to Apple, Google, or Expo.

If you're unsure, report it privately anyway.
