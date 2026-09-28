import { registerWebModule, NativeModule } from 'expo';

// ExpoSecureEnclaveModule is not available on the web platform.
class ExpoSecureEnclaveModule extends NativeModule<{}> {}

export default registerWebModule(ExpoSecureEnclaveModule, 'ExpoSecureEnclaveModule');
