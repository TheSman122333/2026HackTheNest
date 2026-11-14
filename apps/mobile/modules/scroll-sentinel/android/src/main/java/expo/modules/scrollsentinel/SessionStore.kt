package expo.modules.scrollsentinel

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** A finished short-form scrolling session. */
data class ScrollSession(
  val app: String,
  val pkg: String,
  val surface: String,
  val startMs: Long,
  val endMs: Long,
  val swipes: Int,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("app", app).put("pkg", pkg).put("surface", surface)
    .put("startMs", startMs).put("endMs", endMs).put("swipes", swipes)

  fun toMap(): Map<String, Any?> = mapOf(
    "app" to app, "pkg" to pkg, "surface" to surface,
    "startMs" to startMs.toDouble(), "endMs" to endMs.toDouble(), "swipes" to swipes,
  )

  companion object {
    fun fromJson(o: JSONObject) = ScrollSession(
      o.optString("app"), o.optString("pkg"), o.optString("surface"),
      o.optLong("startMs"), o.optLong("endMs"), o.optInt("swipes"),
    )
  }
}

/** Per-package rule for deciding whether a scroll happened on a short-form surface. Tuned from JS via setRules. */
data class SurfaceRule(
  val app: String,
  val surface: String,
  /** "all": every scroll in the package counts (TikTok). "match": only when a view id matches idPatterns. */
  val mode: String,
  val idPatterns: List<Regex>,
  val excludePatterns: List<Regex>,
) {
  fun matchesId(id: String): Boolean =
    excludePatterns.none { it.containsMatchIn(id) } && idPatterns.any { it.containsMatchIn(id) }

  fun excluded(id: String): Boolean = excludePatterns.any { it.containsMatchIn(id) }
}

/**
 * On-device persistence. Stores ONLY package names, timestamps and counts — never screen content.
 *  - filesDir/scroll_sentinel/sessions.jsonl  (append-only, one session per line)
 *  - filesDir/scroll_sentinel/daily.json      ({ "yyyy-MM-dd": { pkg: { swipes, ms } } })
 *  - SharedPreferences "scroll_sentinel"      (rules JSON, discovery flag)
 */
class SessionStore(context: Context) {
  private val dir = File(context.filesDir, "scroll_sentinel").apply { mkdirs() }
  private val sessionsFile = File(dir, "sessions.jsonl")
  private val dailyFile = File(dir, "daily.json")
  private val prefs = context.getSharedPreferences("scroll_sentinel", Context.MODE_PRIVATE)
  private val lock = Any()

  // ---- rules / flags ----

  fun saveRulesJson(json: String) = prefs.edit().putString("rules", json).apply()

  fun loadRules(): Map<String, SurfaceRule> =
    parseRules(prefs.getString("rules", null) ?: DEFAULT_RULES_JSON) ?: parseRules(DEFAULT_RULES_JSON)!!

  fun setDiscovery(on: Boolean) = prefs.edit().putBoolean("discovery", on).apply()
  fun discovery(): Boolean = prefs.getBoolean("discovery", false)

  // ---- sessions + daily aggregate ----

  fun recordSwipe(pkg: String, ts: Long) = synchronized(lock) {
    val daily = readDaily()
    val day = daily.optJSONObject(dayKey(ts)) ?: JSONObject().also { daily.put(dayKey(ts), it) }
    val app = day.optJSONObject(pkg) ?: JSONObject().also { day.put(pkg, it) }
    app.put("swipes", app.optInt("swipes") + 1)
    writeDaily(daily)
  }

  fun appendSession(s: ScrollSession) = synchronized(lock) {
    sessionsFile.appendText(s.toJson().toString() + "\n")
    val daily = readDaily()
    val day = daily.optJSONObject(dayKey(s.startMs)) ?: JSONObject().also { daily.put(dayKey(s.startMs), it) }
    val app = day.optJSONObject(s.pkg) ?: JSONObject().also { day.put(s.pkg, it) }
    app.put("ms", app.optLong("ms") + (s.endMs - s.startMs).coerceAtLeast(0))
    app.put("sessions", app.optInt("sessions") + 1)
    writeDaily(daily)
  }

  fun readSessions(sinceMs: Long): List<ScrollSession> {
    synchronized(lock) {
      if (!sessionsFile.exists()) return emptyList()
      return sessionsFile.readLines().mapNotNull { line ->
        runCatching { ScrollSession.fromJson(JSONObject(line)) }.getOrNull()
      }.filter { it.endMs >= sinceMs }
    }
  }

  /** { pkg: { swipes, ms, sessions } } for the given local day. */
  fun daySummary(ts: Long): JSONObject = synchronized(lock) {
    readDaily().optJSONObject(dayKey(ts)) ?: JSONObject()
  }

  fun clear() = synchronized(lock) {
    sessionsFile.delete()
    dailyFile.delete()
  }

  private fun readDaily(): JSONObject =
    if (dailyFile.exists()) runCatching { JSONObject(dailyFile.readText()) }.getOrDefault(JSONObject()) else JSONObject()

  private fun writeDaily(o: JSONObject) {
    // keep ~45 days
    val keys = o.keys().asSequence().toList().sorted()
    if (keys.size > 45) keys.take(keys.size - 45).forEach { o.remove(it) }
    dailyFile.writeText(o.toString())
  }

  companion object {
    fun dayKey(ts: Long): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(ts))

    /** Defaults so the service works before JS ever calls setRules. View-id patterns are UNVERIFIED — tune via Scroll Lab discovery. */
    const val DEFAULT_RULES_JSON = """
    {
      "com.zhiliaoapp.musically": { "app": "tiktok", "surface": "feed", "mode": "all", "excludePatterns": ["comment", "profile"] },
      "com.ss.android.ugc.trill": { "app": "tiktok", "surface": "feed", "mode": "all", "excludePatterns": ["comment", "profile"] },
      "com.instagram.android": { "app": "instagram", "surface": "reels", "mode": "match", "idPatterns": ["clips_viewer", "clips_.*pager", "reel_viewer"] },
      "com.google.android.youtube": { "app": "youtube", "surface": "shorts", "mode": "match", "idPatterns": ["reel_recycler", "reel_player", "shorts"] }
    }
    """

    fun parseRules(json: String): Map<String, SurfaceRule>? = runCatching {
      val root = JSONObject(json)
      root.keys().asSequence().associateWith { pkg ->
        val r = root.getJSONObject(pkg)
        SurfaceRule(
          app = r.optString("app", pkg),
          surface = r.optString("surface", "shortform"),
          mode = r.optString("mode", "match"),
          idPatterns = r.optJSONArray("idPatterns").toRegexList(),
          excludePatterns = r.optJSONArray("excludePatterns").toRegexList(),
        )
      }
    }.getOrNull()

    private fun JSONArray?.toRegexList(): List<Regex> {
      if (this == null) return emptyList()
      return (0 until length()).mapNotNull { i -> runCatching { Regex(getString(i), RegexOption.IGNORE_CASE) }.getOrNull() }
    }
  }
}
