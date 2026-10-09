"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError, DocumentItem } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import Nav from "@/components/Nav";

const STATUS_STYLE: Record<DocumentItem["status"], string> = {
  uploaded: "bg-slate-100 text-slate-700",
  processing: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export default function DocumentsPage() {
  const user = useUser();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState("department");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await api<{ documents: DocumentItem[] }>("/documents");
    setDocuments(res.documents);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ documents: DocumentItem[] }>("/documents")
      .then((res) => {
        if (!cancelled) setDocuments(res.documents);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const pending = documents.some((d) => d.status === "uploaded" || d.status === "processing");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => load().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setMessage("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("visibility", visibility);
      await api("/documents", { method: "POST", body: form });
      setMessage("Uploaded. Processing will take a few seconds.");
      setTitle("");
      setFile(null);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  }

  const canUpload = user.role === "faculty" || user.role === "admin";
  const field = "rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Nav user={user} />
      <main className="mx-auto max-w-3xl space-y-6 p-4">
        {canUpload ? (
          <form onSubmit={upload} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Upload a PDF</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input className={`${field} flex-1`} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <select className={field} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="department">My department only</option>
                <option value="college">Whole college</option>
              </select>
            </div>
            <input type="file" accept="application/pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600" />
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
            <button type="submit" disabled={uploading || !file} className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </form>
        ) : (
          <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">Only faculty and admins can upload documents.</p>
        )}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">Documents</h2>
          {documents.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="text-xs text-slate-500">
                      {d.filename} · {d.visibility === "college" ? "whole college" : "department"}
                      {d.page_count ? ` · ${d.page_count} pages` : ""}
                    </p>
                    {d.error_message && <p className="text-xs text-red-600">{d.error_message}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
