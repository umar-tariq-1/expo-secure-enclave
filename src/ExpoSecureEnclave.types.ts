/**
 * Why a call rejected. Every rejection from this package is a `SecureEnclaveError` carrying exactly
 * one of these four reasons, with the same meaning on iOS, Android, and web.
 *
 * Only `sign()` can reject with `cancelled`, `biometric_failed`, or `key_invalidated`, because it is
 * the only call that shows a biometric prompt or uses the private key. Every other function
 * (`isAvailable`, `hasKey`, `getOrCreatePublicKey`, `deleteKey`) rejects only with `unavailable`.
 */
export type SecureEnclaveErrorReason =
  /** The prompt closed without a result: the user tapped Cancel or dismissed it, or the system
   *  dismissed it (for example because the app went to the background). Nothing to report; let the
   *  user try again when they choose to. */
  | 'cancelled'
  /** The biometric check ran and did not succeed (face or finger not recognised, the prompt timed
   *  out), or signing failed for a reason the platform didn't classify more precisely. Retrying may
   *  work. */
  | 'biometric_failed'
  /** This alias has no usable key: it was never created, was deleted, or the OS permanently
   *  invalidated it because the enrolled biometrics changed (a fingerprint or face was added or
   *  removed). Retrying never helps: call `deleteKey()`, then `getOrCreatePublicKey()`, and register
   *  the new public key with your backend before signing again. */
  | 'key_invalidated'
  /** Hardware-backed biometric signing can't be used here right now: no Secure Enclave or Keystore
   *  (iOS Simulator, web, Expo Go, an app not rebuilt after installing this package), no biometric
   *  enrolled, no device passcode, biometrics locked out after too many failed attempts, or, on
   *  Android, no foreground activity to show the prompt on. Retrying right away won't help: fall
   *  back to another method, or ask the user to finish setting up biometrics. This is also exactly
   *  the condition under which `isAvailable()` resolves `false`. */
  | 'unavailable';

/** Native module surface, as it crosses the bridge. Not exported for consumers to use directly:
 *  build against the top-level functions in `expo-secure-enclave` instead, which apply defaults
 *  (`alias`), normalize `string | Uint8Array` messages, and classify errors. */
export type ExpoSecureEnclaveNativeModule = {
  isAvailable(): Promise<boolean>;
  hasKey(alias: string): Promise<boolean>;
  getOrCreatePublicKey(alias: string): Promise<string>;
  sign(alias: string, messageBase64: string): Promise<string>;
  deleteKey(alias: string): Promise<void>;
};
