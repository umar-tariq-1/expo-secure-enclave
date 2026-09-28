import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoSecureEnclaveModule extends NativeModule<{}> {}

export default requireNativeModule<ExpoSecureEnclaveModule>('ExpoSecureEnclave');
