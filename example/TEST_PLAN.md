# Device test plan

Checks to run on a physical iPhone and a physical Android phone, to confirm (or correct) how the
native code behaves where unit tests can't reach: prompts, cancellation, lockout, invalidation by a
biometric change, and devices without biometrics. The "Expected" column is what 0.2.0's code is
designed to do; several rows have never been observed on a device.

## Setup

1. Build and install the example on each device (see [README.md](./README.md)).
2. Optionally run `npm run server` and set the server URL in the app.
3. For every step, write down the **log entry** the app shows: the call, then either the value or
   `SecureEnclaveError reason=...` and the message. On iOS, signing errors end with the native
   error domain and code, such as `(NSOSStatusErrorDomain -128)`: record it exactly.
4. Record the device model and OS version. On Android, note whether the device has StrongBox (most
   Pixels since the Pixel 3 do; many others don't).

Use the alias `default` unless a step says otherwise. A log entry reading
`NOT a SecureEnclaveError` is always a bug.

## A. Normal flow

| # | Step | Expected |
|---|---|---|
| A1 | `isAvailable` with a biometric enrolled | `true` |
| A2 | `getOrCreatePublicKey` | An 88-character key, and **no biometric prompt at all**. (On an Android device without StrongBox, success here also confirms the StrongBox-to-TEE fallback.) |
| A3 | `hasKey` | `true` |
| A4 | `sign`, authenticate successfully | Prompt appears; an approximately 96-character base64 signature |
| A5 | `verify() in the app` | `true` |
| A6 | Get challenge, `sign`, Verify on server | Server prints `VALID`; app logs `{"valid":true}` |
| A7 | `getOrCreatePublicKey` again | The same key as A2, no prompt |
| A8 | Change the alias to `second`, `getOrCreatePublicKey`, `sign` | A different key; signing works; switching back to `default` still signs with the first key |

## B. Cancelling

| # | Step | Expected |
|---|---|---|
| B1 | `sign`, then tap Cancel | `reason=cancelled`. **iOS: record the domain and code.** If iOS reports `biometric_failed` here, that is the known open issue with iOS cancel mapping. |
| B2 | `sign`, then dismiss without Cancel: iOS swipe the app to the background; Android back gesture | `reason=cancelled` |

## C. A failed check

| # | Step | Expected |
|---|---|---|
| C1 | iOS: `sign` and make Face ID fail (cover your face or look away) until the sheet gives up, without tapping Cancel | `reason=biometric_failed`. Record the domain and code. |
| C2 | Android: `sign` and touch the sensor with an unenrolled finger once, then the right one | The wrong finger does **not** end the prompt; the right finger then signs successfully |

## D. Lockout

| # | Step | Expected |
|---|---|---|
| D1 | Fail the biometric repeatedly until the system locks it out (usually 5 failures; on iOS this can take several `sign` calls) | Android: the failing call reports `reason=unavailable`. iOS: the call that triggers lockout may report `biometric_failed`; record it. |
| D2 | `isAvailable` while locked out | iOS: `false`. Android: record the value (it's not known whether Android reports lockout here). |
| D3 | `sign` while locked out | `reason=unavailable`. iOS: **no prompt** should appear. Android: record whether a prompt flashed first. |
| D4 | Change alias to `locked`, `getOrCreatePublicKey` while locked out | iOS: `reason=unavailable`. Android: record. Change the alias back afterwards. |
| D5 | End the lockout (iOS: lock the device and unlock it with the passcode; Android: wait, or unlock with the PIN), then `sign` | Works, with the same key as before |

## E. Invalidation by a biometric change

| # | Step | Expected |
|---|---|---|
| E1 | `deleteKey`, `getOrCreatePublicKey`, `sign` | Works. Note the public key. |
| E2 | In Settings, **add** a fingerprint (Android, or a Touch ID iPhone), or on a Face ID iPhone set up an Alternate Appearance (or reset Face ID and set it up again). Return to the app. | |
| E3 | `isAvailable` | `true` |
| E4 | `hasKey` | Android: `true`. iOS: **record** (unknown). |
| E5 | `getOrCreatePublicKey` | Android: the old key from E1. iOS: **record** whether it's the old key, a new one, or an error. |
| E6 | `sign` | `reason=key_invalidated`. **iOS: record the domain and code**, and whether a prompt appeared first. If iOS reports `biometric_failed` instead, the iOS mapping needs fixing. |
| E7 | `deleteKey`, `getOrCreatePublicKey`, `sign` | A new key (different from E1), and signing works |
| E8 | Repeat E1 to E6, this time **removing** a fingerprint or face instead of adding one | Same as E3 to E6 |

## F. No biometric enrolled

| # | Step | Expected |
|---|---|---|
| F1 | With a key created (E7), remove every fingerprint and face in Settings, keeping the passcode | |
| F2 | `isAvailable` | `false` |
| F3 | `sign` | `reason=unavailable`, with no prompt |
| F4 | Change alias to `fresh`, `getOrCreatePublicKey` | `reason=unavailable` (no key is created). Change the alias back. |
| F5 | Enroll a biometric again, then `sign` with the old key | `reason=key_invalidated` (removing all biometrics invalidates the key). Record `hasKey` too. |
| F6 | `deleteKey`, `getOrCreatePublicKey`, `sign` | Works |

## G. Install, environment, and platform edge cases

| # | Step | Expected |
|---|---|---|
| G1 | Android, on a phone whose face unlock is Class 2 ("weak"): enroll only the face, no fingerprint | `isAvailable` is `false`, `sign` is `unavailable` |
| G2 | Create a key, uninstall the app, reinstall, `hasKey` | Android: `false`. iOS: **record** (Keychain items can survive an uninstall). If `true`, record whether `sign` works with it. |
| G3 | Run the example in **Expo Go** (`npx expo start`, then open it in Expo Go) | The app opens without crashing; `isAvailable` is `false`; `getOrCreatePublicKey` and `sign` show `reason=unavailable` with a message about needing a development build |
| G4 | Optional, destructive: remove the device passcode entirely, then set it and a biometric up again | Record `isAvailable`, `hasKey`, and `sign` for the old key afterwards (expected: the old key is unusable) |
| G5 | Sign on the iPhone and on the Android phone against the same server, about 10 times each | All `VALID`: same formats on both platforms. **Record** how many the server logs as `high S` versus `low S` per platform (both are valid; this confirms whether the hardware normalizes S). |

## Results

Copy this table and fill it in.

| Case | iOS device / version | iOS result | Android device / version | Android result |
|---|---|---|---|---|
| A1 to A8 | | | | |
| B1 | | | | |
| B2 | | | | |
| C1 / C2 | | | | |
| D1 | | | | |
| D2 | | | | |
| D3 | | | | |
| D4 | | | | |
| D5 | | | | |
| E3 to E6 | | | | |
| E7, E8 | | | | |
| F2 to F6 | | | | |
| G1 to G5 | | | | |

## Afterwards

- Any row that differs from "Expected" is either a bug in the code or a wrong assumption in the
  docs: open an issue with the log entries.
- Update the "Confirmed" column of the mapping table in `docs/api.md`, run `npm run docs`, and move
  confirmed items out of the "Known gaps" in `CHANGELOG.md`.
