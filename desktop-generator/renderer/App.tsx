import { useEffect, useState } from "react";
import { desktop, type LicenseStatus } from "./bridge";
import { DesktopGenerator } from "./DesktopGenerator";

/** Licence gate: nothing else opens until this computer holds a valid licence. */
export function App() {
  const [lic, setLic] = useState<LicenseStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void desktop().licenseStatus().then(setLic).catch(() => setLic({ licensed: false, machineLabel: "", reason: "The licence could not be checked." }));
    void desktop().info().then((i) => setVersion(i.version)).catch(() => undefined);
  }, []);

  if (!lic) return <div className="desk-splash"><img src="./logo.png" alt="My School ID Card" /></div>;
  if (lic.licensed) return <DesktopGenerator license={lic} />;

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await desktop().activate(key);
      if (r.ok && r.status) setLic(r.status);
      else setMsg(r.message ?? "Activation failed.");
    } catch {
      setMsg("Activation failed. Please try again.");
    } finally { setBusy(false); }
  }

  const formatted = (v: string) => {
    const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 25);
    return raw.replace(/(.{5})(?=.)/g, "$1-");
  };

  return (
    <div className="desk-activate">
      <div className="desk-orb a" /><div className="desk-orb b" />
      <form className="card desk-activate-card" onSubmit={activate}>
        <img className="desk-logo" src="./logo.png" alt="My School ID Card" />
        <h1>ID Card Generator</h1>
        <p className="desk-sub">Offline desktop edition</p>
        {lic.reason ? <div className="desk-alert">{lic.reason}</div> : null}
        <label className="block desk-key-label">
          Licence key
          <input
            className="input-field desk-key"
            value={key}
            onChange={(e) => setKey(formatted(e.target.value))}
            placeholder="MSIDC-XXXXX-XXXXX-XXXXX-XXXXX"
            autoFocus
            spellCheck={false}
          />
        </label>
        <button className="btn-primary desk-activate-btn" disabled={busy || key.replace(/-/g, "").length < 25}>{busy ? "Activating…" : "Activate this computer"}</button>
        {msg ? <p className="desk-error" role="alert">{msg}</p> : null}
        <ol className="desk-steps">
          <li>Get your licence key from Harsha ID Solutions.</li>
          <li>Connect to the internet <b>once</b> and press Activate.</li>
          <li>After that the app works fully offline — on this computer only.</li>
        </ol>
        <p className="desk-foot">This computer: {lic.machineLabel}{version ? ` · v${version}` : ""}<br />Support: 7799881779 · harshaidsolutions@gmail.com</p>
      </form>
    </div>
  );
}
