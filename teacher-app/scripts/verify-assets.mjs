/**
 * Verifies every static asset referenced via require() exists on disk before release build.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const required = [
  "assets/in-app-logo.png",
  "assets/in-app-logo-header.png",
  "assets/mascot-id-card.png",
  "assets/splash-icon.png",
  "assets/app-icon.png",
  "assets/intro-teacher-3d.png",
  "assets/onboarding-hero.png",
  "assets/onboarding-page2.jpg",
  "assets/school-building.jpg",
  "assets/products/id_cards.jpg",
  "assets/products/medals.jpg",
  "assets/products/belts.jpg",
  "assets/products/navara_belt.png",
  "assets/products/ties.jpg",
  "assets/products/normal_tie.jpg",
  "assets/products/diaries.jpg",
  "assets/products/progress_card.jpg",
  "assets/products/certificate.jpg",
  "assets/products/student_file.jpg",
  "assets/products/rank_badges.jpg",
  "assets/products/cloth_badges.jpg",
  "assets/products/key_chains.jpg",
  "assets/products/book_covers.jpg",
];

let missing = 0;
for (const rel of required) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error("MISSING:", rel);
    missing++;
  } else {
    const stat = fs.statSync(full);
    console.log("OK", rel, `(${stat.size} bytes)`);
  }
}

if (missing > 0) {
  console.error(`\n${missing} required asset(s) missing — abort build.`);
  process.exit(1);
}

console.log("\nAll required assets present.");
