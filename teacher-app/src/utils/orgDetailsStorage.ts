import AsyncStorage from "@react-native-async-storage/async-storage";

const LEGACY_CLEARED_KEY = "teacher_org_details_form_cleared";

function clearedKeyForUser(userId: string): string {
  return `teacher_org_form_cleared:${userId}`;
}

/** Teacher submitted school info — form stays empty for this user (survives logout/re-login). */
export async function isOrgFormCleared(userId: string): Promise<boolean> {
  const perUser = await AsyncStorage.getItem(clearedKeyForUser(userId));
  if (perUser === "1") return true;
  const legacy = await AsyncStorage.getItem(LEGACY_CLEARED_KEY);
  return legacy === "1";
}

export async function markOrgFormCleared(userId: string): Promise<void> {
  await AsyncStorage.multiSet([
    [clearedKeyForUser(userId), "1"],
    [LEGACY_CLEARED_KEY, "1"],
  ]);
}

export async function clearOrgFormCleared(userId: string): Promise<void> {
  await AsyncStorage.removeItem(clearedKeyForUser(userId));
}
