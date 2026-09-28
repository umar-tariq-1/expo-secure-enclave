package expo.modules.secureenclave

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoSecureEnclaveModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoSecureEnclave")
  }
}
