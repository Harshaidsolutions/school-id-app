import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

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
  status: "active" | "revoked" | string;
  expiresAt: string | null;
  createdAt: string;
};

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const errText = (e: unknown, fallback: string) =>
  axios.isAxiosError(e) ? (e.response?.data as { message?: string } | undefined)?.message ?? fallback : fallback;

/** Super admin: create and manage licence keys for the offline Windows ID Card Generator. */
export function DesktopLicensesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ customerName: "", phone: "", notes: "", expiresAt: "" });
  const [created, setCreated] = useState<License | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ licenses: License[] }>("/admin/desktop-licenses");
      setRows(data.licenses);
    } catch (e) {
      setStatus(errText(e, "Licences could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (user?.isSuperAdmin !== true) {
    return <div className="app-page"><div className="card p-6">Only the super admin can manage desktop licences.</div></div>;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setStatus("");
    try {
      const { data } = await api.post<{ license: License }>("/admin/desktop-licenses", {
        customerName: form.customerName, phone: form.phone, notes: form.notes, expiresAt: form.expiresAt || null,
      });
      setCreated(data.license);
      setForm({ customerName: "", phone: "", notes: "", expiresAt: "" });
      await load();
    } catch (err) {
      setStatus(errText(err, "Licence could not be created."));
    } finally { setBusy(false); }
  }

  async function act(id: string, action: "revoke" | "restore" | "reset-machine") {
    const msg = action === "reset-machine"
      ? "Unlink this licence from its computer? The customer can then activate it on a new computer."
      : action === "revoke" ? "Disable this licence? New activations will be refused." : "Enable this licence again?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try { await api.post(`/admin/desktop-licenses/${id}/${action}`); await load(); }
    catch (err) { setStatus(errText(err, "Action failed.")); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this licence permanently?")) return;
    setBusy(true);
    try { await api.delete(`/admin/desktop-licenses/${id}`); await load(); }
    catch (err) { setStatus(errText(err, "Delete failed.")); }
    finally { setBusy(false); }
  }

  function shareText(l: License) {
    return `My School ID Card – Desktop ID Card Generator\n\nCustomer: ${l.customerName}\nLicence key: ${l.licenseKey}\n\n1. Install the app from the installer we sent.\n2. Connect to the internet once and open the app.\n3. Enter this licence key and press Activate.\nAfter activation the app works fully offline on this computer only.`;
  }

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    return !q || [r.customerName, r.phone, r.licenseKey, r.machineLabel ?? ""].some((v) => v.toLowerCase().includes(q));
  });
  const activeCount = rows.filter((r) => r.status === "active").length;
  const boundCount = rows.filter((r) => r.machineBound).length;

  return (
    <div className="app-page space-y-6 desktop-licenses">
      <section className="card p-6">
        <h2 className="text-lg font-bold">Offline ID Card Generator for Windows</h2>
        <p className="mt-1 text-sm text-text-muted">
          Create one licence key per customer computer. The customer enters it once (with internet) in the desktop app.
          The key then locks to that computer and the app works fully offline. A copied installer will not work on any other computer.
        </p>
        <div className="license-stats">
          <div><b>{rows.length}</b><span>Total keys</span></div>
          <div><b>{activeCount}</b><span>Active</span></div>
          <div><b>{boundCount}</b><span>Activated on a PC</span></div>
        </div>
      </section>

      <form className="card p-6 space-y-4" onSubmit={create}>
        <h2 className="text-lg font-bold">Create licence key</h2>
        <div className="license-form-grid">
          <label className="block">Customer / school name *
            <input className="input-field" required maxLength={160} value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
          </label>
          <label className="block">Phone
            <input className="input-field" maxLength={30} inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <label className="block">Expiry date (optional)
            <input className="input-field" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
          </label>
          <label className="block">Notes
            <input className="input-field" maxLength={1000} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy}>{busy ? "Working…" : "Create key"}</button>
          <p role="status" className="text-sm text-text-muted">{status}</p>
        </div>
        {created ? (
          <div className="license-created">
            <div>
              <span>New licence key for <b>{created.customerName}</b></span>
              <code>{created.licenseKey}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => void navigator.clipboard?.writeText(created.licenseKey)}>Copy key</button>
              <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/${created.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}?text=${encodeURIComponent(shareText(created))}`}>Send on WhatsApp</a>
            </div>
          </div>
        ) : null}
      </form>

      <section className="card p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h2 className="text-lg font-bold">Licence keys</h2>
          <input className="input-field max-w-xs" placeholder="Search customer, key, PC…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="list-table-scroll">
          <table className="list-data-table">
            <thead>
              <tr><th>Customer</th><th>Licence key</th><th>Computer</th><th>Activated</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6}>No licence keys yet — create one above.</td></tr>
              ) : filtered.map((l) => (
                <tr key={l.id}>
                  <td><div className="flex flex-col"><b>{l.customerName}</b><span className="text-xs text-text-muted">{l.phone}</span></div></td>
                  <td><code className="license-key">{l.licenseKey}</code></td>
                  <td>{l.machineBound ? (l.machineLabel || "Activated PC") : <span className="text-text-muted">Not activated yet</span>}</td>
                  <td>{fmt(l.activatedAt)}{l.appVersion ? <span className="text-xs text-text-muted"> · v{l.appVersion}</span> : null}</td>
                  <td>
                    <span className={`license-pill ${l.status === "active" ? "is-on" : "is-off"}`}>{l.status === "active" ? "Active" : "Disabled"}</span>
                    {l.expiresAt ? <span className="text-xs text-text-muted"> until {new Date(l.expiresAt).toLocaleDateString("en-IN")}</span> : null}
                  </td>
                  <td>
                    <div className="license-actions">
                      <button type="button" className="btn-secondary" onClick={() => void navigator.clipboard?.writeText(l.licenseKey)}>Copy</button>
                      {l.machineBound ? <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act(l.id, "reset-machine")}>Move to new PC</button> : null}
                      {l.status === "active"
                        ? <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act(l.id, "revoke")}>Disable</button>
                        : <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act(l.id, "restore")}>Enable</button>}
                      <button type="button" className="btn-danger-soft" disabled={busy} onClick={() => void remove(l.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
