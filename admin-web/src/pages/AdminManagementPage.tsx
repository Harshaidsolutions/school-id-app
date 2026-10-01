import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import api from "../api/client";
import { OtpConfirmModal } from "../components/OtpConfirmModal";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { useAuth } from "../context/AuthContext";
import type { ApiErrorBody } from "../types";

type ManagedAdmin = {
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

type EditForm = {
  displayName: string;
  username: string;
  email: string;
  phone: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  youtube: string;
  aboutUs: string;
  password: string;
};

function ProfilePhotoField({
  previewUrl,
  fileName,
  onSelect,
  onClear,
  inlineActions = false,
}: {
  previewUrl: string | null;
  fileName: string | null;
  onSelect: (file: File | null) => void;
  onClear: () => void;
  inlineActions?: boolean;
}) {
  const chooseFile = (
    <label className="relative flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-white px-3 text-sm font-semibold text-text-navy">
      Choose File
      <input
        type="file"
        accept="image/jpeg,image/png"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
      />
    </label>
  );
  return (
    <div className="text-sm">
      <span className="mb-1.5 block font-medium text-text-navy">Profile photo</span>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Profile photo"
          className="mb-2 h-auto max-h-28 w-auto max-w-full rounded-lg bg-white object-contain"
        />
      ) : null}
      {inlineActions ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[8.5rem] flex-1 sm:flex-none">{chooseFile}</div>
          {previewUrl ? (
            <button
              type="button"
              className="inline-flex h-10 min-w-[8.5rem] flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-white px-3 text-sm font-semibold text-text-navy sm:flex-none"
              onClick={onClear}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : (
        chooseFile
      )}
      {fileName ? <p className="mt-1 text-xs text-text-muted">Selected: {fileName}</p> : null}
      {!inlineActions && previewUrl ? (
        <button type="button" className="mt-1 block text-xs text-danger" onClick={onClear}>
          Remove photo
        </button>
      ) : null}
    </div>
  );
}

export function AdminManagementPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    phone: "",
    whatsapp: "",
    facebook: "",
    instagram: "",
    youtube: "",
    aboutUs: "",
    password: "",
  });
  const [editTarget, setEditTarget] = useState<ManagedAdmin | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedAdmin | null>(null);
  const [passwordOtpTarget, setPasswordOtpTarget] = useState<ManagedAdmin | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPhoto, setCreatePhoto] = useState<File | null>(null);
  const [createPhotoPreview, setCreatePhotoPreview] = useState<string | null>(null);
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [removeEditPhoto, setRemoveEditPhoto] = useState(false);

  useEffect(() => {
    if (!createPhoto) {
      setCreatePhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(createPhoto);
    setCreatePhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [createPhoto]);

  useEffect(() => {
    if (!editPhoto) {
      setEditPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(editPhoto);
    setEditPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [editPhoto]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ admins: ManagedAdmin[] }>(
        "/admin/managed-admins"
      );
      setAdmins(
        data.admins
          .filter((a) => !a.is_super_admin)
          .map((a) => ({
            ...a,
            is_active: a.is_active !== false,
          }))
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to load admins.");
      } else setError("Failed to load admins.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.post<{ admin: { id: string } }>(
        "/admin/managed-admins",
        form
      );
      if (createPhoto) {
        const body = new FormData();
        body.append("photo", createPhoto);
        await api.post(`/admin/managed-admins/${created.data.admin.id}/photo`, body);
      }
      setCreatePhoto(null);
      setForm({
        displayName: "",
        username: "",
        email: "",
        phone: "",
        whatsapp: "",
        facebook: "",
        instagram: "",
        youtube: "",
        aboutUs: "",
        password: "",
      });
      setShowCreate(false);
      await load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to create admin.");
      } else setError("Failed to create admin.");
    }
  }

  function openEdit(admin: ManagedAdmin) {
    setEditPhoto(null);
    setRemoveEditPhoto(false);
    setEditTarget(admin);
    setEditForm({
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
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget || !editForm) return;
    setEditSaving(true);
    setError(null);
    try {
      await api.put(`/admin/managed-admins/${editTarget.id}`, {
        displayName: editForm.displayName,
        username: editForm.username,
        email: editForm.email,
        phone: editForm.phone,
        whatsapp: editForm.whatsapp,
        facebook: editForm.facebook,
        instagram: editForm.instagram,
        youtube: editForm.youtube,
        aboutUs: editForm.aboutUs,
      });
      if (editPhoto || removeEditPhoto) {
        const body = new FormData();
        if (editPhoto) body.append("photo", editPhoto);
        if (removeEditPhoto) body.append("remove", "true");
        await api.post(`/admin/managed-admins/${editTarget.id}/photo`, body);
      }
      setEditPhoto(null);
      setRemoveEditPhoto(false);
      if (editForm.password.trim().length >= 8) {
        setPasswordOtpTarget(editTarget);
        setNewPassword(editForm.password);
        setEditTarget(null);
        setEditForm(null);
      } else {
        setEditTarget(null);
        setEditForm(null);
        await load();
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to update admin.");
      } else setError("Failed to update admin.");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(admin: ManagedAdmin) {
    const next = !admin.is_active;
    setTogglingId(admin.id);
    try {
      const { data } = await api.patch<{ admin: ManagedAdmin }>(
        `/admin/managed-admins/${admin.id}/active`,
        { isActive: next }
      );
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === admin.id
            ? { ...a, is_active: data.admin.is_active !== false }
            : a
        )
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to update status.");
      } else setError("Failed to update status.");
    } finally {
      setTogglingId(null);
    }
  }

  if (!user?.isSuperAdmin) {
    return (
      <div className="app-page">
        <p className="text-text-muted">Super admin access is required.</p>
      </div>
    );
  }

  return (
    <div className="app-page space-y-6">
      {error ? <div className="alert-error">{error}</div> : null}
      <div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowCreate((open) => !open)}
        >
          {showCreate ? "Close" : "Create Admin"}
        </button>
      </div>

      {showCreate ? (
      <form onSubmit={(e) => void handleCreate(e)} className="card space-y-3 p-4">
        <h2 className="font-semibold text-text-navy">Create Admin</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className="input-field"
            placeholder="Admin name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
          />
          <input
            className="input-field"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
          <input
            className="input-field"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            className="input-field"
            placeholder="Phone (10 digits)"
            value={form.phone}
            maxLength={10}
            onChange={(e) =>
              setForm({
                ...form,
                phone: e.target.value.replace(/\D/g, "").slice(0, 10),
              })
            }
            required
          />
          <input
            className="input-field"
            placeholder="WhatsApp number"
            required
            minLength={10}
            value={form.whatsapp}
            onChange={(e) =>
              setForm({
                ...form,
                whatsapp: e.target.value.replace(/\D/g, "").slice(0, 15),
              })
            }
          />
          <input
            className="input-field"
            placeholder="Facebook URL (optional)"
            value={form.facebook}
            onChange={(e) => setForm({ ...form, facebook: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="Instagram URL (optional)"
            value={form.instagram}
            onChange={(e) => setForm({ ...form, instagram: e.target.value })}
          />
          <input
            className="input-field"
            placeholder="YouTube URL (optional)"
            value={form.youtube}
            onChange={(e) => setForm({ ...form, youtube: e.target.value })}
          />
          <textarea
            className="input-field sm:col-span-2"
            placeholder="About Us (optional)"
            rows={3}
            value={form.aboutUs}
            onChange={(e) => setForm({ ...form, aboutUs: e.target.value })}
          />
          <input
            className="input-field sm:col-span-2"
            type="text"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <div className="sm:col-span-2">
            <ProfilePhotoField
              previewUrl={createPhotoPreview}
              fileName={createPhoto?.name ?? null}
              onSelect={setCreatePhoto}
              onClear={() => setCreatePhoto(null)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            Create Admin
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowCreate(false)}
          >
            Cancel
          </button>
        </div>
      </form>
      ) : null}

      <div className="card overflow-hidden">
        <table className="list-data-table w-full">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Username</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Phone</th>
              <th className="px-3 py-2 text-left">Password</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  No managed admins yet.
                </td>
              </tr>
            ) : (
              admins.map((a) => (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <Link
                      className="font-semibold text-button-blue hover:underline"
                      to={`/extra-1/${a.id}`}
                    >
                      {a.display_name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{a.username ?? "—"}</td>
                  <td className="px-3 py-2">{a.email}</td>
                  <td className="px-3 py-2">{a.phone ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs break-all">
                    {a.password_plain ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-text-muted">
                        {a.is_active ? "ON" : "OFF"}
                      </span>
                      <ToggleSwitch
                        checked={a.is_active}
                        disabled={togglingId === a.id}
                        onChange={() => void toggleActive(a)}
                        label={`${a.display_name ?? a.username ?? "Admin"} status`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="text-sm text-button-blue hover:underline"
                        onClick={() => openEdit(a)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-sm text-danger hover:underline"
                        onClick={() => setDeleteTarget(a)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editTarget && editForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/40 px-4">
          <form
            onSubmit={(e) => void saveEdit(e)}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-text-navy">Edit Admin</h2>
            <div className="mt-4 space-y-3">
              <input
                className="input-field w-full"
                value={editForm.displayName}
                onChange={(e) =>
                  setEditForm({ ...editForm, displayName: e.target.value })
                }
                placeholder="Admin name"
                required
              />
              <input
                className="input-field w-full"
                value={editForm.username}
                onChange={(e) =>
                  setEditForm({ ...editForm, username: e.target.value })
                }
                placeholder="Username"
                required
              />
              <input
                className="input-field w-full"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
                placeholder="Email"
                required
              />
              <input
                className="input-field w-full"
                value={editForm.phone}
                maxLength={10}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                  })
                }
                placeholder="Phone"
                required
              />
              <input
                className="input-field w-full"
                value={editForm.whatsapp}
                required
                minLength={10}
                maxLength={15}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    whatsapp: e.target.value.replace(/\D/g, "").slice(0, 15),
                  })
                }
                placeholder="WhatsApp number"
              />
              <input
                className="input-field w-full"
                value={editForm.facebook}
                onChange={(e) => setEditForm({ ...editForm, facebook: e.target.value })}
                placeholder="Facebook URL (optional)"
              />
              <input
                className="input-field w-full"
                value={editForm.instagram}
                onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value })}
                placeholder="Instagram URL (optional)"
              />
              <input
                className="input-field w-full"
                value={editForm.youtube}
                onChange={(e) => setEditForm({ ...editForm, youtube: e.target.value })}
                placeholder="YouTube URL (optional)"
              />
              <textarea
                className="input-field w-full"
                rows={3}
                value={editForm.aboutUs}
                onChange={(e) => setEditForm({ ...editForm, aboutUs: e.target.value })}
                placeholder="About Us (optional)"
              />
              <input
                className="input-field w-full"
                type="text"
                value={editForm.password}
                onChange={(e) =>
                  setEditForm({ ...editForm, password: e.target.value })
                }
                placeholder="New password (optional, OTP required if set)"
                minLength={8}
                autoComplete="new-password"
              />
              <ProfilePhotoField
                inlineActions
                previewUrl={
                  editPhotoPreview ??
                  (editTarget.photo_url && !removeEditPhoto ? editTarget.photo_url : null)
                }
                fileName={editPhoto?.name ?? null}
                onSelect={(file) => {
                  setEditPhoto(file);
                  setRemoveEditPhoto(false);
                }}
                onClear={() => {
                  setEditPhoto(null);
                  setRemoveEditPhoto(true);
                }}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditTarget(null);
                  setEditForm(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={editSaving}>
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <OtpConfirmModal
          title="Delete admin"
          description={`Delete admin "${deleteTarget.display_name ?? deleteTarget.username ?? deleteTarget.email}"? This cannot be undone.`}
          confirmLabel="Delete admin"
          onClose={() => setDeleteTarget(null)}
          onRequestOtp={async () => {
            const { data } = await api.post<{ message?: string; devOtp?: string }>(
              `/admin/managed-admins/${deleteTarget.id}/request-delete-otp`
            );
            return data;
          }}
          onConfirm={async (otp) => {
            await api.post(`/admin/managed-admins/${deleteTarget.id}/delete`, {
              otp,
            });
            setDeleteTarget(null);
            await load();
          }}
        />
      ) : null}

      {passwordOtpTarget && newPassword.length >= 8 ? (
        <OtpConfirmModal
          title="Confirm password change"
          description={`Set a new password for "${passwordOtpTarget.display_name ?? passwordOtpTarget.username ?? passwordOtpTarget.email}".`}
          confirmLabel="Update password"
          danger={false}
          onClose={() => {
            setPasswordOtpTarget(null);
            setNewPassword("");
            void load();
          }}
          onRequestOtp={async () => {
            const { data } = await api.post<{ message?: string; devOtp?: string }>(
              `/admin/managed-admins/${passwordOtpTarget.id}/request-password-otp`
            );
            return data;
          }}
          onConfirm={async (otp) => {
            await api.post(`/admin/managed-admins/${passwordOtpTarget.id}/password`, {
              otp,
              password: newPassword,
            });
            setPasswordOtpTarget(null);
            setNewPassword("");
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
