import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { ExpoSecureEnclaveNativeModule } from './ExpoSecureEnclave.types';

declare class ExpoSecureEnclaveModule
  extends NativeModule
  implements ExpoSecureEnclaveNativeModule
{
  isAvailable(): Promise<boolean>;
  hasKey(alias: string): Promise<boolean>;
  getOrCreatePublicKey(alias: string): Promise<string>;
  sign(alias: string, messageBase64: string): Promise<string>;
  deleteKey(alias: string): Promise<void>;
}

// `null`, instead of a throw at import time, when this build has no native code for the module:
// Expo Go, or an app that wasn't rebuilt after installing this package. `src/index.ts` turns that
// into `isAvailable() === false` and `unavailable` rejections, so an app can feature-detect hardware
// signing instead of crashing on import.
export default requireOptionalNativeModule<ExpoSecureEnclaveModule>('ExpoSecureEnclave');
