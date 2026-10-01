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
if (source.includes("BigPictureStyle()")) {
  process.exit(0);
}

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
