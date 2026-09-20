import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { ApiErrorBody } from "../types";

type ManagedAdmin = {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  phone: string | null;
  photo_url: string | null;
  is_super_admin: boolean;
};

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
    password: "",
  });

  if (!user?.isSuperAdmin) {
    return (
      <div className="app-page">
        <p className="text-text-muted">Super admin access is required.</p>
      </div>
    );
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ admins: ManagedAdmin[] }>(
        "/admin/managed-admins"
      );
      setAdmins(data.admins.filter((a) => !a.is_super_admin));
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
      await api.post("/admin/managed-admins", form);
      setForm({
        displayName: "",
        username: "",
        email: "",
        phone: "",
        password: "",
      });
      await load();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiErrorBody | undefined;
        setError(body?.message ?? "Failed to create admin.");
      } else setError("Failed to create admin.");
    }
  }

  return (
    <div className="app-page space-y-6">
      <h1 className="text-xl font-bold text-text-navy">Admin Management</h1>
      {error ? <div className="alert-error">{error}</div> : null}

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
              setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })
            }
            required
          />
          <input
            className="input-field sm:col-span-2"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
          />
        </div>
        <button type="submit" className="btn-primary">
          Create Admin
        </button>
      </form>

      <div className="card overflow-hidden">
        <table className="list-data-table w-full">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Username</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Phone</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-text-muted">
                  No managed admins yet.
                </td>
              </tr>
            ) : (
              admins.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2">{a.display_name ?? "—"}</td>
                  <td className="px-3 py-2">{a.username ?? "—"}</td>
                  <td className="px-3 py-2">{a.email}</td>
                  <td className="px-3 py-2">{a.phone ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
