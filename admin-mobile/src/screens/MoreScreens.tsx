import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import api, { authedSource, errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { C, CONTENT_MAX, F, S, headerGradient } from "../theme";
import { Backdrop, RainbowBar, Screen } from "../ui/Screen";
import { Avatar, Banner, Button, Card, Field, InfoRow, ListItem, Muted, Rise, Section, type IconName } from "../ui/kit";
import { Tap } from "../ui/Pressable";
import { Ionicons } from "@expo/vector-icons";
import { PhotoPick } from "../ui/PhotoPick";
import { LogoutModal } from "../ui/LogoutModal";
import { asFormFile, pickImages, resetDownloadFolder, type PickedFile } from "../lib/files";
import { useNav } from "../navigation/hooks";

/** Menu: same items, order and names as the admin website sidebar. */
export function MoreScreen() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { user, isSuperAdmin, logout, updateUser } = useAuth();
  const photo = authedSource(user?.photoUrl);
  const name = greetingName(user, isSuperAdmin);
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function changePhoto() {
    if (!isSuperAdmin || !user) return nav.navigate("Profile");
    const [f] = await pickImages(false);
    if (!f) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("photo", asFormFile(f));
      const { data } = await api.post<{ admin?: { photo_url?: string | null } }>(`/admin/managed-admins/${user.id}/photo`, form);
      updateUser({ photoUrl: data.admin?.photo_url ?? user.photoUrl });
    } catch (e) {
      Alert.alert("Photo not changed", errMsg(e, "Could not update the photo."));
    } finally {
      setBusy(false);
    }
  }

  const items: { title: string; icon: IconName; onPress: () => void; superOnly?: boolean }[] = [
    // Dashboard, Schools, Institutes and Notifications are the bottom tabs: not repeated here.
    { title: "Templates", icon: "albums-outline", onPress: () => nav.navigate("Templates") },
    { title: "Models", icon: "cube-outline", onPress: () => nav.navigate("Catalog", { kind: "model" }) },
    { title: "Brochures", icon: "book-outline", onPress: () => nav.navigate("Catalog", { kind: "brochure" }) },
    { title: "Registration Enquiries", icon: "help-circle-outline", onPress: () => nav.navigate("Help") },
    { title: "Admin Management", icon: "shield-checkmark-outline", onPress: () => nav.navigate("Admins"), superOnly: true },
    { title: "Generate Licences", icon: "key-outline", onPress: () => nav.navigate("Licences"), superOnly: true },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.hero, { paddingTop: insets.top + 18 }]}>
          <Rise>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, maxWidth: CONTENT_MAX, alignSelf: "center", width: "100%" }}>
              <Tap onPress={() => void changePhoto()} disabled={busy} accessibilityLabel="Change profile photo">
                <View style={{ borderRadius: 27, borderWidth: 2.5, borderColor: "rgba(255,255,255,0.9)", padding: 2 }}>
                  <Avatar name={name} uri={photo?.uri} headers={photo?.headers} size={72} />
                </View>
                {isSuperAdmin ? (
                  <View style={st.cam}>
                    <Ionicons name="camera" size={12} color={C.white} />
                  </View>
                ) : null}
              </Tap>
              <View style={{ flex: 1 }}>
                <Text style={st.hi}>Hi,</Text>
                <Text style={st.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={st.role}>{isSuperAdmin ? "Super Admin" : "Admin"}</Text>
              </View>
            </View>
          </Rise>
          <RainbowBar rounded style={{ position: "absolute", left: 22, right: 22, bottom: 3 }} />
        </LinearGradient>
        <View style={{ padding: S.lg, maxWidth: CONTENT_MAX, alignSelf: "center", width: "100%" }}>
          <View style={st.navCard}>
            {items
              .filter((i) => !i.superOnly || isSuperAdmin)
              .map((i, k) => (
                <Tap key={i.title} onPress={i.onPress} scaleTo={0.985} style={[st.navItem, k > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}>
                  <View style={st.navIcon}>
                    <Ionicons name={i.icon} size={20} color={C.primary} />
                  </View>
                  <Text style={st.navText}>{i.title}</Text>
                  <Ionicons name="chevron-forward" size={18} color={C.faint} />
                </Tap>
              ))}
          </View>
          <Section title="More">
            <ListItem title="My profile" icon="person-circle-outline" tone="blue" onPress={() => nav.navigate("Profile")} />
            <ListItem title="Privacy policy" icon="document-lock-outline" tone="grey" onPress={() => void Linking.openURL("https://harshaidsolutions.in/privacy-policy")} />
            <ListItem
              title="Logout"
              icon="log-out-outline"
              danger
              onPress={() => setConfirmLogout(true)}
            />
          </Section>
          <Muted style={{ textAlign: "center", marginTop: S.lg }}>My School ID Admin v{Constants.expoConfig?.version ?? ""} · Harsha ID Solutions</Muted>
        </View>
      </ScrollView>
      {/* Keeps scrolled content from showing under the phone's status bar. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: "#1E9BDD" }} />
      <LogoutModal
        visible={confirmLogout}
        name={name}
        photo={photo}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void logout();
        }}
      />
    </View>
  );
}

export function ProfileScreen() {
  const { user, isSuperAdmin, updateUser, refreshProfile } = useAuth();
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? (isSuperAdmin ? "Harsha ID Solutions" : ""));
  async function saveName() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put<{ displayName: string }>("/admin/me/display-name", { displayName });
      updateUser({ displayName: data.displayName });
      setNotice("Name saved. It now shows in the greeting.");
    } catch (e) {
      setError(errMsg(e, "Could not save the name."));
    } finally {
      setBusy(false);
    }
  }
  async function savePhoto() {
    if (!photo || !user) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", asFormFile(photo));
      const { data } = await api.post<{ admin?: { photo_url?: string | null } }>(`/admin/managed-admins/${user.id}/photo`, form);
      updateUser({ photoUrl: data.admin?.photo_url ?? user.photoUrl });
      setPhoto(null);
      setNotice("Profile photo updated.");
      void refreshProfile();
    } catch (e) {
      setError(errMsg(e, "Could not update the photo."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="My profile">
      <Banner text={error} onClose={() => setError(null)} />
      <Banner text={notice} tone="green" onClose={() => setNotice(null)} />
      {isSuperAdmin ? (
        <Card style={{ marginBottom: S.lg }}>
          <PhotoPick label="Profile photo" value={photo} onChange={setPhoto} current={authedSource(user?.photoUrl)} />
          {photo ? <Button title="Save photo" icon="checkmark" loading={busy} onPress={() => void savePhoto()} /> : null}
        </Card>
      ) : null}
      <Card style={{ marginBottom: S.lg }}>
        <Field label="Your name (shown in the greeting)" value={displayName} onChangeText={setDisplayName} icon="person-outline" placeholder="e.g. Harsha ID Solutions" />
        <Button title="Save name" icon="checkmark" loading={busy} disabled={!displayName.trim() || displayName.trim() === (user?.displayName ?? "")} onPress={() => void saveName()} />
      </Card>
      <Card>
        <InfoRow label="Username" value={user?.username} />
        <InfoRow label="Email" value={user?.email} />
        <InfoRow label="Phone" value={user?.phone} />
        <InfoRow label="Role" value={isSuperAdmin ? "Super Admin" : "Admin"} />
      </Card>
      <Section title="Downloads">
        <Card>
          <Muted style={{ marginBottom: S.md }}>Downloaded Excel, ZIP and photo files are saved in the folder you chose the first time (normally Downloads).</Muted>
          <Button title="Choose a different folder next time" variant="secondary" icon="folder-open-outline" onPress={() => void resetDownloadFolder().then(() => setNotice("You will be asked for a folder on the next download."))} />
        </Card>
      </Section>
      <Muted style={{ marginTop: S.lg }}>To change your password, use “Forgot password” on the login screen.</Muted>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: S.lg, paddingBottom: S.xl, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: "hidden" },
  hi: { fontFamily: F.bodyMed, fontSize: 12, color: "rgba(255,255,255,0.8)" },
  cam: { position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, borderWidth: 2, borderColor: C.white, alignItems: "center", justifyContent: "center" },
  navCard: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  navItem: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: 13, paddingHorizontal: S.lg },
  navIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  navText: { flex: 1, fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  name: { fontFamily: F.h, fontSize: 21, color: C.white },
  email: { fontFamily: F.body, fontSize: 13, color: "rgba(255,255,255,0.9)" },
  role: { fontFamily: F.bodySemi, fontSize: 12, color: C.white, marginTop: 4, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
});

/** The name in the greeting: the admin's own name; the super admin is "Harsha ID Solutions" until a name is set. */
export function greetingName(user: { displayName?: string | null; username?: string | null } | null | undefined, isSuperAdmin: boolean): string {
  return user?.displayName?.trim() || (isSuperAdmin ? "Harsha ID Solutions" : user?.username || "Admin");
}
