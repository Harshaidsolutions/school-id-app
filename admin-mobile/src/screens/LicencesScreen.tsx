import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import api, { errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { C, F, R, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Banner, Button, Card, Empty, Field, Loading, Muted, Pill, Rise, SearchBar, Stat } from "../ui/kit";
import { ActionSheet, Sheet } from "../ui/Sheet";
import { fmtDate, fmtDateTime, waLink } from "../lib/format";

type License = {
  id: string;
  licenseKey: string;
  customerName: string;
  phone: string;
  notes: string;
  machineBound: boolean;
  machineLabel: string | null;
  activatedAt: string | null;
  appVersion: string | null;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

const shareText = (l: License) =>
  `My School ID Card – Desktop ID Card Generator\n\nCustomer: ${l.customerName}\nLicence key: ${l.licenseKey}\n\n1. Install the app from the installer we sent.\n2. Connect to the internet once and open the app.\n3. Enter this licence key and press Activate.\nAfter activation the app works fully offline on this computer only.`;

export function LicencesScreen() {
  const { isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<License | null>(null);
  const [create, setCreate] = useState(false);
  const [created, setCreated] = useState<License | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ licenses: License[] }>("/admin/desktop-licenses");
      setRows(data.licenses ?? []);
      setError(null);
    } catch (e) {
      setError(errMsg(e, "Licences could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (isSuperAdmin) void load();
  }, [isSuperAdmin, load]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || [r.customerName, r.phone, r.licenseKey, r.machineLabel ?? ""].some((v) => v.toLowerCase().includes(q)));
  }, [rows, query]);

  async function act(l: License, action: "revoke" | "restore" | "reset-machine") {
    try {
      await api.post(`/admin/desktop-licenses/${l.id}/${action}`);
      setNotice(action === "reset-machine" ? "Unlinked. The customer can activate on a new PC." : action === "revoke" ? "Licence disabled." : "Licence enabled.");
      await load();
    } catch (e) {
      setError(errMsg(e, "Action failed."));
    }
  }
  function confirm(l: License, action: "revoke" | "restore" | "reset-machine" | "delete") {
    const msg =
      action === "reset-machine"
        ? "Unlink this licence from its computer? The customer can then activate it on a new computer."
        : action === "revoke"
          ? "Disable this licence? New activations will be refused."
          : action === "restore"
            ? "Enable this licence again?"
            : "Delete this licence permanently?";
    Alert.alert("Are you sure?", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes",
        style: action === "delete" || action === "revoke" ? "destructive" : "default",
        onPress: async () => {
          if (action !== "delete") return void act(l, action);
          try {
            await api.delete(`/admin/desktop-licenses/${l.id}`);
            await load();
          } catch (e) {
            setError(errMsg(e, "Delete failed."));
          }
        },
      },
    ]);
  }

  if (!isSuperAdmin) {
    return (
      <Screen title="Desktop licences">
        <Empty icon="lock-closed-outline" title="Super admin only" text="Only the super admin can manage desktop licences." />
      </Screen>
    );
  }

  return (
    <Screen title="Desktop licences" subtitle="Offline ID Card Generator for Windows" onRefresh={() => void load()} refreshing={false} footer={<Button title="Create licence key" icon="key-outline" onPress={() => setCreate(true)} />}>
      <Banner text={error} onClose={() => setError(null)} />
      <Banner text={notice} tone="green" onClose={() => setNotice(null)} />
      <Muted style={{ marginBottom: S.md }}>One key per customer computer. After one online activation the app works offline, and only on that computer.</Muted>
      <View style={{ flexDirection: "row", gap: S.sm, marginBottom: S.md }}>
        <Stat label="Total keys" value={String(rows.length)} icon="key-outline" tone="orange" />
        <Stat label="Active" value={String(rows.filter((r) => r.status === "active").length)} icon="checkmark-circle-outline" tone="green" />
        <Stat label="On a PC" value={String(rows.filter((r) => r.machineBound).length)} icon="desktop-outline" tone="blue" />
      </View>
      <SearchBar value={query} onChange={setQuery} placeholder="Search customer, key, PC…" />
      <View style={{ height: S.md }} />
      {loading ? (
        <Loading />
      ) : !list.length ? (
        <Empty icon="key-outline" title="No licence keys yet" text="Create one for each customer computer." />
      ) : (
        list.map((l, i) => (
          <Rise key={l.id} delay={Math.min(i, 8) * 30}>
            <Card style={{ marginBottom: S.md }} onPress={() => setMenu(l)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={st.name} numberOfLines={1}>
                  {l.customerName}
                </Text>
                <Pill text={l.status === "active" ? "Active" : "Disabled"} tone={l.status === "active" ? "green" : "red"} />
              </View>
              <Text style={st.key} selectable>
                {l.licenseKey}
              </Text>
              <Muted>
                {l.machineBound ? `💻 ${l.machineLabel || "Activated PC"} · ${fmtDateTime(l.activatedAt)}` : "Not activated yet"}
                {l.appVersion ? ` · v${l.appVersion}` : ""}
              </Muted>
              {l.expiresAt ? <Muted>Valid until {fmtDate(l.expiresAt)}</Muted> : null}
            </Card>
          </Rise>
        ))
      )}
      <ActionSheet
        visible={Boolean(menu)}
        onClose={() => setMenu(null)}
        title={menu?.customerName}
        actions={
          menu
            ? [
                { label: "Copy key", icon: "copy-outline", onPress: () => void Clipboard.setStringAsync(menu.licenseKey).then(() => setNotice("Key copied.")) },
                { label: "Send on WhatsApp", icon: "logo-whatsapp", onPress: () => void Linking.openURL(waLink(menu.phone, shareText(menu))) },
                { label: "Move to new PC", icon: "swap-horizontal-outline", hidden: !menu.machineBound, onPress: () => confirm(menu, "reset-machine") },
                { label: menu.status === "active" ? "Disable" : "Enable", icon: menu.status === "active" ? "pause-circle-outline" : "play-circle-outline", onPress: () => confirm(menu, menu.status === "active" ? "revoke" : "restore") },
                { label: "Delete", icon: "trash-outline", danger: true, onPress: () => confirm(menu, "delete") },
              ]
            : []
        }
      />
      <CreateSheet
        visible={create}
        onClose={() => setCreate(false)}
        onCreated={(l) => {
          setCreate(false);
          setCreated(l);
          void load();
        }}
      />
      <Sheet visible={Boolean(created)} onClose={() => setCreated(null)} title="Licence key created" subtitle={created?.customerName}>
        <View style={st.keyBox}>
          <Text style={st.bigKey} selectable>
            {created?.licenseKey}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <Button title="Copy key" variant="secondary" icon="copy-outline" style={{ flex: 1 }} onPress={() => created && void Clipboard.setStringAsync(created.licenseKey)} />
          <Button title="WhatsApp" icon="logo-whatsapp" style={{ flex: 1 }} onPress={() => created && void Linking.openURL(waLink(created.phone, shareText(created)))} />
        </View>
      </Sheet>
    </Screen>
  );
}

function CreateSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (l: License) => void }) {
  const [form, setForm] = useState({ customerName: "", phone: "", notes: "", expiresAt: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!form.customerName.trim()) return setError("Customer name is required.");
    if (form.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(form.expiresAt)) return setError("Expiry date must look like 2027-03-31.");
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ license: License }>("/admin/desktop-licenses", { ...form, expiresAt: form.expiresAt || null });
      setForm({ customerName: "", phone: "", notes: "", expiresAt: "" });
      onCreated(data.license);
    } catch (e) {
      setError(errMsg(e, "Licence could not be created."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Create licence key" footer={<Button title="Create key" icon="key" onPress={() => void save()} loading={busy} />}>
      <Banner text={error} />
      <Field label="Customer / school name" required value={form.customerName} onChangeText={(t) => setForm((f) => ({ ...f, customerName: t }))} maxLength={160} />
      <Field label="Phone" value={form.phone} onChangeText={(t) => setForm((f) => ({ ...f, phone: t }))} keyboardType="phone-pad" maxLength={30} />
      <Field label="Expiry date (optional)" placeholder="YYYY-MM-DD" value={form.expiresAt} onChangeText={(t) => setForm((f) => ({ ...f, expiresAt: t }))} hint="Recommended, e.g. one year from today." />
      <Field label="Notes" value={form.notes} onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))} multiline maxLength={1000} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  name: { flex: 1, fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  key: { fontFamily: F.h, fontSize: 14, color: C.accentDeep, letterSpacing: 1, marginVertical: 6 },
  keyBox: { backgroundColor: C.white, borderRadius: R.md, padding: S.lg, marginBottom: S.md, borderWidth: 1.5, borderColor: C.primaryLight, alignItems: "center" },
  bigKey: { fontFamily: F.h, fontSize: 16, color: C.ink, letterSpacing: 1, textAlign: "center" },
});
