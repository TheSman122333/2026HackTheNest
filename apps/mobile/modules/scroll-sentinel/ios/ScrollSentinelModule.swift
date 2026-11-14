import ExpoModulesCore

// iOS does not allow observing scrolling inside other apps. The real path is the Screen Time API
// (FamilyControls + DeviceActivity monitor extension), which needs Apple's Family Controls
// entitlement. Until then every call returns an "unsupported" value so JS can branch cleanly.
public class ScrollSentinelModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScrollSentinel")
    Events("onSwipe", "onSessionEnd")

    Function("isSupported") { false }
    Function("isAccessibilityEnabled") { false }
    Function("openAccessibilitySettings") {}
    Function("hasUsageAccess") { false }
    Function("openUsageAccessSettings") {}
    Function("setRulesJson") { (_: String) in }
    Function("setDiscoveryMode") { (_: Bool) in }

    AsyncFunction("getDiscoverySnapshot") { () -> [[String: Any]] in [] }
    AsyncFunction("getSessions") { (_: Double) -> [[String: Any]] in [] }
    AsyncFunction("getTodaySummary") { () -> [String: Any] in ["date": "", "perApp": [String: Any]()] }
    AsyncFunction("getUsageStats") { (_: Double, _: Double, _: [String]) -> [String: Any] in [:] }
    AsyncFunction("clearData") {}
  }
}
