import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { C, F, R, S } from "../theme";
import { Tap } from "./Pressable";
import { Banner, Button, Field, Muted, SearchBar, type IconName } from "./kit";

/** Bottom sheet that slides up over the page. */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (visible) {
      y.setValue(1);
      Animated.timing(y, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [visible, y]);
  const maxH = Dimensions.get("window").height * 0.9;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={[st.sheet, { maxHeight: maxH, paddingBottom: insets.bottom + 12, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }) }] }]}
        >
          <View style={st.grabber} />
          {title ? (
            <View style={st.head}>
              <View style={{ flex: 1 }}>
                <Text style={st.title}>{title}</Text>
                {subtitle ? <Muted style={{ marginTop: 2 }}>{subtitle}</Muted> : null}
              </View>
              <Tap onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={st.close}>
                <Ionicons name="close" size={20} color={C.muted} />
              </Tap>
            </View>
          ) : null}
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: S.md }}>
              {children}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: S.lg, flexShrink: 1 }}>{children}</View>
          )}
          {footer ? <View style={st.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type Option = { value: string; label: string; sub?: string };

/** A tap-to-open dropdown that shows options in a bottom sheet. */
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  required,
  searchable,
}: {
  label?: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = options.find((o) => o.value === value);
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <View style={{ marginBottom: S.md }}>
      {label ? (
        <Text style={st.fieldLabel}>
          {label}
          {required ? <Text style={{ color: C.primary }}> *</Text> : null}
        </Text>
      ) : null}
      <Tap onPress={() => setOpen(true)} scaleTo={0.99} style={st.select} accessibilityRole="button" accessibilityLabel={label ?? placeholder}>
        <Text style={[st.selectText, !current && { color: C.faint }]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={C.muted} />
      </Tap>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder} scroll={false}>
        {searchable || options.length > 12 ? (
          <View style={{ marginBottom: S.md }}>
            <SearchBar value={q} onChange={setQ} />
          </View>
        ) : null}
        <FlatList
          data={list}
          keyExtractor={(o) => o.value}
          style={{ maxHeight: Dimensions.get("window").height * 0.55 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const on = item.value === value;
            return (
              <Tap
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                  setQ("");
                }}
                scaleTo={0.99}
                style={[st.option, on && st.optionOn]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[st.optionText, on && { color: C.primaryDeep }]}>{item.label}</Text>
                  {item.sub ? <Muted>{item.sub}</Muted> : null}
                </View>
                {on ? <Ionicons name="checkmark-circle" size={20} color={C.primary} /> : null}
              </Tap>
            );
          }}
          ListEmptyComponent={<Muted style={{ textAlign: "center", padding: S.lg }}>Nothing to choose.</Muted>}
        />
      </Sheet>
    </View>
  );
}

/** List of actions in a bottom sheet (like a long-press menu). */
export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: { label: string; icon: IconName; onPress: () => void; danger?: boolean; hidden?: boolean; sub?: string }[];
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {actions
        .filter((a) => !a.hidden)
        .map((a) => (
          <Tap
            key={a.label}
            scaleTo={0.985}
            onPress={() => {
              onClose();
              setTimeout(a.onPress, 220);
            }}
            style={st.action}
          >
            <View style={[st.actionIcon, a.danger && { backgroundColor: C.dangerSoft }]}>
              <Ionicons name={a.icon} size={20} color={a.danger ? C.danger : C.primaryDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.actionText, a.danger && { color: C.danger }]}>{a.label}</Text>
              {a.sub ? <Muted>{a.sub}</Muted> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.faint} />
          </Tap>
        ))}
    </Sheet>
  );
}

/**
 * Two-step OTP confirmation used for every delete / sensitive change:
 * 1) send code to the admin email, 2) enter the 6-digit code.
 */
export function OtpSheet({
  visible,
  title,
  description,
  confirmLabel = "Confirm",
  danger = true,
  onClose,
  onRequest,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onRequest: () => Promise<{ message?: string; devOtp?: string }>;
  onConfirm: (otp: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [otp, setOtp] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [dev, setDev] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) {
      setStep("request");
      setOtp("");
      setInfo(null);
      setDev(null);
      setError(null);
    }
  }, [visible]);
  async function request() {
    setBusy(true);
    setError(null);
    try {
      const r = await onRequest();
      setDev(r.devOtp ?? null);
      setInfo(r.message ?? "Verification code sent to your admin email.");
      setStep("confirm");
    } catch (e) {
      setError(errorText(e, "Could not send the code."));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(otp.trim());
      onClose();
    } catch (e) {
      setError(errorText(e, "Confirmation failed."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      visible={visible}
      onClose={() => !busy && onClose()}
      title={title}
      footer={
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <Button title="Cancel" variant="secondary" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          {step === "request" ? (
            <Button title="Send code" icon="mail-outline" onPress={() => void request()} loading={busy} style={{ flex: 1.4 }} />
          ) : (
            <Button title={confirmLabel} variant={danger ? "danger" : "primary"} onPress={() => void confirm()} loading={busy} style={{ flex: 1.4 }} />
          )}
        </View>
      }
    >
      <View style={[st.otpIcon, { backgroundColor: danger ? C.dangerSoft : C.accentSoft }]}>
        <Ionicons name={danger ? "trash-outline" : "shield-checkmark-outline"} size={28} color={danger ? C.danger : C.accent} />
      </View>
      <Muted style={{ textAlign: "center", marginBottom: S.lg, fontSize: 14 }}>{description}</Muted>
      <Banner text={error} />
      <Banner text={info} tone="green" />
      {dev ? <Banner text={`Test code: ${dev}`} tone="amber" /> : null}
      {step === "confirm" ? (
        <Field
          label="Verification code"
          value={otp}
          onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="6-digit code"
          autoFocus
          textContentType="oneTimeCode"
          style={{ letterSpacing: 6, fontFamily: F.h, fontSize: 20 }}
        />
      ) : (
        <Muted style={{ textAlign: "center" }}>For safety, we send a one-time code to your admin email first.</Muted>
      )}
    </Sheet>
  );
}

function errorText(e: unknown, fallback: string) {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax?.response?.data?.message ?? (e instanceof Error && e.message ? e.message : fallback);
}

/** Full-screen photo viewer with next / previous. */
export function ImageViewer({
  visible,
  onClose,
  items,
  index,
  onIndex,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  items: { title: string; sub?: string; source: { uri: string; headers?: Record<string, string> } | null }[];
  index: number;
  onIndex: (i: number) => void;
  actions?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const item = items[index];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[st.viewer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={st.viewerHead}>
          <View style={{ flex: 1 }}>
            <Text style={st.viewerTitle} numberOfLines={1}>
              {item?.title ?? ""}
            </Text>
            {item?.sub ? <Text style={st.viewerSub}>{item.sub}</Text> : null}
          </View>
          <Tap onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={st.viewerBtn}>
            <Ionicons name="close" size={22} color={C.white} />
          </Tap>
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          {item?.source ? (
            <Image source={item.source} style={{ width: "100%", height: "100%" }} contentFit="contain" transition={150} />
          ) : (
            <Text style={[st.viewerSub, { textAlign: "center" }]}>No image</Text>
          )}
        </View>
        <View style={st.viewerFoot}>
          <Tap onPress={() => onIndex(index - 1)} disabled={index <= 0} style={st.viewerBtn} accessibilityLabel="Previous">
            <Ionicons name="chevron-back" size={24} color={C.white} />
          </Tap>
          <Text style={st.viewerSub}>
            {items.length ? `${index + 1} / ${items.length}` : ""}
          </Text>
          <Tap onPress={() => onIndex(index + 1)} disabled={index >= items.length - 1} style={st.viewerBtn} accessibilityLabel="Next">
            <Ionicons name="chevron-forward" size={24} color={C.white} />
          </Tap>
        </View>
        {actions ? <View style={{ flexDirection: "row", gap: S.sm, paddingHorizontal: S.lg }}>{actions}</View> : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: C.lineStrong, marginBottom: 8 },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: S.lg, paddingBottom: S.md },
  title: { fontFamily: F.h, fontSize: 18, color: C.ink },
  close: { width: 34, height: 34, borderRadius: 12, backgroundColor: C.white, alignItems: "center", justifyContent: "center" },
  footer: { paddingHorizontal: S.lg, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.line },
  fieldLabel: { fontFamily: F.bodySemi, fontSize: 13, color: C.text, marginBottom: 6 },
  select: { flexDirection: "row", alignItems: "center", backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, paddingHorizontal: S.md, minHeight: 50 },
  selectText: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink },
  option: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: S.md, borderRadius: R.md, marginBottom: 4, backgroundColor: C.white },
  optionOn: { backgroundColor: C.primarySoft },
  optionText: { fontFamily: F.bodyMed, fontSize: 15, color: C.ink },
  action: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: 12, paddingHorizontal: S.sm, borderRadius: R.md, marginBottom: 4 },
  actionIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  actionText: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  otpIcon: { alignSelf: "center", width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: S.md },
  viewer: { flex: 1, backgroundColor: "rgba(10,8,6,0.96)" },
  viewerHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: S.lg, gap: S.md },
  viewerTitle: { fontFamily: F.hSemi, fontSize: 16, color: C.white },
  viewerSub: { fontFamily: F.body, fontSize: 13, color: "rgba(255,255,255,0.75)" },
  viewerBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  viewerFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.md },
});
