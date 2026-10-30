import { useCallback, useMemo, useState } from "react";
import { FlatList, Linking, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import api, { errMsg } from "../api/client";
import { C, CONTENT_MAX, F, R, S } from "../theme";
import { Backdrop, Header } from "../ui/Screen";
import { Avatar, Banner, Button, Check, Empty, Fab, Field, IconButton, Loading, Muted, Pill, Rise, SearchBar, Toggle } from "../ui/kit";
import { ActionSheet, OtpSheet, Sheet } from "../ui/Sheet";
import { Tap } from "../ui/Pressable";
import { fmtDate } from "../lib/format";
import { useNav } from "../navigation/hooks";

export type ListKind = "school" | "institute" | "organization";

type Org = {
  id: string;
  name: string;
  phone: string | null;
  username: string | null;
  password: string | null;
  created_at: string | null;
  is_active: boolean;
  protectedCapture: boolean;
};

const CFG = {
  school: { title: "Schools", one: "School", base: "/admin/schools", listKey: "schools", icon: "school" as const },
  institute: { title: "Institutes", one: "Institute", base: "/admin/institutes", listKey: "institutes", icon: "business" as const },
  organization: { title: "Organization", one: "Organization", base: "/admin/organizations", listKey: "organizations", icon: "briefcase" as const },
};

function normalize(kind: ListKind, raw: Record<string, unknown>): Org {
  const r = raw as Record<string, never>;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    phone: (r.phone as string | null) ?? null,
    username: kind === "organization" ? (r.username as string | null) : (r.owner_username as string | null) ?? null,
    password: kind === "organization" ? (r.password as string | null) : (r.owner_password as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
    is_active: r.is_active !== false,
    protectedCapture: r.allow_screenshot === false || r.allow_screen_recording === false,
  };
}

export function OrgListScreen({ kind, back = false }: { kind: ListKind; back?: boolean }) {
  const cfg = CFG[kind];
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [menu, setMenu] = useState<Org | null>(null);
  const [form, setForm] = useState<{ mode: "add" | "edit"; org?: Org } | null>(null);
  const [deleting, setDeleting] = useState<Org | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(cfg.base);
      const list = (data?.[cfg.listKey] ?? []) as Record<string, unknown>[];
      setRows(list.map((r) => normalize(kind, r)).sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()));
      setError(null);
    } catch (e) {
      setError(errMsg(e, `Failed to load ${cfg.title.toLowerCase()}.`));
    } finally {
      setLoading(false);
    }
  }, [cfg.base, cfg.listKey, cfg.title, kind]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.username, r.phone].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  async function toggleActive(org: Org) {
    setBusyId(org.id);
    try {
      const { data } = await api.patch(`${cfg.base}/${org.id}/active`, { is_active: !org.is_active });
      const saved = (data?.school ?? data?.institute ?? data?.organization)?.is_active;
      const next = saved === undefined ? !org.is_active : saved !== false;
      setRows((prev) => prev.map((r) => (r.id === org.id ? { ...r, is_active: next } : r)));
    } catch (e) {
      setError(errMsg(e, "Failed to update status."));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleCapture(org: Org) {
    const nextProtected = !org.protectedCapture;
    setBusyId(org.id);
    try {
      await api.patch(`${cfg.base}/${org.id}/capture`, {
        allow_screenshot: !nextProtected,
        allow_screen_recording: !nextProtected,
        screen_capture_protection: nextProtected,
      });
      setRows((prev) => prev.map((r) => (r.id === org.id ? { ...r, protectedCapture: nextProtected } : r)));
    } catch (e) {
      setError(errMsg(e, "Failed to update capture settings."));
    } finally {
      setBusyId(null);
    }
  }

  function open(org: Org) {
    if (selecting) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(org.id)) next.delete(org.id);
        else next.add(org.id);
        return next;
      });
      return;
    }
    if (kind === "organization") nav.navigate("OrgDetail", { id: org.id, name: org.name });
    else nav.navigate("Records", { kind, id: org.id, name: org.name });
  }

  const selectedIds = filtered.filter((r) => selected.has(r.id)).map((r) => r.id);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <Header
        title={cfg.title}
        subtitle={`${rows.length} total · ${rows.filter((r) => r.is_active).length} active`}
        back={back}
        right={
          rows.length ? (
            <IconButton
              icon={selecting ? "close" : "checkbox-outline"}
              label={selecting ? "Cancel selection" : "Select"}
              color={C.white}
              bg="rgba(255,255,255,0.22)"
              onPress={() => {
                setSelecting((s) => !s);
                setSelected(new Set());
              }}
            />
          ) : undefined
        }
      >
        <SearchBar value={search} onChange={setSearch} placeholder={`Search ${cfg.title.toLowerCase()}…`} />
      </Header>
      {selecting ? (
        <View style={st.selectBar}>
          <Check
            checked={filtered.length > 0 && selectedIds.length === filtered.length}
            onPress={() => setSelected(selectedIds.length === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)))}
            label={`${selectedIds.length} selected`}
          />
          <Button small variant="danger" icon="trash-outline" title="Delete" disabled={!selectedIds.length} onPress={() => setBulkOpen(true)} />
        </View>
      ) : null}
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 120, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              colors={[C.primary]}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListHeaderComponent={<Banner text={error} onClose={() => setError(null)} />}
          ListEmptyComponent={
            <Empty
              icon={`${cfg.icon}-outline` as never}
              title={search ? "No matches" : `No ${cfg.title.toLowerCase()} yet`}
              text={search ? "Try a different name, username or phone." : `Tap “Add ${cfg.one}” to create the first one.`}
            />
          }
          renderItem={({ item, index }) => {
            const on = selected.has(item.id);
            return (
              <Rise delay={Math.min(index, 8) * 40}>
                <Tap onPress={() => open(item)} onLongPress={() => setMenu(item)} scaleTo={0.985} style={[st.card, on && st.cardOn]}>
                  <View style={st.cardTop}>
                    {selecting ? <Check checked={on} onPress={() => open(item)} /> : <View style={st.sno}><Text style={st.snoText}>{index + 1}</Text></View>}
                    <View style={{ flex: 1 }}>
                      <Text style={st.name} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        <Pill text={item.is_active ? "Active" : "Inactive"} tone={item.is_active ? "green" : "grey"} />
                        {item.protectedCapture ? <Pill text="Capture protected" tone="purple" icon="shield-checkmark" /> : null}
                      </View>
                    </View>
                    {!selecting ? <IconButton icon="ellipsis-vertical" label="More actions" size={36} bg={C.primarySoft} color={C.primaryDeep} onPress={() => setMenu(item)} /> : null}
                  </View>
                  <View style={st.creds}>
                    <View style={st.cred}>
                      <Text style={st.credLabel}>Username</Text>
                      <Text style={st.credValue} numberOfLines={1} selectable>
                        {item.username ?? "—"}
                      </Text>
                    </View>
                    <View style={st.cred}>
                      <Text style={st.credLabel}>Password</Text>
                      <Text style={st.credValue} numberOfLines={1} selectable>
                        {item.password ?? "—"}
                      </Text>
                    </View>
                  </View>
                  <View style={st.metaRow}>
                    <Muted>
                      <Ionicons name="calendar-outline" size={12} color={C.muted} /> {fmtDate(item.created_at)}
                    </Muted>
                    {item.phone ? (
                      <Tap onPress={() => void Linking.openURL(`tel:${item.phone}`)} hitSlop={6}>
                        <Text style={st.phone}>
                          <Ionicons name="call-outline" size={12} color={C.accentDeep} /> {item.phone}
                        </Text>
                      </Tap>
                    ) : null}
                  </View>
                  {!selecting ? (
                    <View style={st.toggles}>
                      <View style={st.toggleBox}>
                        <Text style={st.toggleText}>Status</Text>
                        <Toggle value={item.is_active} disabled={busyId === item.id} onChange={() => void toggleActive(item)} />
                      </View>
                      <View style={st.toggleBox}>
                        <Text style={st.toggleText} numberOfLines={2}>Screen capture{"\n"}protection</Text>
                        <Toggle value={item.protectedCapture} disabled={busyId === item.id} onChange={() => void toggleCapture(item)} />
                      </View>
                    </View>
                  ) : null}
                  {!selecting ? (
                    <View style={st.actions}>
                      <Button small variant="soft" icon="people-outline" title={kind === "school" ? "Students" : kind === "institute" ? "Members" : "Records"} onPress={() => open(item)} style={{ flex: 1.3 }} />
                      <Button small variant="secondary" icon="create-outline" title="Edit" onPress={() => setForm({ mode: "edit", org: item })} style={{ flex: 1 }} />
                      <IconButton icon="trash-outline" label="Delete" size={38} bg={C.dangerSoft} color={C.danger} onPress={() => setDeleting(item)} />
                    </View>
                  ) : null}
                </Tap>
              </Rise>
            );
          }}
        />
      )}
      {!selecting ? <Fab label={`Add ${cfg.one}`} onPress={() => setForm({ mode: "add" })} /> : null}

      <ActionSheet
        visible={Boolean(menu)}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={
          menu
            ? [
                { label: kind === "organization" ? "Open records" : kind === "school" ? "Open students" : "Open members", icon: "people-outline", onPress: () => open(menu) },
                { label: kind === "school" ? "School Info" : kind === "institute" ? "Institution Info" : "Organization Info", icon: "information-circle-outline", onPress: () => nav.navigate("OrgInfo", { kind, id: menu.id, name: menu.name }) },
                { label: "Edit details & login", icon: "create-outline", onPress: () => setForm({ mode: "edit", org: menu }) },
                {
                  label: "Copy login details",
                  icon: "copy-outline",
                  onPress: () => void Clipboard.setStringAsync(`${menu.name}\nUsername: ${menu.username ?? ""}\nPassword: ${menu.password ?? ""}`),
                },
                { label: `Delete ${cfg.one.toLowerCase()}`, icon: "trash-outline", danger: true, onPress: () => setDeleting(menu) },
              ]
            : []
        }
      />

      <OrgFormSheet
        kind={kind}
        state={form}
        onClose={() => setForm(null)}
        onSaved={() => {
          setForm(null);
          void load();
        }}
      />

      <OtpSheet
        visible={Boolean(deleting)}
        title={`Delete ${cfg.one}`}
        description={`“${deleting?.name ?? ""}” and all its records, photos and related data will be permanently deleted.`}
        confirmLabel="Delete permanently"
        onClose={() => setDeleting(null)}
        onRequest={async () => (await api.post(`${cfg.base}/${deleting!.id}/request-delete-otp`)).data}
        onConfirm={async (otp) => {
          await api.delete(`${cfg.base}/${deleting!.id}`, { data: { otp } });
          const id = deleting!.id;
          setRows((p) => p.filter((r) => r.id !== id));
        }}
      />

      <OtpSheet
        visible={bulkOpen}
        title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? cfg.one.toLowerCase() : cfg.title.toLowerCase()}`}
        description="The selected items and all their related records will be permanently deleted."
        confirmLabel="Delete selected"
        onClose={() => setBulkOpen(false)}
        onRequest={async () => (await api.post(`${cfg.base}/bulk-delete/request-otp`, { ids: selectedIds })).data}
        onConfirm={async (otp) => {
          const { data } = await api.post<{ deleted?: string[] }>(`${cfg.base}/bulk-delete`, { ids: selectedIds, otp });
          const gone = new Set(data.deleted ?? selectedIds);
          setRows((p) => p.filter((r) => !gone.has(r.id)));
          setSelected(new Set());
          setSelecting(false);
        }}
      />
    </View>
  );
}

function OrgFormSheet({
  kind,
  state,
  onClose,
  onSaved,
}: {
  kind: ListKind;
  state: { mode: "add" | "edit"; org?: Org } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const cfg = CFG[kind];
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastKey, setLastKey] = useState("");
  const key = state ? `${state.mode}:${state.org?.id ?? "new"}` : "";
  if (key !== lastKey) {
    setLastKey(key);
    setName(state?.org?.name ?? "");
    setPhone(state?.org?.phone ?? "");
    setUsername(state?.org?.username ?? "");
    setPassword(state?.org?.password ?? "");
    setConfirm("");
    setError(null);
  }
  const isAdd = state?.mode === "add";

  async function save() {
    if (!name.trim() || !username.trim() || !password) return setError("Fill in all required fields.");
    if (isAdd && !phone.trim()) return setError("Phone number is required.");
    if (isAdd && password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      if (isAdd) {
        if (kind === "school") await api.post("/admin/schools-with-owner", { schoolName: name.trim(), phoneNumber: phone.trim(), ownerName: username.trim(), password, confirmPassword: confirm });
        else if (kind === "institute") await api.post("/admin/institutes-with-owner", { instituteName: name.trim(), phoneNumber: phone.trim(), ownerName: username.trim(), password, confirmPassword: confirm });
        else await api.post("/admin/organizations", { name: name.trim(), phone: phone.trim(), username: username.trim(), password, confirmPassword: confirm });
      } else if (state?.org) {
        if (kind === "organization") await api.patch(`${cfg.base}/${state.org.id}`, { name: name.trim(), phone: phone.trim(), username: username.trim(), password });
        else await api.put(`${cfg.base}/${state.org.id}`, { name: name.trim(), phone: phone.trim(), ownerUsername: username.trim(), ownerPassword: password });
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e, isAdd ? `Failed to add ${cfg.one.toLowerCase()}.` : `Failed to update ${cfg.one.toLowerCase()}.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={Boolean(state)}
      onClose={onClose}
      title={isAdd ? `Add ${cfg.one}` : `Edit ${cfg.one}`}
      subtitle={isAdd ? "The username and password are used to log in to the school app." : state?.org?.name}
      footer={<Button title={isAdd ? `Create ${cfg.one.toLowerCase()}` : "Save changes"} icon="checkmark" onPress={() => void save()} loading={busy} />}
    >
      <Banner text={error} />
      <Field label={`${cfg.one} name`} required value={name} onChangeText={setName} placeholder={`Enter ${cfg.one.toLowerCase()} name`} icon={`${cfg.icon}-outline` as never} />
      <Field label="Phone number" required={isAdd} value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" placeholder="10-digit mobile" />
      <Field label="Username" required value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} icon="person-outline" />
      <Field label="Password" required value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} icon="key-outline" />
      {isAdd ? <Field label="Confirm password" required value={confirm} onChangeText={setConfirm} autoCapitalize="none" autoCorrect={false} icon="key-outline" /> : null}
      <Muted>Passwords are shown so you can share them with the {cfg.one.toLowerCase()}.</Muted>
    </Sheet>
  );
}

const st = StyleSheet.create({
  selectBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.sm, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, borderWidth: 1, borderColor: "rgba(230,228,245,0.95)" },
  cardOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  cardTop: { flexDirection: "row", alignItems: "center", gap: S.md },
  name: { fontFamily: F.hSemi, fontSize: 16, color: C.ink },
  creds: { flexDirection: "row", gap: S.sm, marginTop: S.md },
  cred: { flex: 1, backgroundColor: C.white, borderRadius: R.sm, padding: 10, borderWidth: 1, borderColor: C.line },
  credLabel: { fontFamily: F.bodySemi, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  credValue: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink, marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: S.md },
  phone: { fontFamily: F.bodySemi, fontSize: 13, color: C.accentDeep },
  toggles: { flexDirection: "row", gap: S.sm, marginTop: S.md },
  toggleBox: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.white, borderRadius: R.sm, paddingLeft: 12, paddingRight: 4, borderWidth: 1, borderColor: C.line },
  toggleText: { fontFamily: F.bodySemi, fontSize: 12, color: C.text, flexShrink: 1 },
  sno: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  snoText: { fontFamily: F.h, fontSize: 15, color: C.primary },
  actions: { flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: S.md },
});
