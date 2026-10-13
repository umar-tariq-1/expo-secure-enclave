import { registerWebModule, NativeModule } from 'expo';

import type { ExpoSecureEnclaveNativeModule } from './ExpoSecureEnclave.types';

// There is no Secure Enclave / Keystore equivalent in a browser. `isAvailable()` says so plainly,
// and no key ever exists here, so `hasKey()` is `false` and `deleteKey()` is a no-op. Creating a key
// or signing rejects, so an app that imports this package universally (e.g. a shared component tree
// that also renders on web) doesn't crash at import time, only if it actually tries to use hardware
// signing on a platform that has none.
const UNAVAILABLE_MESSAGE =
  'expo-secure-enclave: no Secure Enclave or Keystore equivalent exists on web.';

// The same `code` the native modules use, so `src/index.ts` classifies it as `unavailable`.
function unavailableError(): Error {
  return Object.assign(new Error(UNAVAILABLE_MESSAGE), { code: 'E_UNAVAILABLE' });
}

class ExpoSecureEnclaveModule extends NativeModule implements ExpoSecureEnclaveNativeModule {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async hasKey(_alias: string): Promise<boolean> {
    return false;
  }
  async getOrCreatePublicKey(_alias: string): Promise<string> {
    throw unavailableError();
  }
  async sign(_alias: string, _messageBase64: string): Promise<string> {
    throw unavailableError();
  }
  async deleteKey(_alias: string): Promise<void> {}
}

export default registerWebModule(ExpoSecureEnclaveModule, 'ExpoSecureEnclave');
