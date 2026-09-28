// Reexport the native module. On web, it will be resolved to ExpoSecureEnclaveModule.web.ts
// and on native platforms to ExpoSecureEnclaveModule.ts
export { default } from './ExpoSecureEnclaveModule';
export * from './ExpoSecureEnclave.types';
