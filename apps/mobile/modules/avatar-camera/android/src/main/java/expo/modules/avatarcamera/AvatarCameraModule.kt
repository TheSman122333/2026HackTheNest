package expo.modules.avatarcamera

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.roundToInt

private const val CAPTURE_REQUEST = 19471
private const val PICK_REQUEST = 19472
private const val URI_FLAGS = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
private const val MAX_BYTES = 20L * 1024 * 1024

class AvatarCameraModule : Module() {
  private data class Request(val promise: Promise, val context: Context, val output: File? = null, val uri: Uri? = null)
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private var pending: Request? = null
  @Volatile private var destroyed = false

  override fun definition() = ModuleDefinition {
    Name("AvatarCamera")
    Function("isSupported") { true }
    AsyncFunction("takePhoto") { promise: Promise -> launch(true, promise) }.runOnQueue(Queues.MAIN)
    AsyncFunction("choosePhoto") { promise: Promise -> launch(false, promise) }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, result ->
      if (result.requestCode != CAPTURE_REQUEST && result.requestCode != PICK_REQUEST) return@OnActivityResult
      val request = pending ?: return@OnActivityResult
      request.uri?.let { request.context.revokeUriPermission(it, URI_FLAGS) }
      if (result.resultCode != Activity.RESULT_OK) {
        request.output?.delete()
        pending = null
        request.promise.resolve(null)
        return@OnActivityResult
      }
      worker.execute {
        var source: File? = request.output
        var normalized: File? = null
        try {
          if (result.requestCode == PICK_REQUEST) {
            val picked = result.data?.data ?: throw IOException("No image was selected.")
            val imported = newFile(request.context, "import")
            source = imported
            request.context.contentResolver.openInputStream(picked)?.use { input ->
              imported.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                var total = 0L
                while (true) {
                  val count = input.read(buffer)
                  if (count < 0) break
                  total += count
                  if (total > MAX_BYTES) throw IOException("Choose a photo smaller than 20 MB.")
                  output.write(buffer, 0, count)
                }
              }
            } ?: throw IOException("The selected image could not be read.")
          } else if (source == null || source.length() == 0L) {
            @Suppress("DEPRECATION")
            val thumbnail = result.data?.extras?.get("data") as? Bitmap
              ?: throw IOException("The camera did not return a photo.")
            val captured = source ?: newFile(request.context, "capture")
            source = captured
            captured.outputStream().use { thumbnail.compress(Bitmap.CompressFormat.JPEG, 90, it) }
          }
          val inputFile = source ?: throw IOException("No photo was returned.")
          if (inputFile.length() > MAX_BYTES) throw IOException("Choose a photo smaller than 20 MB.")
          val bitmap = decode(inputFile)
          val photo = newFile(request.context, "photo")
          normalized = photo
          val response = try {
            photo.outputStream().use { output ->
              if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output)) throw IOException("The photo could not be saved.")
            }
            mapOf("uri" to Uri.fromFile(photo).toString(), "width" to bitmap.width, "height" to bitmap.height)
          } finally {
            bitmap.recycle()
          }
          main.post {
            if (!destroyed && pending === request) { pending = null; request.promise.resolve(response) }
            else photo.delete()
          }
        } catch (error: Exception) {
          normalized?.delete()
          main.post {
            if (pending === request) { pending = null; request.promise.reject("E_AVATAR_PHOTO", error.message ?: "The photo could not be read.", error) }
          }
        } finally { source?.delete() }
      }
    }
    OnDestroy {
      destroyed = true
      main.post {
        pending?.let { request ->
          request.uri?.let { request.context.revokeUriPermission(it, URI_FLAGS) }
          request.output?.delete()
          request.promise.reject("E_AVATAR_CLOSED", "Photo capture was closed. Please try again.", null)
        }
        pending = null
        worker.shutdownNow()
      }
    }
  }

  private fun launch(camera: Boolean, promise: Promise) {
    if (destroyed) { promise.reject("E_AVATAR_CLOSED", "The camera module is no longer active.", null); return }
    if (pending != null) { promise.reject("E_AVATAR_BUSY", "Finish the current photo selection first.", null); return }
    val activity = appContext.currentActivity
    val context = appContext.reactContext?.applicationContext
    if (activity == null || context == null) { promise.reject("E_AVATAR_ACTIVITY", "Return to the app before choosing a photo.", null); return }
    var output: File? = null
    var uri: Uri? = null
    try {
      val intent = if (camera) {
        output = newFile(context, "capture")
        uri = FileProvider.getUriForFile(context, "${context.packageName}.avatar-camera", output)
        Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
          putExtra(MediaStore.EXTRA_OUTPUT, uri)
          addFlags(URI_FLAGS)
          clipData = ClipData.newRawUri("Avatar photo", uri)
        }
      } else Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type = "image/*"; addCategory(Intent.CATEGORY_OPENABLE) }
      if (intent.resolveActivity(context.packageManager) == null) throw IOException(if (camera) "No camera app is available. Try choosing a photo instead." else "No photo picker is available.")
      pending = Request(promise, context, output, uri)
      @Suppress("DEPRECATION")
      activity.startActivityForResult(intent, if (camera) CAPTURE_REQUEST else PICK_REQUEST)
    } catch (error: Exception) {
      uri?.let { context.revokeUriPermission(it, URI_FLAGS) }
      output?.delete()
      pending = null
      promise.reject("E_AVATAR_LAUNCH", error.message ?: "The camera could not be opened.", error)
    }
  }

  private fun newFile(context: Context, kind: String): File {
    val directory = File(context.cacheDir, "avatar-camera")
    if (!directory.exists() && !directory.mkdirs()) throw IOException("The app could not create a private photo file.")
    return File(directory, "$kind-${UUID.randomUUID()}.jpg")
  }

  /** Decode at avatar resolution and bake orientation into the new JPEG. EXIF is not copied. */
  private fun decode(file: File): Bitmap {
    if (Build.VERSION.SDK_INT >= 28) {
      return ImageDecoder.decodeBitmap(ImageDecoder.createSource(file)) { decoder, info, _ ->
        val scale = minOf(1.0, 1024.0 / max(info.size.width, info.size.height))
        decoder.setTargetSize(max(1, (info.size.width * scale).roundToInt()), max(1, (info.size.height * scale).roundToInt()))
        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
      }
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("This image format could not be opened.")
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > 1024) sample *= 2
    val bitmap = BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
      ?: throw IOException("The image could not be decoded.")
    val orientation = try { ExifInterface(file.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) } catch (_: IOException) { ExifInterface.ORIENTATION_NORMAL }
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(-90f); matrix.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
      else -> return bitmap
    }
    val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (rotated !== bitmap) bitmap.recycle()
    return rotated
  }
}
