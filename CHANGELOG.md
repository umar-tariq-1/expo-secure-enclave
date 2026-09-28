# Changelog

## 0.1.0

Initial release.

- iOS: Secure Enclave P-256 key generation and ECDSA/SHA-256 signing, gated by Face ID/Touch ID.
- Android: Keystore/StrongBox P-256 key generation and signing, gated by `BiometricPrompt`.
- `isAvailable`, `hasKey`, `getOrCreatePublicKey`, `sign`, `deleteKey`, and a pure-JS `verify`.
- Config plugin: wires up `NSFaceIDUsageDescription` automatically.
- Multiple named keys via an optional `alias` parameter.

**Known gap**: the Android native module has not yet been exercised on a real device or emulator
(see the repo's own testing notes). Please report any issues you hit — this is a new package.
