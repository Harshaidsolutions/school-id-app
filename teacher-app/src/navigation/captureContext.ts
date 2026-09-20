import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Remembers the last class section opened from Home,
 * so the orange Capture "+" tab can deep-link to StudentList
 * for school-wide teachers (who have no assignedClass).
 *
 * Persisted so it survives Metro reloads / app restarts.
 */
const STORAGE_KEY = "teacher.lastClassSection";

let lastClassSection: string | null = null;
let hydratePromise: Promise<void> | null = null;

export function hydrateLastClassSection(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value?.trim()) lastClassSection = value.trim();
      })
      .catch((err) => {
        console.warn("[captureContext] hydrate failed", err);
      });
  }
  return hydratePromise;
}

export function setLastClassSection(classSection: string): void {
  const trimmed = classSection.trim();
  if (!trimmed) return;
  lastClassSection = trimmed;
  void AsyncStorage.setItem(STORAGE_KEY, trimmed).catch((err) => {
    console.warn("[captureContext] persist failed", err);
  });
}

export function getLastClassSection(): string | null {
  return lastClassSection;
}
