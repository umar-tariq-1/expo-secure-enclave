import ExpoModulesCore
import Security

// A P-256 (secp256r1) key pair created and held ENTIRELY inside the Secure Enclave
// (`kSecAttrTokenIDSecureEnclave`): the private key never exists as bytes anywhere outside the
// Enclave, not even transiently in this module's memory. Every operation below hands the Security
// framework an opaque `SecKey` reference and asks IT to do the work — this module never sees, and
// could not leak, the private key itself.
//
// `[.privateKeyUsage, .biometryCurrentSet]` on the key's access control is what makes
// `SecKeyCreateSignature` refuse to run without a live, current biometric, and makes iOS
// invalidate the key automatically if the enrolled Face ID/Touch ID set changes — there is no app
// code that could get this gate wrong, because the Enclave itself enforces it.
//
// Reading a key's public half or checking whether it exists never touches the private key, so
// `hasKey`/`getOrCreatePublicKey` never prompt Face ID — only `sign` does.
public class ExpoSecureEnclaveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSecureEnclave")

    AsyncFunction("isAvailable") { () -> Bool in
      #if targetEnvironment(simulator)
      // No Secure Enclave hardware exists in the Simulator at all.
      return false
      #else
      var error: Unmanaged<CFError>?
      let accessControl = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        &error
      )
      return accessControl != nil
      #endif
    }

    AsyncFunction("hasKey") { (alias: String) -> Bool in
      return try ExpoSecureEnclaveModule.findKeyRef(alias: alias) != nil
    }

    AsyncFunction("getOrCreatePublicKey") { (alias: String) -> String in
      let keyRef = try ExpoSecureEnclaveModule.findKeyRef(alias: alias) ?? ExpoSecureEnclaveModule.createKey(alias: alias)
      guard let publicKeyRef = SecKeyCopyPublicKey(keyRef) else {
        throw SecureEnclaveException.unavailable("Could not derive the public key from the Enclave key.")
      }
      var error: Unmanaged<CFError>?
      guard let externalRepresentation = SecKeyCopyExternalRepresentation(publicKeyRef, &error) as Data? else {
        throw SecureEnclaveException.unavailable((error?.takeRetainedValue() as Error?)?.localizedDescription ?? "Could not export the public key.")
      }
      // Already the X9.63 uncompressed point (0x04 ‖ X(32) ‖ Y(32), 65 bytes) — the same encoding
      // this module's Android counterpart produces, so a public key exported on one platform
      // verifies identically on the other, and against any standard ECDSA P-256 verifier.
      return externalRepresentation.base64EncodedString()
    }

    AsyncFunction("sign") { (alias: String, messageBase64: String) -> String in
      guard let message = Data(base64Encoded: messageBase64) else {
        throw SecureEnclaveException.unavailable("The message to sign was not valid base64.")
      }
      guard let keyRef = try ExpoSecureEnclaveModule.findKeyRef(alias: alias) else {
        throw SecureEnclaveException.keyInvalidated()
      }
      var error: Unmanaged<CFError>?
      // Hashes the message internally (SHA-256) and returns a DER-encoded (ASN.1 SEQUENCE of r, s)
      // signature — the standard ECDSA signature encoding, verifiable with any P-256 library.
      guard
        let signature = SecKeyCreateSignature(
          keyRef,
          .ecdsaSignatureMessageX962SHA256,
          message as CFData,
          &error
        ) as Data?
      else {
        throw SecureEnclaveException.from(cfError: error?.takeRetainedValue())
      }
      return signature.base64EncodedString()
    }

    AsyncFunction("deleteKey") { (alias: String) -> Void in
      let query: [String: Any] = [
        kSecClass as String: kSecClassKey,
        kSecAttrApplicationTag as String: ExpoSecureEnclaveModule.applicationTag(for: alias),
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      ]
      let status = SecItemDelete(query as CFDictionary)
      // Deleting a key that's already gone is the same end state, not a failure.
      if status != errSecSuccess && status != errSecItemNotFound {
        throw SecureEnclaveException.unavailable("Could not delete the Enclave key (OSStatus \(status)).")
      }
    }
  }

  /// One tag per alias, namespaced under this app's own bundle id so multiple apps on the same
  /// device — and multiple keys within this one app — never collide in the Keychain.
  private static func applicationTag(for alias: String) -> Data {
    let bundleId = Bundle.main.bundleIdentifier ?? "expo.secureenclave"
    return "\(bundleId).secureenclave.\(alias)".data(using: .utf8)!
  }

  private static func findKeyRef(alias: String) throws -> SecKey? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: applicationTag(for: alias),
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecReturnRef as String: true,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound {
      return nil
    }
    guard status == errSecSuccess else {
      throw SecureEnclaveException.unavailable("Could not read the Enclave key (OSStatus \(status)).")
    }
    // Safe force-cast: `kSecReturnRef` on a `kSecClassKey` query hands back a `SecKey` whenever
    // `status == errSecSuccess`.
    return (item as! SecKey)
  }

  private static func createKey(alias: String) throws -> SecKey {
    var accessControlError: Unmanaged<CFError>?
    guard
      let accessControl = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        &accessControlError
      )
    else {
      throw SecureEnclaveException.unavailable((accessControlError?.takeRetainedValue() as Error?)?.localizedDescription ?? "Could not build the key's own access control.")
    }

    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeySizeInBits as String: 256,
      kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: applicationTag(for: alias),
        kSecAttrAccessControl as String: accessControl,
      ],
    ]

    var creationError: Unmanaged<CFError>?
    guard let keyRef = SecKeyCreateRandomKey(attributes as CFDictionary, &creationError) else {
      throw SecureEnclaveException.unavailable((creationError?.takeRetainedValue() as Error?)?.localizedDescription ?? "Could not create a key in the Secure Enclave.")
    }
    return keyRef
  }
}

/// One `Exception` per error this module can throw — `code` crosses the bridge as `error.code` on
/// the JS side (Expo Modules' own convention), which `src/index.ts` reads directly to classify
/// into a `SecureEnclaveErrorReason`.
internal class SecureEnclaveException: Exception {
  private let codeValue: String
  private let messageValue: String

  init(code: String, message: String) {
    self.codeValue = code
    self.messageValue = message
    super.init()
  }

  override var code: String { codeValue }
  override var reason: String { messageValue }

  static func cancelled() -> SecureEnclaveException {
    SecureEnclaveException(code: "E_CANCELLED", message: "The user cancelled the biometric prompt.")
  }
  static func keyInvalidated() -> SecureEnclaveException {
    SecureEnclaveException(code: "E_KEY_INVALIDATED", message: "No Enclave key exists for this alias on this device.")
  }
  static func biometricFailed(_ message: String) -> SecureEnclaveException {
    SecureEnclaveException(code: "E_BIOMETRIC_FAILED", message: message)
  }
  static func unavailable(_ message: String) -> SecureEnclaveException {
    SecureEnclaveException(code: "E_UNAVAILABLE", message: message)
  }

  /// Classifies a `SecKeyCreateSignature` failure. The exact `OSStatus`/`CFError` a real
  /// Face-ID-change invalidation reports varies by iOS version; this maps the ones Apple documents
  /// and falls back to `biometric_failed` for anything unrecognised, which the caller can still
  /// retry a biometric prompt for.
  static func from(cfError: CFError?) -> SecureEnclaveException {
    guard let cfError else { return .biometricFailed("Something went wrong signing with the Enclave key.") }
    let nsError = cfError as Error as NSError
    switch nsError.code {
    case Int(errSecUserCanceled):
      return .cancelled()
    case Int(errSecItemNotFound):
      return .keyInvalidated()
    case Int(errSecAuthFailed):
      return .biometricFailed("The biometric check didn't match.")
    default:
      return .biometricFailed(nsError.localizedDescription)
    }
  }
}
