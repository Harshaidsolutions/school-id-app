# Scaling audit — Teacher app (React Native / Expo)

Reference design: **390 × 844 dp**. All proportional layout goes through `src/theme/responsive.ts`.

## Framework

**React Native (Expo)** — not Flutter or native-only. Scaling is implemented in-house (same role as `react-native-size-matters` / `scale` + `verticalScale`), not a third-party package.

---

## OS font / display scaling (item 4)

**Decision: lock OS scaling off app-wide.**

In `App.tsx`:

- `Text.defaultProps.allowFontScaling = false`
- `TextInput.defaultProps.allowFontScaling = false`
- `maxFontSizeMultiplier = 1`
- Android: `includeFontPadding: false` on all `Text`

If two test devices have different **Settings → Display → Font size** or **Display size**, they will still look the same in this app. Differences you see are from code/layout, not OS accessibility overrides.

**When re-testing:** note OS font/display settings anyway — if they differ and the app still differs, it confirms a code gap; if settings differ and the app matches, the lock is working.

---

## Horizontal vs vertical scaling (item 5)

| Dimension type | Function | When to use |
|----------------|----------|-------------|
| Width, fontSize, icon size, horizontal padding, borderRadius, square buttons | `scale(n)` | Default for almost everything — keeps the same **width proportion** as the 390dp design |
| Height-only bands (footer %, tall scroll sections) | `layoutV(n)` / `verticalScale(n)` | Vertical spacing that should track **screen height** (16:9 vs 20:9) |
| Full-screen height fractions | `hp(percent)` | e.g. onboarding footer ratio |
| Width fractions | `wp(percent)` | e.g. brand wordmark line width |

**Why both matter:** Using only `scale()` (width-based) on a very tall phone keeps horizontal layout correct but can leave “extra air” vertically. Using `hp()` / `layoutV()` for footer bands and major vertical sections keeps top-to-bottom proportions closer across aspect ratios.

**Square elements** (FAB, avatars, icon chips): use `scale()` for both width and height so they stay circular/square relative to screen width.

---

## Token layer (centralized — fixes propagate everywhere)

| File | Status |
|------|--------|
| `src/theme/responsive.ts` | `scale`, `verticalScale`, `layoutV`, `scaleFont`, `icons`, `scaledHitSlop` |
| `src/theme/typography.ts` | All `type.*` and `textStyles.*` use `scale()` via `s()` |
| `src/theme/colors.ts` | `spacing.*` uses `scale()`; **`radius.*` and `cardShadow` now scaled** (v1.0.37) |
| `App.tsx` | Global font scaling locked |

---

## Shared components — corrected in v1.0.37

| Component | Issue | Fix |
|-----------|-------|-----|
| `BrandLockup.tsx` | HARSHA mid-word wrap on splash | `numberOfLines={1}`, `adjustsFontSizeToFit`, `scaleFont` + min sizes |
| `OrangeGradientHeader.tsx` | Raw icon sizes, hitSlop 12 | `icons.lg`, `scaledHitSlop` |
| `IconChip.tsx` | Default iconSize 20 | `icons.md` |
| `SectionHeader.tsx` | Raw 28/14/1.5px | `spacing.iconSm`, `icons.sm`, `scale()` |
| `MainTabs.tsx` | Raw tab/FAB icon sizes, shadow | `icons.*`, `moderateScale` shadows |
| `LaunchSplashScreen.tsx` | paddingHorizontal 16 | `spacing.pagePad` |

---

## Screens — corrected in v1.0.36 / v1.0.37

| Screen | Fixes |
|--------|-------|
| `HomeScreen.tsx` | Header title single-line + smaller type; FAB 52→`spacing.fabSize`; icons via `icons.*` |
| `LoginScreen.tsx` | Merged username/password form group |
| `NotificationsScreen.tsx` | Tap → modal with Close |
| `AddStudentScreen.tsx` | Class/Section dropdown from `/teacher/home` |
| `TemplateScreen.tsx` | Horizontal scroll tabs (single row) |
| `StudentListScreen.tsx` | Tighter header; student names `adjustsFontSizeToFit` |
| `StudentDetailScreen.tsx` | Photo 212px → `moderateScale(212)` |

---

## Remaining raw numbers (lower impact — not yet migrated)

These do **not** block proportional layout as much as tokens above, but should migrate to `icons.*` / `scale()` over time:

**Ionicons `size={number}` in screen files** (visual drift ~5–15% across 360dp vs 428dp):

- `LoginScreen`, `DrawerMenuScreen`, `IdCardsScreen`, `StudentListScreen`, `NotificationsScreen`, `ModelsScreen`, `TemplateScreen`, `OrganizationDetailsScreen`, `OnboardingScreen`, `SettingsScreen`, camera/preview screens, etc.

**Hairline / semantic (intentionally unscaled):**

- `borderWidth: 1`, `borderWidth: StyleSheet.hairlineWidth`
- `flex: 1`, `opacity`, `zIndex`, `elevation` (Android layer index)
- Gradient `start`/`end` `{ x, y }` (0–1 normalized)
- Animation `duration` in ms

**Shadow opacity** — unitless; offset/radius should use `scale()` when added inline (many screens inherit `cardShadow` from tokens now).

---

## Safe area (item 3)

`SafeAreaProvider` wraps the app in `App.tsx`. Screens with custom headers use `useSafeAreaInsets()`:

- `HomeScreen`, `OrangeGradientHeader`, `MainTabs` (bottom pad), `OnboardingScreen`, `StudentListScreen`, `DrawerMenuScreen`, etc.

Pattern: `paddingTop: insets.top + spacing.xs` — consistent. Bottom lists use `paddingBottom: … + insets.bottom`.

---

## Platform normalization (item 2)

- **Fonts:** Explicit Poppins + Inter via `expo-font` — no system default drift.
- **Android text:** `includeFontPadding: false` globally.
- **iOS vs Android:** `Platform.OS` only for `KeyboardAvoidingView` behavior and minor input padding — not for layout sizes.

---

## Build / test checklist (item 4)

1. **Uninstall** old APK completely on each device.
2. Install **`teacher-app-v1.0.37.apk`** (versionCode **37**).
3. On each device record:
   - Model name
   - Android version
   - Settings → Display → **Font size** (Default / Large / …)
   - Settings → Display → **Display size** (Default / Large / …)
4. Compare same screens: **Splash**, **Home header**, **Templates tabs**, **Login form**, **Notifications modal**.
5. Report: *screen name + device + what's different* — not “whole app feels off”.

---

## Honest status

This is **not** closed until you re-test the APK on your physical devices. Code audit found real gaps (especially **`radius` unscaled** and **raw icon/FAB sizes**); those are fixed at the token/shared layer. Residual per-screen `Ionicons size={18}` literals may still cause minor icon drift until fully migrated to `icons.*`.

**Goal:** proportional consistency (Netflix-style), not pixel-identical across every DPI and aspect ratio.
