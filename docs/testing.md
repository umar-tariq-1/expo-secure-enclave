---
title: Testing
nav_order: 6
description: "Unit-test code that uses expo-secure-enclave with the bundled Jest mock: simulate cancelled prompts, failed biometrics, invalidated keys and missing hardware, with real P-256 signatures."
---

# Testing

## The Jest mock

`expo-secure-enclave/mock` is an in-memory stand-in for the package, for Jest. It has the same
exports, signatures, formats, and error reasons, and makes real P-256 keys and signatures (with
Node's `crypto` module, so they're software keys, for tests only). Signatures from the mock verify
with the real `verify()` and on your server, and the mock's `verify()` accepts real device
signatures.

```ts
// jest.setup.ts (listed in "setupFiles"), or at the top of a test file
jest.mock('expo-secure-enclave', () => require('expo-secure-enclave/mock'));
```

With jest-expo's default configuration this needs no other changes.

```ts
import * as SecureEnclave from 'expo-secure-enclave';
import { mockControls } from 'expo-secure-enclave/mock';

beforeEach(() => mockControls.reset());

it('signs a challenge that verifies', async () => {
  const publicKey = await SecureEnclave.getOrCreatePublicKey();
  const signature = await SecureEnclave.sign('challenge');
  expect(SecureEnclave.verify(publicKey, 'challenge', signature)).toBe(true);
});

it('handles a cancelled prompt', async () => {
  await SecureEnclave.getOrCreatePublicKey();
  mockControls.failNextSign('cancelled');
  await expect(SecureEnclave.sign('challenge')).rejects.toMatchObject({ reason: 'cancelled' });
});

it('handles a biometric change', async () => {
  await SecureEnclave.getOrCreatePublicKey();
  mockControls.invalidateKeys();
  await expect(SecureEnclave.sign('challenge')).rejects.toMatchObject({ reason: 'key_invalidated' });
});

it('can spy on calls', async () => {
  const spy = jest.spyOn(SecureEnclave, 'sign');
  await SecureEnclave.getOrCreatePublicKey();
  await SecureEnclave.sign('challenge');
  expect(spy).toHaveBeenCalledWith('challenge');
});
```

### `mockControls`

| Control | Effect |
|---|---|
| `setAvailable(value)` | What `isAvailable()` resolves (default `true`). `false` behaves like a device without a usable biometric: creating a key and `sign()` reject `unavailable`; existing keys stay readable. |
| `failNextSign(reason)` | The next `sign()` that reaches the prompt rejects with `reason` instead of signing. Calls queue up, one per future `sign()`. |
| `invalidateKeys(alias?)` | Simulates a biometric change, for one alias or all. As on a device, `hasKey()` stays `true` and `getOrCreatePublicKey()` returns the old public key, but `sign()` rejects `key_invalidated` until the key is deleted and recreated. |
| `reset()` | No keys, available, nothing queued. Call it in `beforeEach`. |

The mock's `sign()` checks things in the device's order: availability (`unavailable`), then the key
(`key_invalidated`), then the queued prompt outcome.

## Testing without the mock

If a test imports the real package (for example, a component that renders on every platform),
that works too: there's no native module under Jest, so the package behaves as it does in Expo Go.
`isAvailable()` and `hasKey()` resolve `false`, `getOrCreatePublicKey()` and `sign()` reject with
`unavailable`, and `verify()` works normally.

The real package's `verify()` uses `@noble/curves`, which is published as ES modules only, and
jest-expo doesn't transform `node_modules/@noble` by default. Without a change you'll see
`SyntaxError: Cannot use import statement outside a module`. Add `@noble` to the
`transformIgnorePatterns` allowlist. With jest-expo 57 the full setting is:

```js
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@noble))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
```

This is jest-expo 57's default list plus `@noble`. Setting `transformIgnorePatterns` replaces the
preset's list, so keep the other entries. Tests that use the mock don't need this.

## What tests can't cover

The mock models the API contract, not the hardware: no real prompt, no Secure Enclave, no
Keystore, no OS-driven invalidation. Before relying on a flow in production, run it on physical
devices. The [example app](https://github.com/umar-tariq-1/expo-secure-enclave/tree/main/example)
and its [device test plan](https://github.com/umar-tariq-1/expo-secure-enclave/blob/main/example/TEST_PLAN.md)
are a starting point.
