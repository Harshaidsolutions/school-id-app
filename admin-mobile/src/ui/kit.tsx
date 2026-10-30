import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F, R, S, accentGradient, primaryGradient, shadow, softShadow, tones, type Tone } from "../theme";
import { Tap } from "./Pressable";
import { initials } from "../lib/format";

export type IconName = keyof typeof Ionicons.glyphMap;

/* ───────── Text ───────── */
export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.h1, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.h2, style]}>{children}</Text>;
}
export function H3({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[st.h3, style]}>{children}</Text>;
}
export function Body({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[st.body, style]}>{children}</Text>;
}
export function Muted({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[st.muted, style]}>{children}</Text>;
}
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[st.label, style]}>{children}</Text>;
}

/* ───────── Motion ───────── */
export function Rise({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: 360, delay: Math.min(delay, 500), easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [delay, v]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/* ───────── Surfaces ───────── */
export function Card({ children, style, onPress, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  if (onPress) {
    return (
      <Tap onPress={onPress} scaleTo={0.98} style={[st.card, padded && st.cardPad, style]}>
        {children}
      </Tap>
    );
  }
  return <View style={[st.card, padded && st.cardPad, style]}>{children}</View>;
}

export function Section({ title, right, children, style }: { title?: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: S.xl }, style]}>
      {title || right ? (
        <View style={st.sectionHead}>
          {title ? <Text style={st.sectionTitle}>{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ children, style, gap = S.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: C.lineStrong, marginVertical: S.md }, style]} />;
}

/* ───────── Buttons ───────── */
type BtnVariant = "primary" | "accent" | "secondary" | "outline" | "danger" | "ghost" | "soft";
export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  small,
  full,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  full?: boolean;
}) {
  const fg =
    variant === "primary" || variant === "accent" || variant === "danger"
      ? C.white
      : variant === "outline" || variant === "ghost"
        ? C.primaryDeep
        : variant === "soft"
          ? C.accentDeep
          : C.ink;
  const inner = (
    <View style={[st.btnInner, small && st.btnSmall]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text numberOfLines={1} style={[st.btnText, small && { fontSize: 13 }, { color: fg }]}>
        {title}
      </Text>
    </View>
  );
  const base: StyleProp<ViewStyle> = [
    st.btn,
    full && { alignSelf: "stretch" },
    variant === "secondary" && { backgroundColor: C.card, borderWidth: 1, borderColor: C.lineStrong },
    variant === "outline" && { borderWidth: 1.5, borderColor: C.primary, backgroundColor: "transparent" },
    variant === "danger" && { backgroundColor: C.danger },
    variant === "ghost" && { backgroundColor: "transparent" },
    variant === "soft" && { backgroundColor: C.accentSoft },
    (variant === "primary" || variant === "accent") && softShadow,
    style,
  ];
  return (
    <Tap onPress={onPress} disabled={disabled || loading} style={base} accessibilityRole="button" accessibilityLabel={title}>
      {variant === "primary" || variant === "accent" ? (
        <LinearGradient
          pointerEvents="none"
          colors={variant === "primary" ? primaryGradient : accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {inner}
    </Tap>
  );
}

export function IconButton({
  icon,
  onPress,
  color = C.ink,
  bg = C.card,
  size = 40,
  label,
  badge,
  disabled,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  label: string;
  badge?: number;
  disabled?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
      {badge ? (
        <View style={st.badgeDot}>
          <Text style={st.badgeDotText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
    </Tap>
  );
}

export function Fab({ icon = "add", label, onPress }: { icon?: IconName; label: string; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Tap onPress={onPress} accessibilityLabel={label} style={[st.fab, shadow, { bottom: S.lg + Math.max(insets.bottom, 8) }]}>
      <LinearGradient colors={primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.fabInner}>
        <Ionicons name={icon} size={22} color={C.white} />
        <Text style={st.fabText}>{label}</Text>
      </LinearGradient>
    </Tap>
  );
}

/* ───────── Inputs ───────── */
export function Field({
  label,
  required,
  error,
  hint,
  icon,
  secure,
  style,
  right,
  ...props
}: TextInputProps & { label?: string; required?: boolean; error?: string | null; hint?: string; icon?: IconName; secure?: boolean; right?: ReactNode }) {
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(Boolean(secure));
  return (
    <View style={{ marginBottom: S.md }}>
      {label ? (
        <Text style={st.fieldLabel}>
          {label}
          {required ? <Text style={{ color: C.primary }}> *</Text> : null}
        </Text>
      ) : null}
      <View style={[st.inputWrap, focus && st.inputFocus, error ? { borderColor: C.danger } : null, props.multiline && { alignItems: "flex-start" }]}>
        {icon ? <Ionicons name={icon} size={18} color={focus ? C.primary : C.muted} style={{ marginRight: 8, marginTop: props.multiline ? 12 : 0 }} /> : null}
        <TextInput
          placeholderTextColor={C.faint}
          {...props}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocus(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            props.onBlur?.(e);
          }}
          style={[st.input, props.multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 12 }, style]}
        />
        {secure ? (
          <Tap onPress={() => setHidden((h) => !h)} hitSlop={8} accessibilityLabel={hidden ? "Show password" : "Hide password"}>
            <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color={C.muted} />
          </Tap>
        ) : null}
        {right}
      </View>
      {error ? <Text style={st.fieldError}>{error}</Text> : hint ? <Text style={st.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function SearchBar({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={[st.search, softShadow]}>
      <Ionicons name="search" size={18} color={C.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        style={st.searchInput}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value ? (
        <Tap onPress={() => onChange("")} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={C.faint} />
        </Tap>
      ) : null}
    </View>
  );
}

export function Toggle({ value, onChange, disabled, label, sub }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string; sub?: string }) {
  const sw = (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: C.line, true: C.primaryLight }}
      thumbColor={value ? C.primary : "#FFFFFF"}
      accessibilityLabel={label}
    />
  );
  if (!label) return sw;
  return (
    <View style={st.toggleRow}>
      <View style={{ flex: 1, paddingRight: S.md }}>
        <Text style={st.toggleLabel}>{label}</Text>
        {sub ? <Muted style={{ marginTop: 2 }}>{sub}</Muted> : null}
      </View>
      {sw}
    </View>
  );
}

export function Check({ checked, onPress, label }: { checked: boolean; onPress: () => void; label?: string }) {
  return (
    <Tap onPress={onPress} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} style={st.checkRow}>
      <View style={[st.check, checked && st.checkOn]}>{checked ? <Ionicons name="checkmark" size={15} color={C.white} /> : null}</View>
      {label ? <Text style={st.checkLabel}>{label}</Text> : null}
    </Tap>
  );
}

/** Two or three options side by side (like a switch between Photos / Signatures). */
export function Segmented<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={st.seg}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Tap key={it.key} onPress={() => onChange(it.key)} scaleTo={0.97} style={[st.segItem, on && st.segOn]} accessibilityState={{ selected: on }}>
            <Text style={[st.segText, on && { color: C.white }]} numberOfLines={1}>
              {it.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** A password that stays hidden (••••) until the eye is tapped. */
export function Secret({ value, style }: { value?: string | null; style?: StyleProp<TextStyle> }) {
  const [show, setShow] = useState(false);
  if (!value) return <Text style={style}>—</Text>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={[style, { flexShrink: 1 }]} numberOfLines={1} selectable={show}>
        {show ? value : "••••••••"}
      </Text>
      <Tap onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? "Hide password" : "Show password"}>
        <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color={C.muted} />
      </Tap>
    </View>
  );
}

/* ───────── Chips / tabs ───────── */
export function Chips<T extends string>({
  items,
  value,
  onChange,
  style,
}: {
  items: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingVertical: 2 }} style={style}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Tap key={it.key} onPress={() => onChange(it.key)} style={[st.chip, on && st.chipOn]} accessibilityState={{ selected: on }}>
            <Text style={[st.chipText, on && { color: C.white }]}>
              {it.label}
              {it.count !== undefined ? ` · ${it.count}` : ""}
            </Text>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

export function Pill({ text, tone = "orange", icon, style }: { text: string; tone?: Tone; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const t = tones[tone];
  return (
    <View style={[st.pill, { backgroundColor: t.bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Text style={[st.pillText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

/* ───────── Feedback ───────── */
export function Banner({ text, tone = "red", onClose }: { text?: string | null; tone?: Tone; onClose?: () => void }) {
  if (!text) return null;
  const t = tones[tone];
  const icon: IconName = tone === "green" ? "checkmark-circle" : tone === "red" ? "alert-circle" : "information-circle";
  return (
    <Rise>
      <View style={[st.banner, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={18} color={t.fg} />
        <Text style={[st.bannerText, { color: t.fg }]}>{text}</Text>
        {onClose ? (
          <Tap onPress={onClose} hitSlop={8} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={18} color={t.fg} />
          </Tap>
        ) : null}
      </View>
    </Rise>
  );
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <View style={st.center}>
      <ActivityIndicator color={C.primary} size="large" />
      <Muted style={{ marginTop: S.md }}>{text}</Muted>
    </View>
  );
}

export function Empty({ icon = "file-tray-outline", title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <Rise style={st.center}>
      <View style={st.emptyIcon}>
        <Ionicons name={icon} size={34} color={C.primary} />
      </View>
      <H3 style={{ textAlign: "center" }}>{title}</H3>
      {text ? <Muted style={{ textAlign: "center", marginTop: 6, maxWidth: 300 }}>{text}</Muted> : null}
      {action ? <View style={{ marginTop: S.lg }}>{action}</View> : null}
    </Rise>
  );
}

/* ───────── Data display ───────── */
export function Stat({ label, value, icon, tone = "orange", onPress, wide }: { label: string; value: string; icon: IconName; tone?: Tone; onPress?: () => void; wide?: boolean }) {
  const t = tones[tone];
  return (
    <Card onPress={onPress} style={[st.stat, wide && { flexBasis: "100%" }]}>
      <View style={[st.statIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={18} color={t.fg} />
      </View>
      <Text style={st.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={st.statLabel} numberOfLines={2}>
        {label}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={C.faint} style={{ position: "absolute", right: 12, top: 14 }} /> : null}
    </Card>
  );
}

export function InfoRow({ label, value, right }: { label: string; value?: string | null; right?: ReactNode }) {
  return (
    <View style={st.infoRow}>
      <View style={{ flex: 1 }}>
        <Text style={st.infoLabel}>{label}</Text>
        <Text style={st.infoValue} selectable>
          {value?.toString().trim() ? value : "—"}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function Avatar({ name, uri, size = 44, headers }: { name?: string | null; uri?: string | null; size?: number; headers?: Record<string, string> }) {
  if (uri) {
    return <Image source={{ uri, headers }} style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: C.primarySoft }} contentFit="cover" transition={150} />;
  }
  return (
    <LinearGradient colors={["#E0E7FF", "#EDE9FE"]} style={{ width: size, height: size, borderRadius: size / 3, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.h, color: C.primaryDeep, fontSize: size * 0.36 }}>{initials(name)}</Text>
    </LinearGradient>
  );
}

export function ListItem({
  title,
  subtitle,
  icon,
  tone = "orange",
  onPress,
  right,
  danger,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  tone?: Tone;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const t = tones[danger ? "red" : tone];
  return (
    <Tap onPress={onPress} scaleTo={0.985} style={st.listItem} accessibilityRole="button">
      {icon ? (
        <View style={[st.listIcon, { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={20} color={t.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[st.listTitle, danger && { color: C.danger }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Muted numberOfLines={2}>{subtitle}</Muted> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={C.faint} /> : null)}
    </Tap>
  );
}

const st = StyleSheet.create({
  h1: { fontFamily: F.hX, fontSize: 26, color: C.ink, letterSpacing: -0.4 },
  h2: { fontFamily: F.h, fontSize: 20, color: C.ink },
  h3: { fontFamily: F.hSemi, fontSize: 16, color: C.ink },
  body: { fontFamily: F.body, fontSize: 15, color: C.text, lineHeight: 21 },
  muted: { fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 18 },
  label: { fontFamily: F.bodySemi, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: "rgba(230,228,245,0.95)", ...softShadow },
  cardPad: { padding: S.lg },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.md },
  sectionTitle: { fontFamily: F.h, fontSize: 17, color: C.ink },
  btn: { borderRadius: R.md, backgroundColor: C.primary, overflow: "hidden" },
  btnInner: { minHeight: 48, paddingHorizontal: S.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnSmall: { minHeight: 38, paddingHorizontal: S.md },
  btnText: { fontFamily: F.hSemi, fontSize: 15 },
  badgeDot: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: C.white },
  badgeDotText: { color: C.white, fontSize: 10, fontFamily: F.bodySemi },
  fab: { position: "absolute", right: S.xl, bottom: S.xl, borderRadius: R.pill, overflow: "hidden" },
  fabInner: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, height: 52 },
  fabText: { color: C.white, fontFamily: F.hSemi, fontSize: 15 },
  fieldLabel: { fontFamily: F.bodySemi, fontSize: 13, color: C.text, marginBottom: 6 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, paddingHorizontal: S.md, minHeight: 50 },
  inputFocus: { borderColor: C.primary, backgroundColor: "#FBFBFF" },
  input: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 10 },
  fieldError: { color: C.danger, fontFamily: F.bodyMed, fontSize: 12, marginTop: 4 },
  fieldHint: { color: C.muted, fontFamily: F.body, fontSize: 12, marginTop: 4 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.white, borderRadius: R.pill, paddingHorizontal: S.lg, height: 46, borderWidth: 1, borderColor: C.line },
  searchInput: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: S.sm },
  toggleLabel: { fontFamily: F.bodySemi, fontSize: 15, color: C.ink },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: C.lineStrong, alignItems: "center", justifyContent: "center", backgroundColor: C.white },
  checkOn: { backgroundColor: C.primary, borderColor: C.primary },
  checkLabel: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink, flexShrink: 1 },
  seg: { flexDirection: "row", backgroundColor: C.white, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: 4, gap: 4, marginBottom: S.md },
  segItem: { flex: 1, minHeight: 40, borderRadius: R.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segOn: { backgroundColor: C.primary },
  segText: { fontFamily: F.bodySemi, fontSize: 14, color: C.text },
  chip: { paddingHorizontal: 16, height: 38, borderRadius: R.pill, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, justifyContent: "center" },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontFamily: F.bodySemi, fontSize: 13, color: C.text },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: R.pill, alignSelf: "flex-start" },
  pillText: { fontFamily: F.bodySemi, fontSize: 11 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: S.md, borderRadius: R.md, marginBottom: S.md },
  bannerText: { flex: 1, fontFamily: F.bodyMed, fontSize: 14, lineHeight: 19 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: S.xl },
  emptyIcon: { width: 76, height: 76, borderRadius: 26, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: S.lg },
  stat: { flexBasis: "47%", flexGrow: 1, minHeight: 116, padding: S.md },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: S.sm },
  statValue: { fontFamily: F.h, fontSize: 22, color: C.ink },
  statLabel: { fontFamily: F.bodyMed, fontSize: 12, color: C.muted, marginTop: 2 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, gap: S.md },
  infoLabel: { fontFamily: F.bodySemi, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink, marginTop: 2 },
  listItem: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: 12, paddingHorizontal: S.md, backgroundColor: C.surface, borderRadius: R.md, marginBottom: S.sm, borderWidth: 1, borderColor: "rgba(230,228,245,0.95)" },
  listIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  listTitle: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
});
