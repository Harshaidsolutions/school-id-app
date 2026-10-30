import { useRef, useState } from "react";
import api from "../api/client";

type Result = { file: string; status: string; reason?: string };
type Job = { status: "processing" | "done" | "failed"; total: number; processed: number; uploaded: number; skipped: number; failed: number; results: Result[]; error?: string };

const CHUNK = 8 * 1024 * 1024;
const MAX_ZIP = 500 * 1024 * 1024;

function errText(e: unknown, fallback: string) {
  const r = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return r || (e instanceof Error && e.message ? e.message : fallback);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)} MB`;

/**
 * Upload Photos: one or many ZIP files (up to 500 MB each) or single JPG/PNG images.
 * Each image is put on the record whose Photo Number equals the file name.
 * ZIPs are sent in 8 MB parts and processed on the server, so very large ZIPs work.
 */
export function PhotoImportModal({ orgId, kind, onClose, onComplete }: { orgId: string; kind: "school" | "institute"; onClose: () => void; onComplete: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ uploaded: number; skipped: number; failed: number } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const cancelled = useRef(false);

  async function uploadZip(file: File, label: string): Promise<Job> {
    const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const total = Math.max(1, Math.ceil(file.size / CHUNK));
    for (let i = 0; i < total; i += 1) {
      if (cancelled.current) throw new Error("Upload stopped.");
      const part = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
      let attempt = 0;
      for (;;) {
        try {
          await api.post(`/admin/photo-import/chunk`, part, {
            params: { uploadId, index: i, total },
            headers: { "Content-Type": "application/octet-stream" },
            timeout: 180000,
          });
          break;
        } catch (e) {
          attempt += 1;
          if (attempt >= 4) throw new Error(errText(e, "Upload failed. Check the internet and try again."));
          await sleep(1500 * attempt);
        }
      }
      setProgress(Math.round(((i + 1) / total) * 50));
      setStatus(`${label}: sending ${mb(Math.min(file.size, (i + 1) * CHUNK))} of ${mb(file.size)}…`);
    }
    const { data } = await api.post<{ jobId: string }>(`/admin/photo-import/finish`, { uploadId, orgId, kind, replace, fileName: file.name });
    for (;;) {
      await sleep(1500);
      const { data: s } = await api.get<{ job: Job }>(`/admin/photo-import/jobs/${data.jobId}`);
      const job = s.job;
      if (job.total) {
        setProgress(50 + Math.round((job.processed / job.total) * 50));
        setStatus(`${label}: matching photos ${job.processed} / ${job.total} (${job.uploaded} uploaded)…`);
      } else setStatus(`${label}: reading ZIP…`);
      if (job.status !== "processing") return job;
    }
  }

  async function start() {
    if (!files.length) return;
    cancelled.current = false;
    setBusy(true);
    setError("");
    setResults([]);
    setSummary(null);
    const sum = { uploaded: 0, skipped: 0, failed: 0 };
    const all: Result[] = [];
    try {
      for (let n = 0; n < files.length; n += 1) {
        const file = files[n];
        const label = files.length > 1 ? `File ${n + 1} of ${files.length}` : file.name;
        setProgress(0);
        if (/\.zip$/i.test(file.name)) {
          if (file.size > MAX_ZIP) {
            all.push({ file: file.name, status: "skipped", reason: "ZIP is larger than 500 MB — split it into smaller ZIPs" });
            sum.skipped += 1;
            continue;
          }
          const job = await uploadZip(file, label);
          if (job.status === "failed") {
            all.push({ file: file.name, status: "failed", reason: job.error ?? "ZIP could not be processed" });
            sum.failed += 1;
            continue;
          }
          sum.uploaded += job.uploaded;
          sum.skipped += job.skipped;
          sum.failed += job.failed;
          all.push(...job.results);
        } else {
          setStatus(`${label}: uploading…`);
          const form = new FormData();
          form.append("file", file);
          form.append("orgId", orgId);
          form.append("kind", kind);
          form.append("replace", String(replace));
          try {
            const r = await api.post<{ results: Result[] }>("/admin/photo-import", form, { timeout: 300000 });
            for (const x of r.data.results) {
              all.push(x);
              if (x.status === "uploaded") sum.uploaded += 1;
              else if (x.status === "skipped") sum.skipped += 1;
              else sum.failed += 1;
            }
          } catch (e) {
            all.push({ file: file.name, status: "failed", reason: errText(e, "Upload failed") });
            sum.failed += 1;
          }
        }
        setResults([...all]);
        setSummary({ ...sum });
      }
      setProgress(100);
      setStatus("Finished.");
      onComplete();
    } catch (e) {
      setError(errText(e, "Upload failed. Try again."));
    } finally {
      setResults([...all]);
      setSummary({ ...sum });
      setBusy(false);
    }
  }

  const problems = results.filter((r) => r.status !== "uploaded");
  return (
    <div className="modal-overlay">
      <section role="dialog" aria-modal="true" aria-labelledby="photo-import-title" className="card workflow-dialog w-full max-w-xl">
        <h2 id="photo-import-title">Upload photos</h2>
        <p>Name each image with its Photo Number, for example ADD_001.jpg. Each photo goes to the record with the same Photo Number. Existing photos are kept unless replacement is selected.</p>
        <p className="text-sm text-text-muted">ZIP files up to 500 MB each — you can choose several ZIPs, or upload more ZIPs later. JPG/PNG images up to 20 MB each.</p>
        <input
          aria-label="Photo ZIPs or images"
          type="file"
          multiple
          accept=".zip,.jpg,.jpeg,.png"
          disabled={busy}
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            setResults([]);
            setSummary(null);
            setStatus("");
            setProgress(0);
          }}
        />
        {files.length > 0 && !busy && !summary ? (
          <p className="text-sm text-text-muted">
            {files.length} file{files.length > 1 ? "s" : ""} selected · {mb(files.reduce((n, f) => n + f.size, 0))}
          </p>
        ) : null}
        <label>
          <input type="checkbox" checked={replace} disabled={busy} onChange={(e) => setReplace(e.target.checked)} /> Replace existing photos (returns them to uncropped)
        </label>
        {busy || progress > 0 ? (
          <div className="space-y-1" aria-live="polite">
            <div className="h-2 w-full overflow-hidden rounded-full bg-content-bg">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-text-muted">{status}</p>
          </div>
        ) : null}
        {error && <p role="alert" className="alert-error">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !files.length} onClick={() => void start()}>
            {busy ? "Uploading…" : "Upload"}
          </button>
          {busy ? (
            <button className="btn-secondary" onClick={() => (cancelled.current = true)}>
              Stop
            </button>
          ) : (
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        {summary ? (
          <div role="status" className="space-y-2">
            <p className="font-semibold">
              {summary.uploaded} uploaded · {summary.skipped} skipped · {summary.failed} failed
            </p>
            {problems.length > 0 ? (
              <ul className="max-h-60 overflow-y-auto text-sm">
                {problems.slice(0, 500).map((r, i) => (
                  <li key={i}>
                    {r.file}: {r.status}
                    {r.reason ? " — " + r.reason : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
