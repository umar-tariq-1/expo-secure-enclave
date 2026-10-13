package expo.modules.secureenclave

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.UnrecoverableKeyException
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

private const val ANDROID_KEYSTORE = "AndroidKeyStore"

// A P-256 (secp256r1) key pair generated INSIDE the Android Keystore, StrongBox-backed where the
// device supports it (a separate secure-element chip, Android's closest equivalent to iOS's
// Secure Enclave) and falling back to the TEE-backed Keystore everywhere else: every real Android
// device has one or the other. The private key never leaves the Keystore/StrongBox; every
// operation below hands the Keystore provider a `PrivateKey` handle and asks IT to do the work.
//
// `setUserAuthenticationRequired(true)` + `AUTH_BIOMETRIC_STRONG` (or, pre-API 30, the equivalent
// `setUserAuthenticationValidityDurationSeconds(-1)`) is what makes signing refuse to run without a
// live, current, STRONG biometric, with no device-credential fallback, and what makes the Keystore
// invalidate the key automatically when the enrolled biometric set changes
// (`setInvalidatedByBiometricEnrollment`). This mirrors iOS's `[.privateKeyUsage,
// .biometryCurrentSet]` exactly: the OS enforces the gate, not app code.
class ExpoSecureEnclaveModule : Module() {
  private val keyStore: KeyStore by lazy {
    KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoSecureEnclave")

    AsyncFunction("isAvailable") {
      strongBiometricUnavailableReason() == null
    }

    AsyncFunction("hasKey") { alias: String ->
      keyStore.containsAlias(fullAlias(alias))
    }

    AsyncFunction("getOrCreatePublicKey") { alias: String ->
      val publicKey = existingPublicKey(alias) ?: createKey(alias).public
      encodePublicKey(publicKey as ECPublicKey)
    }

    AsyncFunction("sign") { alias: String, messageBase64: String ->
      val activity = appContext.currentActivity as? FragmentActivity
        ?: throw SecureEnclaveException.unavailable("No foreground activity to show the biometric prompt on.")
      // Device state first, then the key, in the same order as iOS, so a device with no usable
      // strong biometric is `unavailable` on both platforms whatever state the key itself is in.
      strongBiometricUnavailableReason()?.let { throw SecureEnclaveException.unavailable(it) }
      if (!keyStore.containsAlias(fullAlias(alias))) {
        throw SecureEnclaveException.keyInvalidated()
      }
      val message = Base64.decode(messageBase64, Base64.NO_WRAP)

      val signature = try {
        val privateKey = keyStore.getKey(fullAlias(alias), null) as java.security.PrivateKey
        Signature.getInstance("SHA256withECDSA").apply { initSign(privateKey) }
      } catch (e: KeyPermanentlyInvalidatedException) {
        throw SecureEnclaveException.keyInvalidated()
      } catch (e: UnrecoverableKeyException) {
        // Some Keystore implementations report a biometric-invalidated key here, when loading it,
        // instead of from initSign. Either way the key can never sign again.
        throw SecureEnclaveException.keyInvalidated()
      } catch (e: Exception) {
        throw SecureEnclaveException.unavailable("Could not load the Keystore key: ${e.message}")
      }

      val signed = authenticateAndSign(activity, signature, message)
      Base64.encodeToString(signed, Base64.NO_WRAP)
    }

    AsyncFunction("deleteKey") { alias: String ->
      if (keyStore.containsAlias(fullAlias(alias))) {
        keyStore.deleteEntry(fullAlias(alias))
      }
    }
  }

  /// One Keystore alias per (app, alias) pair. Android Keystore entries are already private to
  /// this app's own UID, so no bundle-id-style namespacing is needed, just a fixed prefix to keep
  /// this module's own entries apart from anything else the host app stores in the Keystore.
  private fun fullAlias(alias: String) = "expo-secure-enclave.$alias"

  private fun existingPublicKey(alias: String): java.security.PublicKey? {
    if (!keyStore.containsAlias(fullAlias(alias))) return null
    return keyStore.getCertificate(fullAlias(alias))?.publicKey
  }

  /// `null` when a strong (Class 3) biometric is enrolled and usable; otherwise why not. The Android
  /// counterpart of the iOS module's `biometryError()`: `isAvailable` is exactly "this is null", and
  /// creating a key or signing requires it.
  private fun strongBiometricUnavailableReason(): String? {
    val context = appContext.reactContext ?: return "The React context is not available yet."
    return when (BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
      BiometricManager.BIOMETRIC_SUCCESS -> null
      BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "No strong biometric (fingerprint or face) is enrolled on this device."
      BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "This device has no strong biometric hardware."
      BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "The biometric hardware is unavailable right now."
      BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED -> "A security update is required before biometrics can be used."
      else -> "Strong biometric authentication is not supported on this device."
    }
  }

  private fun createKey(alias: String): java.security.KeyPair {
    // Checked up front: the Keystore refuses to generate a key bound to biometric authentication
    // when none is enrolled, but reports that as a generic exception that doesn't say why.
    strongBiometricUnavailableReason()?.let { throw SecureEnclaveException.unavailable(it) }
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)

    fun spec(useStrongBox: Boolean): KeyGenParameterSpec {
      val builder = KeyGenParameterSpec.Builder(fullAlias(alias), KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setUserAuthenticationRequired(true)
        .setInvalidatedByBiometricEnrollment(true)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
      } else {
        @Suppress("DEPRECATION")
        builder.setUserAuthenticationValidityDurationSeconds(-1)
      }
      if (useStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        builder.setIsStrongBoxBacked(true)
      }
      return builder.build()
    }

    return try {
      try {
        generator.initialize(spec(useStrongBox = true))
        generator.generateKeyPair()
      } catch (e: StrongBoxUnavailableException) {
        // Most Android devices don't have a StrongBox chip. The TEE-backed Keystore (still
        // hardware-isolated from the app process, just not a discrete secure element) is the normal
        // path, not a degraded one.
        generator.initialize(spec(useStrongBox = false))
        generator.generateKeyPair()
      }
    } catch (e: Exception) {
      throw SecureEnclaveException.unavailable("Could not generate a Keystore key: ${e.message}")
    }
  }

  /// X9.63 uncompressed point (0x04 ‖ X(32) ‖ Y(32), 65 bytes), the same encoding this module's
  /// iOS counterpart produces via `SecKeyCopyExternalRepresentation`, so a public key exported on
  /// either platform verifies identically anywhere else.
  private fun encodePublicKey(publicKey: ECPublicKey): String {
    val x = toFixedLength(publicKey.w.affineX, 32)
    val y = toFixedLength(publicKey.w.affineY, 32)
    val point = byteArrayOf(0x04) + x + y
    return Base64.encodeToString(point, Base64.NO_WRAP)
  }

  private fun toFixedLength(value: BigInteger, length: Int): ByteArray {
    val bytes = value.toByteArray()
    if (bytes.size == length) return bytes
    if (bytes.size > length) {
      // BigInteger.toByteArray() prepends a 0x00 sign byte when the top bit is set; drop it.
      return bytes.copyOfRange(bytes.size - length, bytes.size)
    }
    val padded = ByteArray(length)
    System.arraycopy(bytes, 0, padded, length - bytes.size, bytes.size)
    return padded
  }

  /// Bridges `BiometricPrompt`'s callback API into a suspend call `AsyncFunction` can await.
  /// `onAuthenticationFailed` (a single non-matching biometric read, e.g. the wrong finger) is
  /// deliberately NOT treated as a rejection: the system prompt stays open and lets the user try
  /// again, exactly like the iOS Face ID sheet does. Only `onAuthenticationError` (cancel, lockout,
  /// too many attempts, ...) ends the attempt.
  private suspend fun authenticateAndSign(
    activity: FragmentActivity,
    signature: Signature,
    message: ByteArray,
  ): ByteArray = suspendCancellableCoroutine { continuation ->
    val executor = ContextCompat.getMainExecutor(activity)
    val callback = object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        try {
          val signedWith = result.cryptoObject?.signature
            ?: throw SecureEnclaveException.unavailable("The biometric prompt returned no signature object.")
          signedWith.update(message)
          continuation.resume(signedWith.sign())
        } catch (e: Exception) {
          continuation.resumeWithException(
            if (e is CodedException) e else SecureEnclaveException.biometricFailed(e.message ?: "Signing failed after authentication.")
          )
        }
      }

      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
        continuation.resumeWithException(SecureEnclaveException.fromBiometricErrorCode(errorCode, errString.toString()))
      }
    }

    val promptInfo = BiometricPrompt.PromptInfo.Builder()
      .setTitle("Authenticate")
      .setSubtitle("Confirm your identity to sign")
      .setNegativeButtonText("Cancel")
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
      .build()

    val prompt = BiometricPrompt(activity, executor, callback)
    continuation.invokeOnCancellation { prompt.cancelAuthentication() }
    activity.runOnUiThread {
      prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(signature))
    }
  }
}

/**
 * One `CodedException` per error this module can throw. `code` crosses the bridge as
 * `error.code` on the JS side (Expo Modules' own convention), which `src/index.ts` reads directly
 * to classify into a `SecureEnclaveErrorReason`, the same four values the iOS module's own
 * `SecureEnclaveException` maps to.
 */
internal class SecureEnclaveException private constructor(code: String, message: String) : CodedException(message) {
  private val codeValue = code
  override fun getCode() = codeValue

  companion object {
    fun cancelled() = SecureEnclaveException("E_CANCELLED", "The user cancelled the biometric prompt.")
    fun keyInvalidated() = SecureEnclaveException("E_KEY_INVALIDATED", "No key exists for this alias on this device, or it was invalidated by a biometric change.")
    fun biometricFailed(message: String) = SecureEnclaveException("E_BIOMETRIC_FAILED", message)
    fun unavailable(message: String) = SecureEnclaveException("E_UNAVAILABLE", message)

    /** Maps `BiometricPrompt.AuthenticationCallback#onAuthenticationError`'s own error codes. */
    fun fromBiometricErrorCode(errorCode: Int, message: String): SecureEnclaveException {
      return when (errorCode) {
        BiometricPrompt.ERROR_USER_CANCELED,
        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
        BiometricPrompt.ERROR_CANCELED,
        -> cancelled()

        BiometricPrompt.ERROR_LOCKOUT,
        BiometricPrompt.ERROR_LOCKOUT_PERMANENT,
        BiometricPrompt.ERROR_NO_BIOMETRICS,
        BiometricPrompt.ERROR_HW_UNAVAILABLE,
        BiometricPrompt.ERROR_HW_NOT_PRESENT,
        BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL,
        BiometricPrompt.ERROR_SECURITY_UPDATE_REQUIRED,
        -> unavailable(message)

        else -> biometricFailed(message)
      }
    }
  }
}
