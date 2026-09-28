/** Why a `sign()` call rejected. Mirrors the four outcomes both native platforms classify into. */
export type SecureEnclaveErrorReason =
  /** The user dismissed the biometric prompt (a Cancel button, the system back gesture, ...). */
  | 'cancelled'
  /** The biometric check itself failed or timed out (wrong face/finger, too many attempts, lockout). */
  | 'biometric_failed'
  /** No key exists for this alias, or it was invalidated by a biometric enrollment change
   *  (Face ID/Touch ID re-enrolled, a new fingerprint added, ...). Not retryable: call
   *  `getOrCreatePublicKey()` again (or `deleteKey()` first) to mint a fresh key, then re-enrol its
   *  public key with your backend before signing with it. */
  | 'key_invalidated'
  /** No usable hardware/biometric on this device (Simulator, no Secure Enclave/Keystore, no
   *  biometric enrolled, or no foreground activity to show the prompt on Android). */
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
