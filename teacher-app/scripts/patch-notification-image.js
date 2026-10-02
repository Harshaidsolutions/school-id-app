/**
 * Expo's Android notification builder only sets a large icon for remote images.
 * Use BigPictureStyle so the image appears in the expanded device notification.
 */
const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-notifications",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "notifications",
  "notifications",
  "presentation",
  "builders",
  "ExpoNotificationBuilder.kt"
);

if (!fs.existsSync(file)) {
  console.log("[patch-notification-image] expo-notifications builder not found");
  process.exit(0);
}

const source = fs.readFileSync(file, "utf8");
if (!source.includes("BigPictureStyle()")) {

const target = `    if (notificationContent.containsImage()) {
      val bitmap = notificationContent.getImage(context)
      bitmap?.let { builder.setLargeIcon(it) }
    } else {
      builder.setLargeIcon(largeIcon)
    }`;

const replacement = `    if (notificationContent.containsImage()) {
      val bitmap = notificationContent.getImage(context)
      if (bitmap != null) {
        val picture = scaleForNotification(bitmap)
        builder.setLargeIcon(picture)
        builder.setStyle(
          NotificationCompat.BigPictureStyle()
            .bigPicture(picture)
            .bigLargeIcon(null as Bitmap?)
            .setSummaryText(content.text)
        )
      }
    } else {
      builder.setLargeIcon(largeIcon)
    }`;

if (!source.includes(target)) {
  console.warn("[patch-notification-image] expected builder block was not found");
  process.exit(0);
}

const helper = `
  private fun scaleForNotification(source: Bitmap): Bitmap {
    val maxWidth = 1024
    if (source.width <= maxWidth) return source
    val height = (source.height * (maxWidth.toFloat() / source.width)).toInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(source, maxWidth, height, true)
  }
`;

let next = source.replace(target, replacement);
const marker = "  private fun applySoundsAndVibrations";
if (!next.includes("fun scaleForNotification") && next.includes(marker)) {
  next = next.replace(marker, `${helper}\n${marker}`);
}

  fs.writeFileSync(file, next);
  console.log("[patch-notification-image] enabled Android big-picture notifications");
}

const contentFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-notifications",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "notifications",
  "notifications",
  "model",
  "RemoteNotificationContent.kt"
);

if (!fs.existsSync(contentFile)) {
  console.log("[patch-notification-image] remote notification content not found");
  process.exit(0);
}

const content = fs.readFileSync(contentFile, "utf8");
if (!content.includes("notificationImageUri")) {
  const imageTarget = `  override suspend fun getImage(context: Context): Bitmap? {
    val uri = remoteMessage.notification?.imageUrl
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    return remoteMessage.notification?.imageUrl != null
  }`;
  const imageReplacement = `  override suspend fun getImage(context: Context): Bitmap? {
    val uri = notificationImageUri()
    return uri?.let { downloadImage(it) }
  }

  override fun containsImage(): Boolean {
    return notificationImageUri() != null
  }

  private fun notificationImageUri(): android.net.Uri? {
    remoteMessage.notification?.imageUrl?.let { return it }
    val raw = remoteMessage.data["imageUrl"] ?: remoteMessage.data["image"]
    val trimmed = raw?.trim().orEmpty()
    if (trimmed.isEmpty()) return null
    return runCatching { android.net.Uri.parse(trimmed) }.getOrNull()
  }`;
  if (!content.includes(imageTarget)) {
    console.warn("[patch-notification-image] expected image lookup was not found");
  } else {
    fs.writeFileSync(contentFile, content.replace(imageTarget, imageReplacement));
    console.log("[patch-notification-image] remote notifications read the image URL");
  }
}

const downloadFile = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-notifications",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "notifications",
  "notifications",
  "presentation",
  "builders",
  "DownloadImage.kt"
);

if (fs.existsSync(downloadFile)) {
  const download = fs.readFileSync(downloadFile, "utf8");
  if (!download.includes("inSampleSize")) {
    const nextDownload = `package expo.modules.notifications.notifications.presentation.builders

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.net.HttpURLConnection
import java.net.URL

suspend fun downloadImage(imageUrl: Uri, connectTimeout: Long = 12000, readTimeout: Long = 12000): Bitmap? {
  return runCatching {
    withTimeout(connectTimeout + readTimeout) {
      withContext(Dispatchers.IO) {
        val connection = URL(imageUrl.toString()).openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = true
        connection.connectTimeout = connectTimeout.toInt()
        connection.readTimeout = readTimeout.toInt()
        connection.setRequestProperty("User-Agent", "MySchoolIDCard")
        connection.connect()
        if (connection.responseCode !in 200..299) {
          connection.disconnect()
          return@withContext null
        }
        val bytes = connection.inputStream.use { it.readBytes() }
        connection.disconnect()
        if (bytes.isEmpty()) return@withContext null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        val maxEdge = 1280
        while (bounds.outWidth / sample > maxEdge || bounds.outHeight / sample > maxEdge) {
          sample *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
      }
    }
  }.getOrNull()
}
`;
    fs.writeFileSync(downloadFile, nextDownload);
    console.log("[patch-notification-image] notification images download off the UI thread");
  }
}
