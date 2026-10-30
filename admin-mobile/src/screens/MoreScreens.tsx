import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import api, { authedSource, errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { C, CONTENT_MAX, F, S, headerGradient } from "../theme";
import { Backdrop, Screen } from "../ui/Screen";
import { Avatar, Banner, Button, Card, InfoRow, ListItem, Muted, Rise, Section } from "../ui/kit";
import { PhotoPick } from "../ui/PhotoPick";
import { asFormFile, resetDownloadFolder, type PickedFile } from "../lib/files";
import { useNav } from "../navigation/hooks";

export function MoreScreen() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { user, isSuperAdmin, logout } = useAuth();
  const photo = authedSource(user?.photoUrl);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.hero, { paddingTop: insets.top + 18 }]}>
          <Rise>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, maxWidth: CONTENT_MAX, alignSelf: "center", width: "100%" }}>
              <Avatar name={user?.displayName || user?.username} uri={photo?.uri} headers={photo?.headers} size={60} />
              <View style={{ flex: 1 }}>
                <Text style={st.name} numberOfLines={1}>
                  {user?.displayName || user?.username || "Admin"}
                </Text>
                <Text style={st.email} numberOfLines={1}>
                  {user?.email}
                </Text>
                <Text style={st.role}>{isSuperAdmin ? "Super Admin" : "Admin"}</Text>
              </View>
            </View>
          </Rise>
        </LinearGradient>
        <View style={{ padding: S.lg, maxWidth: CONTENT_MAX, alignSelf: "center", width: "100%" }}>
          <Section title="Design" style={{ marginTop: 0 }}>
            <ListItem title="ID card templates" subtitle="Upload and manage card designs" icon="albums-outline" tone="purple" onPress={() => nav.navigate("Templates")} />
            <ListItem title="Models & tags" subtitle="ID card models and lanyard tags" icon="pricetags-outline" tone="orange" onPress={() => nav.navigate("Catalog", { kind: "model" })} />
            <ListItem title="Brochures" subtitle="Product brochures for schools" icon="book-outline" tone="teal" onPress={() => nav.navigate("Catalog", { kind: "brochure" })} />
            <ListItem title="ID card generator" subtitle="Generate cards for any school" icon="card-outline" tone="blue" onPress={() => nav.navigate("WebTool", { title: "ID card generator", path: "/id-card-generator" })} />
          </Section>
          <Section title="Communicate">
            <ListItem title="Notifications" subtitle="Send messages to the school app" icon="megaphone-outline" tone="teal" onPress={() => nav.navigate("Notifications")} />
            <ListItem title="Inbox" subtitle={isSuperAdmin ? "Registrations and requests" : "Messages from Harsha ID Solutions"} icon="mail-outline" tone="blue" onPress={() => nav.navigate("Inbox")} />
            <ListItem title="Instructions & enquiries" subtitle="School app instructions" icon="help-buoy-outline" tone="amber" onPress={() => nav.navigate("Help")} />
          </Section>
          {isSuperAdmin ? (
            <Section title="Super admin">
              <ListItem title="Admin management" subtitle="Partner and branch admins" icon="shield-checkmark-outline" tone="purple" onPress={() => nav.navigate("Admins")} />
              <ListItem title="Desktop licences" subtitle="Offline Windows generator keys" icon="key-outline" tone="orange" onPress={() => nav.navigate("Licences")} />
            </Section>
          ) : null}
          <Section title="Account">
            <ListItem title="My profile" subtitle="Photo and account details" icon="person-circle-outline" tone="blue" onPress={() => nav.navigate("Profile")} />
            <ListItem title="Open admin website" subtitle="myschoolidcard.in" icon="globe-outline" tone="grey" onPress={() => void Linking.openURL("https://myschoolidcard.in")} />
            <ListItem title="Privacy policy" icon="document-lock-outline" tone="grey" onPress={() => void Linking.openURL("https://harshaidsolutions.in/privacy-policy")} />
            <ListItem
              title="Log out"
              icon="log-out-outline"
              danger
              onPress={() =>
                Alert.alert("Log out?", "You will need your password to log in again.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Log out", style: "destructive", onPress: () => void logout() },
                ])
              }
            />
          </Section>
          <Muted style={{ textAlign: "center", marginTop: S.xl }}>My School ID Admin v{Constants.expoConfig?.version ?? ""} · Harsha ID Solutions</Muted>
        </View>
      </ScrollView>
    </View>
  );
}

export function ProfileScreen() {
  const { user, isSuperAdmin, updateUser, refreshProfile } = useAuth();
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      <Card>
        <InfoRow label="Name" value={user?.displayName} />
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
  hero: { paddingHorizontal: S.lg, paddingBottom: S.xl, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  name: { fontFamily: F.h, fontSize: 21, color: C.white },
  email: { fontFamily: F.body, fontSize: 13, color: "rgba(255,255,255,0.9)" },
  role: { fontFamily: F.bodySemi, fontSize: 12, color: C.white, marginTop: 4, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
});
