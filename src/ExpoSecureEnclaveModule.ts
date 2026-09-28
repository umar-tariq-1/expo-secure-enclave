import { NativeModule, requireNativeModule } from 'expo';

import type { ExpoSecureEnclaveNativeModule } from './ExpoSecureEnclave.types';

declare class ExpoSecureEnclaveModule
  extends NativeModule<{}>
  implements ExpoSecureEnclaveNativeModule
{
  isAvailable(): Promise<boolean>;
  hasKey(alias: string): Promise<boolean>;
  getOrCreatePublicKey(alias: string): Promise<string>;
  sign(alias: string, messageBase64: string): Promise<string>;
  deleteKey(alias: string): Promise<void>;
}

export default requireNativeModule<ExpoSecureEnclaveModule>('ExpoSecureEnclave');
