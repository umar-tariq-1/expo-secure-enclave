// Resolved through `expo` itself (a peer dependency every Expo app already has), not
// `@expo/config-plugins` directly, so this always runs against the same config-plugins version
// the consuming app's own Expo CLI uses.
const { withInfoPlist } = require('expo/config-plugins');

const DEFAULT_USAGE_DESCRIPTION = 'This app uses Face ID to protect a hardware-backed signing key.';

/**
 * Injects `NSFaceIDUsageDescription` into Info.plist: required by iOS the moment any code path
 * touches a Face-ID-gated Keychain item or Secure Enclave key (which `sign()` always does), or the
 * app is rejected at App Store review / crashes on launch of that code path. Nothing is needed on
 * Android: `androidx.biometric` declares its own `USE_BIOMETRIC` permission in its manifest, which
 * Gradle merges into the app automatically, so there is nothing for this plugin to add there.
 *
 * Usage in app.config.ts / app.json:
 *   plugins: [["expo-secure-enclave", { faceIdUsageDescription: "..." }]]
 * The option is optional; a sensible default is used if omitted.
 */
function withExpoSecureEnclave(config, props) {
  const usageDescription = props?.faceIdUsageDescription ?? DEFAULT_USAGE_DESCRIPTION;
  return withInfoPlist(config, (config) => {
    // Never overwrite a description the app already set for its own reasons (e.g. another
    // Face-ID-using package configured first); only fill it in if it's missing.
    if (!config.modResults.NSFaceIDUsageDescription) {
      config.modResults.NSFaceIDUsageDescription = usageDescription;
    }
    return config;
  });
}

module.exports = withExpoSecureEnclave;
