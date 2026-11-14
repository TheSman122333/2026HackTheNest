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
    active?.let { if (it.pkg != pkg) endSession() }

    if (discoveryOn) recordDiscovery(event, pkg)
    if (rule == null) return

    when (event.eventType) {
      AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
        surfaceCache = null
        // Left the short-form surface (e.g. Reels -> Instagram home)? End the session.
        if (active != null && rule.mode == "match" && !scanForSurface(pkg, rule)) endSession()
      }
      AccessibilityEvent.TYPE_VIEW_SCROLLED -> onScrolled(event, pkg, rule)
    }
  }

  private fun onScrolled(event: AccessibilityEvent, pkg: String, rule: SurfaceRule) {
    val source = event.source
    val srcId = source?.viewIdResourceName
    if (!isShortFormScroll(pkg, rule, srcId)) return

    val now = System.currentTimeMillis()
    val key = "$pkg|${srcId ?: source?.className ?: "?"}"
    val idx = event.fromIndex
    val sinceLast = SystemClock.uptimeMillis() - lastScrollAt
    lastScrollAt = SystemClock.uptimeMillis()

    val swiped = if (idx >= 0) {
      // Paged feeds report the first visible item; it changes exactly once per video.
      val prev = lastIndex.put(key, idx)
      prev != null && prev != idx
    } else {
      // No index info: a new burst of scroll events after >700ms quiet = one swipe.
      val deltaOk = Build.VERSION.SDK_INT < 28 || event.scrollDeltaY != 0
      deltaOk && sinceLast > BURST_GAP_MS
    }
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
    // Precise path: the scrolling view itself has an id -> decide by it alone.
    if (srcId != null) return rule.matchesId(srcId)
    // Fallback: throttled scan of the active window for a marker id.
    val c = surfaceCache
    val now = SystemClock.uptimeMillis()
    if (c != null && c.pkg == pkg && now - c.at < SURFACE_TTL_MS) return c.onSurface
    return scanForSurface(pkg, rule)
  }

  private fun scanForSurface(pkg: String, rule: SurfaceRule): Boolean {
    val root = rootInActiveWindow ?: return false
    var found = false
    walk(root) { node ->
      val id = node.viewIdResourceName
      if (id != null && rule.matchesId(id)) { found = true; false } else true
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
    lastIndex.clear()
    val s = ScrollSession(a.rule.app, a.pkg, a.rule.surface, a.startMs, a.lastMs, a.swipes)
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
    private const val IDLE_END_MS = 60_000L
    private const val BURST_GAP_MS = 700L
    private const val SURFACE_TTL_MS = 1_000L
    private const val MAX_NODES = 600
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
