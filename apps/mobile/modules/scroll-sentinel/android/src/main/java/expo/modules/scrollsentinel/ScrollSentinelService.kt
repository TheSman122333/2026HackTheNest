package expo.modules.scrollsentinel

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.lang.ref.WeakReference
import java.util.ArrayDeque
import java.util.concurrent.Executors

/**
 * Watches TikTok / Instagram Reels / YouTube Shorts for swipes.
 *
 * PRIVACY: reads only package names, view class names, view-id resource names, scroll indices and
 * timestamps. NEVER node.text or contentDescription. Data stays on device (SessionStore).
 */
class ScrollSentinelService : AccessibilityService() {

  interface Listener {
    fun onSwipe(app: String, pkg: String, surface: String, ts: Long)
    fun onSessionEnd(session: ScrollSession)
  }

  private data class Active(
    val pkg: String,
    val rule: SurfaceRule,
    val startMs: Long,
    var lastMs: Long,
    var swipes: Int,
  )

  private data class SurfaceCache(val pkg: String, val onSurface: Boolean, val at: Long)

  private lateinit var store: SessionStore
  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private var rules: Map<String, SurfaceRule> = emptyMap()
  private var active: Active? = null
  private var surfaceCache: SurfaceCache? = null
  private val lastIndex = HashMap<String, Int>()
  private var lastScrollAt = 0L
  private var lastHeartbeat = 0L
  private val idleEnd = Runnable { endSession() }

  override fun onServiceConnected() {
    super.onServiceConnected()
    store = SessionStore(applicationContext)
    rules = store.loadRules()
    discoveryOn = store.discovery()
    instance = WeakReference(this)
  }

  override fun onDestroy() {
    endSession()
    instance = null
    io.shutdown()
    super.onDestroy()
  }

  override fun onInterrupt() = Unit

  fun reloadRules() { rules = store.loadRules(); surfaceCache = null }

  fun activeSessionSnapshot(): ScrollSession? = active?.let {
    ScrollSession(it.rule.app, it.pkg, it.rule.surface, it.startMs, it.lastMs, it.swipes)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    event ?: return
    val pkg = event.packageName?.toString() ?: return
    val rule = rules[pkg]

    // Switching between tracked apps closes the running session.
    active?.let {
      if (it.pkg != pkg) {
        log("switch ${it.pkg} -> $pkg: end session")
        endSession()
      }
    }

    if (discoveryOn) recordDiscovery(event, pkg)
    if (rule == null) return

    when (event.eventType) {
      AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> surfaceCache = null
      AccessibilityEvent.TYPE_VIEW_SCROLLED -> onScrolled(event, pkg, rule)
    }
    heartbeat(pkg, rule)
  }

  /**
   * Time on the short-form surface counts even without swiping (watching one long Short).
   * Throttled: at most one surface check every HEARTBEAT_MS.
   */
  private fun heartbeat(pkg: String, rule: SurfaceRule) {
    val up = SystemClock.uptimeMillis()
    if (up - lastHeartbeat < HEARTBEAT_MS) return
    lastHeartbeat = up
    val on = rule.mode == "all" || onSurface(pkg, rule)
    val now = System.currentTimeMillis()
    val a = active
    if (on) {
      if (a == null) {
        active = Active(pkg, rule, now, now, 0)
        log("heartbeat: on ${rule.surface} in $pkg -> session START")
      } else {
        a.lastMs = now
      }
      main.removeCallbacks(idleEnd)
      main.postDelayed(idleEnd, IDLE_END_MS)
    } else if (a != null) {
      log("heartbeat: left ${rule.surface} in $pkg -> session END")
      endSession()
    }
  }

  private fun onScrolled(event: AccessibilityEvent, pkg: String, rule: SurfaceRule) {
    val source = event.source
    val srcId = source?.viewIdResourceName
    val cls = source?.className?.toString() ?: event.className?.toString()
    val idx = event.fromIndex
    val dy = if (Build.VERSION.SDK_INT >= 28) event.scrollDeltaY else 0
    val info = "pkg=$pkg id=$srcId cls=$cls from=$idx to=${event.toIndex} count=${event.itemCount} dy=$dy"
    if (!isShortFormScroll(pkg, rule, srcId)) {
      log("scroll IGNORED (not short-form) $info")
      return
    }

    val now = System.currentTimeMillis()
    val key = "$pkg|${srcId ?: cls ?: "?"}"
    val sinceLast = SystemClock.uptimeMillis() - lastScrollAt
    lastScrollAt = SystemClock.uptimeMillis()

    val prev = if (idx >= 0) lastIndex.put(key, idx) else null
    val swiped = when {
      // Paged feeds report the visible item; it changes exactly once per video.
      idx >= 0 && prev != null -> prev != idx
      // First event seen for this feed but already past video 0: that was a swipe.
      idx > 0 -> true
      // No index info: a new burst of scroll events after a quiet gap = one swipe.
      idx < 0 -> (Build.VERSION.SDK_INT < 28 || dy != 0) && sinceLast > BURST_GAP_MS
      else -> false
    }
    log("scroll ${if (swiped) "SWIPE" else "same "} prev=$prev gap=${sinceLast}ms $info")
    if (!swiped) return

    val a = active ?: Active(pkg, rule, now, now, 0).also { active = it }
    a.swipes += 1
    a.lastMs = now
    io.execute { store.recordSwipe(pkg, now) }
    listener?.get()?.onSwipe(rule.app, pkg, rule.surface, now)
    main.removeCallbacks(idleEnd)
    main.postDelayed(idleEnd, IDLE_END_MS)
  }

  private fun isShortFormScroll(pkg: String, rule: SurfaceRule, srcId: String?): Boolean {
    if (rule.mode == "all") return srcId == null || !rule.excluded(srcId)
    if (srcId != null && rule.excluded(srcId)) return false
    // The scrolling view itself is the short-form pager: definitely counts.
    if (srcId != null && rule.matchesId(srcId)) return true
    // Otherwise count it only if the short-form surface is on screen right now.
    return onSurface(pkg, rule)
  }

  private fun onSurface(pkg: String, rule: SurfaceRule): Boolean {
    val c = surfaceCache
    val now = SystemClock.uptimeMillis()
    if (c != null && c.pkg == pkg && now - c.at < SURFACE_TTL_MS) return c.onSurface
    return scanForSurface(pkg, rule)
  }

  private fun scanForSurface(pkg: String, rule: SurfaceRule): Boolean {
    val root = rootInActiveWindow ?: return false
    var found = false
    val sample = LinkedHashSet<String>()
    walk(root) { node ->
      val id = node.viewIdResourceName
      if (id != null && sample.size < 25) sample.add(id.substringAfter(":id/"))
      if (id != null && rule.matchesId(id)) { found = true; false } else true
    }
    val prev = surfaceCache
    if (prev == null || prev.pkg != pkg || prev.onSurface != found) {
      log("surface ${if (found) "ON" else "OFF"} ${rule.surface} in $pkg; ids seen: ${sample.joinToString(",")}")
    }
    surfaceCache = SurfaceCache(pkg, found, SystemClock.uptimeMillis())
    return found
  }

  /** BFS over the node tree, capped. [visit] returns false to stop. Reads ids/classes only. */
  private fun walk(root: AccessibilityNodeInfo, visit: (AccessibilityNodeInfo) -> Boolean) {
    val q = ArrayDeque<AccessibilityNodeInfo>()
    q.add(root)
    var n = 0
    while (q.isNotEmpty() && n < MAX_NODES) {
      val node = q.removeFirst()
      n++
      if (!visit(node)) return
      for (i in 0 until node.childCount) node.getChild(i)?.let { q.add(it) }
    }
  }

  private fun endSession() {
    main.removeCallbacks(idleEnd)
    val a = active ?: return
    active = null
    // lastIndex is kept so the next swipe after a brief window change still counts.
    val s = ScrollSession(a.rule.app, a.pkg, a.rule.surface, a.startMs, a.lastMs, a.swipes)
    log("session saved ${a.pkg} swipes=${a.swipes} secs=${(a.lastMs - a.startMs) / 1000}")
    io.execute { store.appendSession(s) }
    listener?.get()?.onSessionEnd(s)
  }

  // ---------------- discovery (debug) ----------------

  private fun recordDiscovery(event: AccessibilityEvent, pkg: String) {
    val now = System.currentTimeMillis()
    when (event.eventType) {
      AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
        val src = event.source
        pushDiscovery(
          mapOf(
            "ts" to now.toDouble(), "pkg" to pkg, "kind" to "scroll",
            "className" to (src?.className?.toString() ?: event.className?.toString()),
            "viewId" to src?.viewIdResourceName,
            "fromIndex" to event.fromIndex, "toIndex" to event.toIndex, "itemCount" to event.itemCount,
            "scrollDeltaY" to if (Build.VERSION.SDK_INT >= 28) event.scrollDeltaY else null,
          )
        )
      }
      AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
        val root = rootInActiveWindow ?: return
        val seen = HashSet<String>()
        walk(root) { node ->
          val id = node.viewIdResourceName
          if (node.isScrollable && id != null && seen.add(id)) {
            pushDiscovery(
              mapOf(
                "ts" to now.toDouble(), "pkg" to pkg, "kind" to "window",
                "className" to node.className?.toString(), "viewId" to id,
              )
            )
          }
          true
        }
      }
    }
  }

  companion object {
    private const val IDLE_END_MS = 30_000L
    private const val HEARTBEAT_MS = 3_000L
    private const val TAG = "ScrollSentinel"

    /** Verbose debug log: `adb logcat -s ScrollSentinel`. Ids/indices only, never content. */
    fun log(msg: String) { android.util.Log.d(TAG, msg) }
    private const val BURST_GAP_MS = 700L
    private const val SURFACE_TTL_MS = 2_500L
    private const val MAX_NODES = 1500
    private const val DISCOVERY_CAP = 400

    @Volatile var listener: WeakReference<Listener>? = null
    @Volatile var instance: WeakReference<ScrollSentinelService>? = null
    @Volatile var discoveryOn: Boolean = false

    private val discovery = ArrayDeque<Map<String, Any?>>()
    private var lastDiscoveryKey: String? = null

    @Synchronized fun pushDiscovery(e: Map<String, Any?>) {
      val key = "${e["pkg"]}|${e["kind"]}|${e["className"]}|${e["viewId"]}"
      if (key == lastDiscoveryKey && e["kind"] == "scroll") return // collapse scroll spam
      lastDiscoveryKey = key
      discovery.addLast(e)
      while (discovery.size > DISCOVERY_CAP) discovery.removeFirst()
    }

    @Synchronized fun discoverySnapshot(): List<Map<String, Any?>> = discovery.toList()
    @Synchronized fun clearDiscovery() { discovery.clear(); lastDiscoveryKey = null }
  }
}
