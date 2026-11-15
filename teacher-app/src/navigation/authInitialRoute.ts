export type AuthInitialRoute = "Onboarding" | "Login";

/**
 * The three introduction pages are shown every time the app is opened (before Login);
 * once they have been seen in this run of the app, Login comes straight after logout.
 */
let introSeenThisLaunch = false;
export function markIntroSeen(): void {
  introSeenThisLaunch = true;
}
export async function resolveAuthInitialRoute(): Promise<AuthInitialRoute> {
  return introSeenThisLaunch ? "Login" : "Onboarding";
}
