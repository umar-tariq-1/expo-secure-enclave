import { p256 } from '@noble/curves/nist.js';

import type { ExpoSecureEnclaveNativeModule } from './ExpoSecureEnclave.types';
import ExpoSecureEnclaveModule from './ExpoSecureEnclaveModule';
import { DEFAULT_ALIAS, SecureEnclaveError, decodeBase64, encodeBase64, toBytes } from './shared';

/**
 * Hardware-backed ECDSA P-256 signing for Expo and React Native. Keys are generated in the iOS
 * Secure Enclave or the Android Keystore (StrongBox-backed where available) and never leave it;
 * every `sign()` requires a fresh Face ID, Touch ID, or fingerprint check, with no passcode
 * fallback. Public keys are base64 X9.63 points and signatures are base64 DER ECDSA/SHA-256, the
 * same on both platforms, so any P-256 library can verify them on a server.
 *
 * Every rejection is a {@link SecureEnclaveError} whose `reason` is one of four values. Only
 * `sign()` prompts, and only `sign()` can reject with anything other than `unavailable`.
 *
 * Docs: https://github.com/umar-tariq-1/expo-secure-enclave#readme
 *
 * @example
 * ```ts
 * import * as SecureEnclave from 'expo-secure-enclave';
 *
 * if (await SecureEnclave.isAvailable()) {
 *   const publicKey = await SecureEnclave.getOrCreatePublicKey(); // no prompt: register it once
 *   const signature = await SecureEnclave.sign(challengeFromServer); // biometric prompt
 *   // send { signature } to your server, which verifies it against publicKey
 * }
 * ```
 *
 * @packageDocumentation
 */
export { SecureEnclaveError } from './shared';
export type { SecureEnclaveErrorReason } from './ExpoSecureEnclave.types';

/**
 * Collapses any rejection into a `SecureEnclaveError`. Only `sign()` shows a prompt or uses the
 * private key, so it is the only call that can fail as `cancelled`, `biometric_failed`, or
 * `key_invalidated`; every other call that fails is, by definition, `unavailable`.
 */
function classifyError(error: unknown, { fromSign }: { fromSign: boolean }): SecureEnclaveError {
  if (error instanceof SecureEnclaveError) return error;
  const message = error instanceof Error ? error.message : undefined;
  if (!fromSign) return new SecureEnclaveError('unavailable', message);
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  switch (code) {
    case 'E_CANCELLED':
      return new SecureEnclaveError('cancelled', message);
    case 'E_KEY_INVALIDATED':
      return new SecureEnclaveError('key_invalidated', message);
    case 'E_UNAVAILABLE':
      return new SecureEnclaveError('unavailable', message);
    // An unrecognised failure from the signing call itself happened at or after the prompt, so it
    // is reported as a failed (retryable) attempt rather than as missing hardware.
    case 'E_BIOMETRIC_FAILED':
    default:
      return new SecureEnclaveError('biometric_failed', message);
  }
}

const MODULE_MISSING_MESSAGE =
  "expo-secure-enclave: this build doesn't include the native module. It needs a development " +
  'build (it is not part of Expo Go); if you just installed the package, rebuild the app.';

// The native module is missing only in Expo Go or a stale build. There, no key can exist, so the
// read-only calls answer as on a device with no hardware (`false`, no-op), and anything that would
// need a key rejects as `unavailable`.
function requireModule(): ExpoSecureEnclaveNativeModule {
  if (!ExpoSecureEnclaveModule) throw new SecureEnclaveError('unavailable', MODULE_MISSING_MESSAGE);
  return ExpoSecureEnclaveModule;
}

/**
 * Whether this device can create a key and sign right now. Never prompts and never creates
 * anything.
 *
 * - iOS: a Secure Enclave is present and `LAContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)`
 *   succeeds (Face ID or Touch ID enrolled, a passcode set, not locked out, not denied to the app).
 *   Always `false` in the iOS Simulator.
 * - Android: `BiometricManager.canAuthenticate(BIOMETRIC_STRONG)` succeeds, i.e. a Class 3
 *   (strong) biometric is enrolled and usable. A Class 2 ("weak") biometric alone is not enough.
 * - Web, Expo Go, or a build without the native module: always `false`.
 *
 * `false` is exactly when creating a key or signing would reject with `unavailable`. It can change
 * while the app runs, so check it close to where you use it.
 *
 * @returns `true` if `getOrCreatePublicKey()` can create a key and `sign()` can prompt.
 * @throws {SecureEnclaveError} `unavailable`, only if the native check itself fails unexpectedly.
 *
 * @example
 * ```ts
 * if (!(await SecureEnclave.isAvailable())) {
 *   showPasswordSignIn(); // your fallback
 * }
 * ```
 */
export async function isAvailable(): Promise<boolean> {
  if (!ExpoSecureEnclaveModule) return false;
  try {
    return await ExpoSecureEnclaveModule.isAvailable();
  } catch (error) {
    throw classifyError(error, { fromSign: false });
  }
}

/**
 * Whether a key exists for `alias` on this device. Never prompts.
 *
 * An existing key isn't necessarily usable: on Android a key invalidated by a biometric change
 * still exists until deleted (on iOS this is unconfirmed), so handle `key_invalidated` from
 * `sign()` too. Resolves `false` on web, in Expo Go, and in builds without the native module.
 *
 * @param alias - Which key. Defaults to `"default"`.
 * @throws {SecureEnclaveError} `unavailable`, if the Keychain or Keystore can't be read.
 *
 * @example
 * ```ts
 * const registered = await SecureEnclave.hasKey();
 * ```
 */
export async function hasKey(alias: string = DEFAULT_ALIAS): Promise<boolean> {
  if (!ExpoSecureEnclaveModule) return false;
  try {
    return await ExpoSecureEnclaveModule.hasKey(alias);
  } catch (error) {
    throw classifyError(error, { fromSign: false });
  }
}

/**
 * Returns `alias`'s public key, creating the key pair in the Secure Enclave or Keystore first if
 * it doesn't exist yet. Never prompts, including on first creation: only `sign()` uses the key.
 *
 * Creating a key requires exactly what `isAvailable()` checks. An existing key's public key is
 * returned as is, even if the OS has invalidated it, so call `deleteKey()` first when you need a
 * fresh key.
 *
 * Call it when registering the device, and store the result on your server.
 *
 * @param alias - Which key. Defaults to `"default"`.
 * @returns Standard base64 (88 characters) of the 65-byte uncompressed X9.63 point
 *   `0x04 ‖ X(32) ‖ Y(32)`. Identical format on iOS and Android. To get SPKI DER, prepend the hex
 *   header `3059301306072a8648ce3d020106082a8648ce3d030107034200`.
 * @throws {SecureEnclaveError} `unavailable`: no usable hardware or biometric, iOS Simulator, web,
 *   Expo Go, or a Keychain/Keystore failure.
 *
 * @example
 * ```ts
 * const publicKey = await SecureEnclave.getOrCreatePublicKey();
 * await fetch('https://api.example.com/devices', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ publicKey }),
 * });
 * ```
 */
export async function getOrCreatePublicKey(alias: string = DEFAULT_ALIAS): Promise<string> {
  try {
    return await requireModule().getOrCreatePublicKey(alias);
  } catch (error) {
    throw classifyError(error, { fromSign: false });
  }
}

/**
 * Signs `message` with `alias`'s private key inside the Secure Enclave or Keystore. Always shows
 * the system biometric prompt first; there is no way to sign without a fresh, successful
 * biometric, and no device-passcode fallback.
 *
 * Checks run in the same order on both platforms: device state (`unavailable`), then the key
 * (`key_invalidated`), then the prompt (`cancelled` or `biometric_failed`). On Android the prompt
 * reads "Authenticate" / "Confirm your identity to sign" / "Cancel"; these texts can't be changed
 * yet. Await one `sign()` before starting another.
 *
 * @param message - A string is signed as its UTF-8 bytes; a `Uint8Array` exactly as given. Nothing
 *   is added, so your server must verify the same bytes. Keep it compact (a challenge, a canonical
 *   request string, or a hash): it crosses the native bridge in full.
 * @param alias - Which key. Defaults to `"default"`.
 * @returns Standard base64 of a DER `SEQUENCE { r, s }` ECDSA P-256 signature over SHA-256 of
 *   `message` (usually 70 to 72 bytes). S is not normalized, so verifiers must accept high-S
 *   signatures. JOSE and Web Crypto need it converted to the raw 64-byte `r ‖ s` form.
 * @throws {SecureEnclaveError} with `reason`:
 *   - `cancelled`: the prompt was dismissed. Nothing to report.
 *   - `biometric_failed`: not recognized, timed out, or an unclassified signing failure. Retry.
 *   - `key_invalidated`: no key for `alias`, or the OS invalidated it after a biometric change. It
 *     can never sign again: `deleteKey()`, then `getOrCreatePublicKey()`, and register the new key
 *     after the user authenticates another way.
 *   - `unavailable`: no usable biometric right now (none enrolled, locked out, no hardware,
 *     Simulator, web, Expo Go), or on Android no foreground activity. Fall back.
 *
 * @example
 * ```ts
 * try {
 *   const signature = await SecureEnclave.sign(challenge);
 *   await sendToServer({ challenge, signature });
 * } catch (error) {
 *   if (error instanceof SecureEnclave.SecureEnclaveError && error.reason === 'cancelled') return;
 *   throw error;
 * }
 * ```
 */
export async function sign(
  message: string | Uint8Array,
  alias: string = DEFAULT_ALIAS
): Promise<string> {
  try {
    return await requireModule().sign(alias, encodeBase64(toBytes(message)));
  } catch (error) {
    throw classifyError(error, { fromSign: true });
  }
}

/**
 * Deletes `alias`'s key pair. Never prompts. Deleting a key that doesn't exist is a no-op, not an
 * error. A deleted key can never sign again, though its past signatures still verify against its
 * public key.
 *
 * @param alias - Which key. Defaults to `"default"`.
 * @throws {SecureEnclaveError} `unavailable`, if the Keychain or Keystore can't be written.
 *
 * @example
 * ```ts
 * await SecureEnclave.deleteKey();
 * const freshPublicKey = await SecureEnclave.getOrCreatePublicKey();
 * ```
 */
export async function deleteKey(alias: string = DEFAULT_ALIAS): Promise<void> {
  if (!ExpoSecureEnclaveModule) return;
  try {
    await ExpoSecureEnclaveModule.deleteKey(alias);
  } catch (error) {
    throw classifyError(error, { fromSign: false });
  }
}

/**
 * Checks a `sign()` signature against a `getOrCreatePublicKey()` public key, in pure JavaScript,
 * synchronously, with no native call or device. Accepts both low-S and high-S signatures. Useful
 * in tests and for local checks; your server must still verify signatures itself.
 *
 * @param publicKeyBase64 - From `getOrCreatePublicKey()`.
 * @param message - Exactly what was passed to `sign()`.
 * @param signatureBase64 - From `sign()`.
 * @returns `true` for a valid signature; `false` for an invalid one or malformed input. Never
 *   throws.
 *
 * @example
 * ```ts
 * const ok = SecureEnclave.verify(publicKey, 'hello', signature);
 * ```
 */
export function verify(
  publicKeyBase64: string,
  message: string | Uint8Array,
  signatureBase64: string
): boolean {
  try {
    // `lowS: false`: neither the Secure Enclave nor the Android Keystore guarantees a low S, so
    // genuine signatures can be high-S, which noble rejects by default.
    return p256.verify(
      decodeBase64(signatureBase64),
      toBytes(message),
      decodeBase64(publicKeyBase64),
      {
        prehash: true,
        format: 'der',
        lowS: false,
      }
    );
  } catch {
    return false;
  }
}
