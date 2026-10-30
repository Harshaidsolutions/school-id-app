import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import api, { authedSource, errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { C, F, R, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Avatar, Banner, Button, Card, Empty, Field, InfoRow, Loading, Muted, Pill, Rise, SearchBar, Section, Toggle } from "../ui/kit";
import { ActionSheet, OtpSheet, Sheet } from "../ui/Sheet";
import { PhotoPick } from "../ui/PhotoPick";
import { Tap } from "../ui/Pressable";
import { asFormFile, type PickedFile } from "../lib/files";
import { fmtDate, num, waLink } from "../lib/format";
import { useNav } from "../navigation/hooks";
import type { ScreenProps } from "../navigation/types";

type Admin = {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  phone: string | null;
  whatsapp?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  about_us?: string | null;
  photo_url: string | null;
  is_super_admin: boolean;
  is_active: boolean;
  password_plain: string | null;
};
type FormState = { displayName: string; username: string; email: string; phone: string; whatsapp: string; facebook: string; instagram: string; youtube: string; aboutUs: string; password: string };
const EMPTY: FormState = { displayName: "", username: "", email: "", phone: "", whatsapp: "", facebook: "", instagram: "", youtube: "", aboutUs: "", password: "" };

export function AdminsScreen() {
  const { isSuperAdmin } = useAuth();
  const nav = useNav();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Admin | null>(null);
  const [editor, setEditor] = useState<{ admin: Admin | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Admin | null>(null);
  const [pwTarget, setPwTarget] = useState<{ admin: Admin; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ admins: Admin[] }>("/admin/managed-admins");
      setAdmins((data.admins ?? []).filter((a) => !a.is_super_admin).map((a) => ({ ...a, is_active: a.is_active !== false })));
      setError(null);
    } catch (e) {
      setError(errMsg(e, "Failed to load admins."));
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return admins.filter((a) => !q || [a.display_name, a.username, a.email, a.phone].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [admins, search]);

  async function toggle(a: Admin) {
    setBusyId(a.id);
    try {
      const { data } = await api.patch<{ admin: Admin }>(`/admin/managed-admins/${a.id}/active`, { isActive: !a.is_active });
      setAdmins((p) => p.map((x) => (x.id === a.id ? { ...x, is_active: data.admin.is_active !== false } : x)));
    } catch (e) {
      setError(errMsg(e, "Failed to update status."));
    } finally {
      setBusyId(null);
    }
  }

  if (!isSuperAdmin) {
    return (
      <Screen title="Admin Management">
        <Empty icon="lock-closed-outline" title="Super admin only" text="Only the super admin can manage admins." />
      </Screen>
    );
  }

  return (
    <Screen title="Admin Management" subtitle={`${admins.length} admins`} headerExtra={<SearchBar value={search} onChange={setSearch} placeholder="Search admins…" />} footer={<Button title="Create admin" icon="person-add-outline" onPress={() => setEditor({ admin: null })} />}>
      <Banner text={error} onClose={() => setError(null)} />
      <Banner text={notice} tone="green" onClose={() => setNotice(null)} />
      {loading ? (
        <Loading />
      ) : !list.length ? (
        <Empty icon="people-outline" title="No admins yet" text="Create an admin account for a partner or branch." />
      ) : (
        list.map((a, i) => (
          <Rise key={a.id} delay={Math.min(i, 8) * 40}>
            <Card style={{ marginBottom: S.md }} onPress={() => nav.navigate("AdminDetail", { id: a.id, name: a.display_name || a.username || a.email })}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                <Avatar name={a.display_name || a.username} uri={authedSource(a.photo_url)?.uri} headers={authedSource(a.photo_url)?.headers} size={50} />
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>
                    {a.display_name || a.username || a.email}
                  </Text>
                  <Muted numberOfLines={1}>{a.email}</Muted>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    <Pill text={a.is_active ? "Active" : "Inactive"} tone={a.is_active ? "green" : "grey"} />
                    {a.username ? <Pill text={`@${a.username}`} tone="blue" /> : null}
                  </View>
                </View>
                <Tap onPress={() => setMenu(a)} hitSlop={8} accessibilityLabel="More">
                  <Ionicons name="ellipsis-vertical" size={20} color={C.muted} />
                </Tap>
              </View>
              <View style={st.foot}>
                <Muted>{a.password_plain ? `Password: ${a.password_plain}` : a.phone ?? ""}</Muted>
                <Toggle value={a.is_active} disabled={busyId === a.id} onChange={() => void toggle(a)} />
              </View>
            </Card>
          </Rise>
        ))
      )}
      <ActionSheet
        visible={Boolean(menu)}
        onClose={() => setMenu(null)}
        title={menu?.display_name ?? menu?.email}
        actions={
          menu
            ? [
                { label: "View schools & institutes", icon: "stats-chart-outline", onPress: () => nav.navigate("AdminDetail", { id: menu.id, name: menu.display_name || menu.email }) },
                { label: "Edit details", icon: "create-outline", onPress: () => setEditor({ admin: menu }) },
                { label: "WhatsApp", icon: "logo-whatsapp", hidden: !(menu.whatsapp || menu.phone), onPress: () => void Linking.openURL(waLink(menu.whatsapp || menu.phone)) },
                { label: "Delete admin", icon: "trash-outline", danger: true, onPress: () => setDeleteTarget(menu) },
              ]
            : []
        }
      />
      <AdminEditor
        state={editor}
        onClose={() => setEditor(null)}
        onDone={(msg, pw) => {
          setEditor(null);
          setNotice(msg);
          void load();
          if (pw) setTimeout(() => setPwTarget(pw), 450);
        }}
      />
      <OtpSheet
        visible={Boolean(deleteTarget)}
        title="Delete admin"
        description={`Delete admin “${deleteTarget?.display_name ?? deleteTarget?.username ?? deleteTarget?.email ?? ""}”? This cannot be undone.`}
        confirmLabel="Delete admin"
        onClose={() => setDeleteTarget(null)}
        onRequest={async () => (await api.post(`/admin/managed-admins/${deleteTarget!.id}/request-delete-otp`)).data}
        onConfirm={async (otp) => {
          await api.post(`/admin/managed-admins/${deleteTarget!.id}/delete`, { otp });
          await load();
        }}
      />
      <OtpSheet
        visible={Boolean(pwTarget)}
        danger={false}
        title="Change password"
        description={`Set a new password for “${pwTarget?.admin.display_name ?? pwTarget?.admin.email ?? ""}”.`}
        confirmLabel="Change password"
        onClose={() => setPwTarget(null)}
        onRequest={async () => (await api.post(`/admin/managed-admins/${pwTarget!.admin.id}/request-password-otp`)).data}
        onConfirm={async (otp) => {
          await api.post(`/admin/managed-admins/${pwTarget!.admin.id}/password`, { otp, password: pwTarget!.password });
          setNotice("Password changed.");
          await load();
        }}
      />
    </Screen>
  );
}

function AdminEditor({ state, onClose, onDone }: { state: { admin: Admin | null } | null; onClose: () => void; onDone: (msg: string, pw?: { admin: Admin; password: string }) => void }) {
  const admin = state?.admin ?? null;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!state) return;
    setPhoto(null);
    setError(null);
    setForm(
      admin
        ? {
            displayName: admin.display_name ?? "",
            username: admin.username ?? "",
            email: admin.email,
            phone: admin.phone ?? "",
            whatsapp: admin.whatsapp ?? "",
            facebook: admin.facebook_url ?? "",
            instagram: admin.instagram_url ?? "",
            youtube: admin.youtube_url ?? "",
            aboutUs: admin.about_us ?? "",
            password: "",
          }
        : EMPTY
    );
  }, [state, admin]);
  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.displayName.trim() || !form.email.trim()) return setError("Name and email are required.");
    if (!admin && form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (admin && form.password && form.password.length < 8) return setError("New password must be at least 8 characters.");
    setBusy(true);
    setError(null);
    try {
      if (!admin) {
        const created = await api.post<{ admin: { id: string } }>("/admin/managed-admins", form);
        if (photo) {
          const body = new FormData();
          body.append("photo", asFormFile(photo));
          await api.post(`/admin/managed-admins/${created.data.admin.id}/photo`, body);
        }
        onDone("Admin created.");
      } else {
        const { password, ...rest } = form;
        await api.put(`/admin/managed-admins/${admin.id}`, rest);
        if (photo) {
          const body = new FormData();
          body.append("photo", asFormFile(photo));
          await api.post(`/admin/managed-admins/${admin.id}/photo`, body);
        }
        onDone("Admin saved.", password.trim().length >= 8 ? { admin, password } : undefined);
      }
    } catch (e) {
      setError(errMsg(e, "Could not save admin."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={Boolean(state)} onClose={onClose} title={admin ? "Edit admin" : "Create admin"} footer={<Button title={admin ? "Save" : "Create admin"} icon="checkmark" onPress={() => void save()} loading={busy} />}>
      <Banner text={error} />
      <PhotoPick label="Photo / logo" value={photo} onChange={setPhoto} current={authedSource(admin?.photo_url)} />
      <Field label="Admin / company name" required value={form.displayName} onChangeText={set("displayName")} />
      <Field label="Username" value={form.username} onChangeText={set("username")} autoCapitalize="none" />
      <Field label="Email" required value={form.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Phone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
      <Field label="WhatsApp" value={form.whatsapp} onChangeText={set("whatsapp")} keyboardType="phone-pad" />
      <Field label="Facebook link" value={form.facebook} onChangeText={set("facebook")} autoCapitalize="none" />
      <Field label="Instagram link" value={form.instagram} onChangeText={set("instagram")} autoCapitalize="none" />
      <Field label="YouTube link" value={form.youtube} onChangeText={set("youtube")} autoCapitalize="none" />
      <Field label="About us" value={form.aboutUs} onChangeText={set("aboutUs")} multiline />
      <Field label={admin ? "New password (optional)" : "Password"} required={!admin} value={form.password} onChangeText={set("password")} autoCapitalize="none" hint={admin ? "Changing the password needs a code from your email." : "At least 8 characters."} />
    </Sheet>
  );
}

type OrgRow = { id: string; name: string; username: string | null; password: string | null; created_at: string | null; people_count: number; captured_photos: number; pending_photos: number };

export function AdminDetailScreen({ route }: ScreenProps<"AdminDetail">) {
  const { id, name } = route.params;
  const [data, setData] = useState<{ admin: Record<string, string | boolean | null>; schools: OrgRow[]; institutes: OrgRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/managed-admins/${id}/overview`);
      setData(res.data);
    } catch (e) {
      setError(errMsg(e, "Could not load this admin."));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const a = data?.admin;
  const table = (title: string, people: string, rows: OrgRow[]) => (
    <Section title={`${title} (${rows.length})`}>
      {rows.length ? (
        rows.map((r) => (
          <Card key={r.id} style={{ marginBottom: S.sm }}>
            <Text style={st.name}>{r.name}</Text>
            <Muted>
              {r.username ?? "—"} · {r.password ?? "—"} · {fmtDate(r.created_at)}
            </Muted>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <Pill text={`${num(r.people_count)} ${people}`} tone="blue" />
              <Pill text={`${num(r.captured_photos)} captured`} tone="green" />
              <Pill text={`${num(r.pending_photos)} pending`} tone="amber" />
            </View>
          </Card>
        ))
      ) : (
        <Muted>None yet.</Muted>
      )}
    </Section>
  );
  return (
    <Screen title={name} subtitle="Admin overview" onRefresh={() => void load()} refreshing={false}>
      <Banner text={error} />
      {!data ? (
        <Loading />
      ) : (
        <>
          <Card>
            <InfoRow label="Admin / company name" value={String(a?.display_name ?? "")} />
            <InfoRow label="Email" value={String(a?.email ?? "")} />
            <InfoRow label="Phone" value={(a?.phone as string) ?? null} />
            <InfoRow label="WhatsApp" value={(a?.whatsapp as string) ?? null} />
            <InfoRow label="Facebook" value={(a?.facebook_url as string) ?? null} />
            <InfoRow label="Instagram" value={(a?.instagram_url as string) ?? null} />
            <InfoRow label="YouTube" value={(a?.youtube_url as string) ?? null} />
            <InfoRow label="About us" value={(a?.about_us as string) ?? null} />
            <InfoRow label="Status" value={a?.is_active === false ? "Inactive" : "Active"} />
          </Card>
          {table("Schools", "students", data.schools ?? [])}
          {table("Institutes", "members", data.institutes ?? [])}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  name: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.md, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: C.line },
});

void R;
