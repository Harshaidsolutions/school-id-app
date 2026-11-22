import { useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api, { errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { C, F, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Banner, Button, Card, Loading, Muted, Section } from "../ui/kit";
import { Select } from "../ui/Sheet";
import { Tap } from "../ui/Pressable";
import { waLink } from "../lib/format";

/** Same guide as the website's "Guides for Admins" (shown to child admins only). */
const ADMIN_GUIDE = [
  "Open the correct school or institute. Check its name and academic year before making changes.",
  "Use Form Setup to choose fields. Check a small sample before uploading the full Excel file.",
  "Match each photo file name with the Photo Number in Excel. Do not use the student's name as the photo file name.",
  "Use the eye control to hide or show records in the school app. Hidden records are not deleted.",
  "In Cropping Tool, select an area and press OK to preview. Save to keep the change.",
  "Check recipients, text and image before sending a notification. A saved message only saves its wording.",
  "Do not share your login or OTP. Do not delete records without checking with the school. Contact the super admin if you are unsure.",
];

type Lead = { id: string; name: string; organization: string; phone: string; email: string; message: string; status: string; kind?: string };
const KIND_LABEL: Record<string, string> = { school: "School", institute: "Institute / College", provider: "ID card business / provider" };

export function HelpScreen() {
  const { isSuperAdmin } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    api
      .get("/admin/service-registrations")
      .then(({ data }) => setLeads(data.registrations ?? []))
      .catch((e) => setError(errMsg(e, "Registrations could not be loaded.")))
      .finally(() => setLoading(false));
  }, [isSuperAdmin]);

  async function deleteOne(id: string) {
    Alert.alert("Delete registration", "Remove this registration permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/admin/service-registrations/${id}`);
            setLeads((a) => a.filter((x) => x.id !== id));
          } catch (e) {
            setError(errMsg(e, "Could not delete registration."));
          }
        },
      },
    ]);
  }

  async function deleteAll() {
    if (!leads.length) return;
    Alert.alert("Delete all registrations", `Remove all ${leads.length} registrations permanently?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete all",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await api.delete("/admin/service-registrations", { data: { ids: leads.map((l) => l.id) } });
            setLeads([]);
          } catch (e) {
            setError(errMsg(e, "Could not delete registrations."));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <Screen
      title={isSuperAdmin ? "Registration Enquiries" : "Help"}
      headerExtra={
        isSuperAdmin && leads.length ? (
          <Button small variant="soft" icon="trash-outline" title="Delete all" loading={busy} onPress={() => void deleteAll()} />
        ) : undefined
      }
    >
      <Banner text={error} onClose={() => setError(null)} />
      {loading ? (
        <Loading />
      ) : !isSuperAdmin ? (
        <Section title="Guides for Admins">
          <Card>
            {ADMIN_GUIDE.map((g, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, marginBottom: i === ADMIN_GUIDE.length - 1 ? 0 : 10 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.h, fontSize: 12, color: C.primaryDeep }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.text }}>{g}</Text>
              </View>
            ))}
          </Card>
        </Section>
      ) : !leads.length ? (
        <Muted>No registrations yet.</Muted>
      ) : (
        leads.map((l) => (
          <Card key={l.id} style={{ marginBottom: S.md }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={st.name}>{l.name}</Text>
                <Muted>
                  {KIND_LABEL[l.kind ?? "school"] ?? "School"}
                  {l.organization ? ` · ${l.organization}` : ""}
                </Muted>
              </View>
              <Tap onPress={() => void deleteOne(l.id)} hitSlop={8} accessibilityLabel="Delete registration">
                <Ionicons name="trash-outline" size={20} color={C.danger} />
              </Tap>
            </View>
            {l.message ? <Text style={st.msg}>{l.message}</Text> : null}
            <View style={{ flexDirection: "row", gap: S.sm, marginVertical: S.sm }}>
              {l.phone ? <Button small variant="soft" icon="call-outline" title="Call" onPress={() => void Linking.openURL(`tel:${l.phone}`)} /> : null}
              {l.phone ? <Button small variant="soft" icon="logo-whatsapp" title="WhatsApp" onPress={() => void Linking.openURL(waLink(l.phone))} /> : null}
              {l.email ? <Button small variant="soft" icon="mail-outline" title="Email" onPress={() => void Linking.openURL(`mailto:${l.email}`)} /> : null}
            </View>
            <Select
              label="Status"
              value={l.status}
              onChange={async (v) => {
                try {
                  await api.patch(`/admin/service-registrations/${l.id}`, { status: v });
                  setLeads((a) => a.map((x) => (x.id === l.id ? { ...x, status: v } : x)));
                } catch (e) {
                  setError(errMsg(e, "Could not update registration status."));
                }
              }}
              options={[
                { value: "new", label: "New" },
                { value: "contacted", label: "Contacted" },
                { value: "closed", label: "Closed" },
              ]}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  name: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  msg: { fontFamily: F.body, fontSize: 14, color: C.text, marginTop: 6 },
});
