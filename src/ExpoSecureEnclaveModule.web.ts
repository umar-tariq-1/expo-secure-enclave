import { registerWebModule, NativeModule } from 'expo';

import type { ExpoSecureEnclaveNativeModule } from './ExpoSecureEnclave.types';

// There is no Secure Enclave / Keystore equivalent in a browser. `isAvailable()` says so plainly;
// every other method rejects, so an app that imports this package universally (e.g. a shared
// component tree that also renders on web) doesn't crash at import time, only if it actually tries
// to use hardware signing on a platform that has none.
class ExpoSecureEnclaveModule extends NativeModule<{}> implements ExpoSecureEnclaveNativeModule {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async hasKey(_alias: string): Promise<boolean> {
    return false;
  }
  async getOrCreatePublicKey(_alias: string): Promise<string> {
    throw new Error('expo-secure-enclave: no Secure Enclave or Keystore equivalent exists on web.');
  }
  async sign(_alias: string, _messageBase64: string): Promise<string> {
    throw new Error('expo-secure-enclave: no Secure Enclave or Keystore equivalent exists on web.');
  }
  async deleteKey(_alias: string): Promise<void> {}
}

export default registerWebModule(ExpoSecureEnclaveModule, 'ExpoSecureEnclaveModule');
