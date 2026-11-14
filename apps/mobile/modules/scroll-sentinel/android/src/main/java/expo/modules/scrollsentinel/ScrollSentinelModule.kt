package expo.modules.scrollsentinel

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class ScrollSentinelModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val store by lazy { SessionStore(context) }

  private val serviceListener = object : ScrollSentinelService.Listener {
    override fun onSwipe(app: String, pkg: String, surface: String, ts: Long) {
      sendEvent("onSwipe", mapOf("app" to app, "pkg" to pkg, "surface" to surface, "ts" to ts.toDouble()))
    }

    override fun onSessionEnd(session: ScrollSession) {
      sendEvent("onSessionEnd", session.toMap())
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ScrollSentinel")
    Events("onSwipe", "onSessionEnd")

    OnCreate { ScrollSentinelService.listener = WeakReference(serviceListener) }
    OnDestroy { ScrollSentinelService.listener = null }

    Function("isSupported") { true }

    Function("isAccessibilityEnabled") { isServiceEnabled() }

    Function("openAccessibilitySettings") {
      // Try to deep-link straight to our service's toggle, fall back to the list.
      val component = ComponentName(context, ScrollSentinelService::class.java).flattenToString()
      val detail = Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS")
        .putExtra(Intent.EXTRA_COMPONENT_NAME, component)
      if (!launch(detail)) launch(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
      Unit
    }

    Function("hasUsageAccess") { hasUsageAccess() }

    Function("openUsageAccessSettings") {
      val direct = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${context.packageName}"))
      if (!launch(direct)) launch(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
      Unit
    }

    Function("setRulesJson") { json: String ->
      if (SessionStore.parseRules(json) == null) throw IllegalArgumentException("Invalid rules JSON")
      store.saveRulesJson(json)
      ScrollSentinelService.instance?.get()?.reloadRules()
      Unit
    }

    Function("setDiscoveryMode") { on: Boolean ->
      store.setDiscovery(on)
      ScrollSentinelService.discoveryOn = on
      if (!on) ScrollSentinelService.clearDiscovery()
      Unit
    }

    AsyncFunction("getDiscoverySnapshot") { ScrollSentinelService.discoverySnapshot() }

    AsyncFunction("getSessions") { sinceMs: Double ->
      val stored = store.readSessions(sinceMs.toLong()).map { it.toMap() }
      val live = ScrollSentinelService.instance?.get()?.activeSessionSnapshot()
      if (live != null) stored + (live.toMap() + ("live" to true)) else stored
    }

    AsyncFunction("getTodaySummary") {
      val now = System.currentTimeMillis()
      val day = store.daySummary(now)
      val live = ScrollSentinelService.instance?.get()?.activeSessionSnapshot()
      val perApp = HashMap<String, Map<String, Any?>>()
      day.keys().forEach { pkg ->
        val o = day.getJSONObject(pkg)
        var ms = o.optLong("ms")
        if (live != null && live.pkg == pkg) ms += (live.endMs - live.startMs)
        perApp[pkg] = mapOf(
          "swipes" to o.optInt("swipes"),
          "minutes" to ms / 60000.0,
          "sessions" to o.optInt("sessions"),
        )
      }
      mapOf("date" to SessionStore.dayKey(now), "perApp" to perApp)
    }

    AsyncFunction("getUsageStats") { startMs: Double, endMs: Double, packages: List<String> ->
      usageStats(startMs.toLong(), endMs.toLong(), packages.toSet())
    }

    AsyncFunction("clearData") {
      store.clear()
      ScrollSentinelService.clearDiscovery()
    }
  }

  private fun launch(intent: Intent): Boolean = try {
    val activity = appContext.currentActivity
    if (activity != null) activity.startActivity(intent)
    else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (e: Exception) {
    false
  }

  private fun isServiceEnabled(): Boolean {
    val ours = ComponentName(context, ScrollSentinelService::class.java)
    val enabled = Settings.Secure.getString(
      context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == ours }
  }

  private fun hasUsageAccess(): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= 29) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /**
   * Foreground minutes + "opens" per package from UsageEvents. Works for any package (not just the
   * accessibility allow-list) — used for the Shore Leave streak (days without opening the apps).
   */
  private fun usageStats(startMs: Long, endMs: Long, packages: Set<String>): Map<String, Map<String, Any?>> {
    if (!hasUsageAccess()) return emptyMap()
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val events = usm.queryEvents(startMs, endMs)
    val e = UsageEvents.Event()
    val resumedAt = HashMap<String, Long>()
    val totalMs = HashMap<String, Long>()
    val opens = HashMap<String, Int>()
    val lastPausedAt = HashMap<String, Long>()
    val seen = HashSet<String>()

    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      val pkg = e.packageName ?: continue
      if (packages.isNotEmpty() && pkg !in packages) continue
      when (e.eventType) {
        RESUMED -> {
          seen.add(pkg)
          if (resumedAt[pkg] == null) {
            // A new "open" if the app wasn't just switching activities internally.
            val paused = lastPausedAt[pkg]
            if (paused == null || e.timeStamp - paused > OPEN_GAP_MS) opens[pkg] = (opens[pkg] ?: 0) + 1
            resumedAt[pkg] = e.timeStamp
          }
        }
        PAUSED -> {
          val start = resumedAt.remove(pkg) ?: if (pkg !in seen) startMs else null
          seen.add(pkg)
          if (start != null) totalMs[pkg] = (totalMs[pkg] ?: 0L) + (e.timeStamp - start)
          lastPausedAt[pkg] = e.timeStamp
        }
      }
    }
    resumedAt.forEach { (pkg, start) -> totalMs[pkg] = (totalMs[pkg] ?: 0L) + (endMs - start) }

    return (totalMs.keys + opens.keys).associateWith { pkg ->
      mapOf("minutes" to (totalMs[pkg] ?: 0L) / 60000.0, "opens" to (opens[pkg] ?: 0))
    }
  }

  companion object {
    // UsageEvents.Event.ACTIVITY_RESUMED / ACTIVITY_PAUSED (== legacy MOVE_TO_FOREGROUND / BACKGROUND)
    private const val RESUMED = 1
    private const val PAUSED = 2
    private const val OPEN_GAP_MS = 5_000L
  }
}
